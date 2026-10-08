require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { parse } = require('csv-parse/sync');

const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const aliases = {
  name: ['name', 'full_name', 'fullname', 'participant', 'participant_name'],
  email: ['email', 'email_address', 'e-mail', 'recipient_email']
};

function normalize(value) { return String(value || '').trim(); }
function findColumn(headers, names) {
  return headers.find(h => names.includes(String(h).trim().toLowerCase()));
}
function parseRecipients(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
  if (!rows.length) return { recipients: [], errors: ['The CSV contains no data rows.'] };
  const headers = Object.keys(rows[0]);
  const nameColumn = findColumn(headers, aliases.name);
  const emailColumn = findColumn(headers, aliases.email);
  if (!nameColumn || !emailColumn) return { recipients: [], errors: ['CSV must include name and email columns. Accepted aliases: name/full_name and email/email_address.'] };

  const recipients = [], errors = [], seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 2;
    const name = normalize(row[nameColumn]);
    const email = normalize(row[emailColumn]).toLowerCase();
    if (!name || !email) { errors.push(`Row ${line}: name and email are required.`); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { errors.push(`Row ${line}: invalid email address.`); return; }
    if (seen.has(email)) { errors.push(`Row ${line}: duplicate email skipped (${email}).`); return; }
    seen.add(email); recipients.push({ name, email, row: line });
  });
  return { recipients, errors };
}
function renderText(template, recipient) {
  return String(template || '').replace(/\{\{\s*name\s*\}\}/gi, recipient.name).replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
}
function certificatePdf(name) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.rect(30, 30, 535, 782).lineWidth(3).stroke('#315a8a');
    doc.fontSize(28).fillColor('#315a8a').text('CERTIFICATE OF PARTICIPATION', 60, 170, { align: 'center', width: 475 });
    doc.fontSize(16).fillColor('#222').text('This certificate is proudly presented to', 60, 270, { align: 'center', width: 475 });
    doc.fontSize(34).fillColor('#111').text(name, 60, 325, { align: 'center', width: 475 });
    doc.fontSize(15).fillColor('#222').text('In recognition of valuable participation and contribution.', 60, 410, { align: 'center', width: 475 });
    doc.fontSize(11).fillColor('#555').text(new Date().toLocaleDateString(), 60, 660, { align: 'center', width: 475 });
    doc.end();
  });
}
function getTransporter() {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing email configuration: ${missing.join(', ')}`);
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

app.post('/api/preview', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file.' });
    const parsed = parseRecipients(req.file.buffer.toString('utf8'));
    const first = parsed.recipients[0];
    res.json({ ...parsed, preview: first ? { to: first.email, subject: renderText(req.body.subject || 'Your certificate', first), body: renderText(req.body.body || 'Hello {{name}},\n\nYour certificate is attached.', first) } : null });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/send', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file.' });
    const parsed = parseRecipients(req.file.buffer.toString('utf8'));
    const max = Number(process.env.MAX_RECIPIENTS || 100);
    if (parsed.recipients.length > max) return res.status(400).json({ error: `This installation allows at most ${max} recipients per batch.` });
    if (!parsed.recipients.length) return res.status(400).json({ error: 'No valid recipients found.', errors: parsed.errors });
    const transporter = getTransporter();
    const subject = req.body.subject || 'Your certificate';
    const body = req.body.body || 'Hello {{name}},\n\nYour certificate is attached. Congratulations!';
    const results = { sent: [], failed: [], skipped: parsed.errors };
    for (const recipient of parsed.recipients) {
      try {
        const pdf = await certificatePdf(recipient.name);
        await transporter.sendMail({ from: process.env.MAIL_FROM, to: recipient.email, subject: renderText(subject, recipient), text: renderText(body, recipient), attachments: [{ filename: `certificate-${recipient.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`, content: pdf, contentType: 'application/pdf' }] });
        results.sent.push(recipient.email);
      } catch (error) { results.failed.push({ email: recipient.email, error: error.message }); }
      await wait(Number(process.env.SEND_DELAY_MS || 500));
    }
    res.json(results);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

if (require.main === module) app.listen(Number(process.env.PORT || 3000), () => console.log(`Certificate sender listening on port ${process.env.PORT || 3000}`));
module.exports = { app, parseRecipients, renderText };
