# Bulk Certificate Email Sender

A small self-hosted Node.js app for sending individualized PDF certificates to participants listed in a CSV file.

## Important limitation
There is no universal "lifetime free" email delivery service. SMTP providers impose quotas, authentication requirements, and acceptable-use policies. This app is designed for legitimate certificate distribution to expected recipients and does not bypass provider limits.

## Setup

1. Install Node.js 18+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set SMTP credentials. Never commit `.env`.
4. Run `npm start` and open `http://localhost:3000`.

Required environment variables: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. Optional settings include `SMTP_PORT`, `SMTP_SECURE`, `MAX_RECIPIENTS`, and `SEND_DELAY_MS`.

## CSV format

```csv
name,email
Asha Patel,asha@example.com
Jordan Lee,jordan@example.com
```

Accepted aliases include `full_name`, `participant_name`, `email_address`, and `recipient_email`. Invalid rows, duplicates, and malformed addresses are reported and skipped. Preview mode parses the file and shows the first personalized message without sending email.

## Safety and delivery behavior

- Each valid recipient receives a separate generated PDF attachment.
- Subject and body support `{{name}}` and `{{email}}`.
- The batch is capped by `MAX_RECIPIENTS` and pauses between messages using `SEND_DELAY_MS`.
- Provider failures are reported as failed; the app does not claim delivery when SMTP rejects a message.
- Use a provider account intended for this type of transactional or event-related communication and respect consent, unsubscribe, and provider rules.

Run tests with `npm test`.
