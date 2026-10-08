const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRecipients, renderText } = require('../server');

test('parses valid CSV and aliases', () => {
  const result = parseRecipients('full_name,email_address\nAsha Patel,asha@example.com');
  assert.equal(result.recipients[0].name, 'Asha Patel');
  assert.equal(result.recipients[0].email, 'asha@example.com');
  assert.equal(result.errors.length, 0);
});

test('reports invalid and duplicate rows', () => {
  const result = parseRecipients('name,email\nAsha,asha@example.com\nBad,nope\nAsha 2,asha@example.com');
  assert.equal(result.recipients.length, 1);
  assert.equal(result.errors.length, 2);
});

test('personalizes templates', () => {
  assert.equal(renderText('Hello {{name}} ({{email}})', { name: 'Asha', email: 'a@example.com' }), 'Hello Asha (a@example.com)');
});
