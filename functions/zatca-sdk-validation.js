'use strict';
const crypto = require('node:crypto');

function isCanonicalSha256Base64(value) {
  const text = String(value || '').trim();
  const bytes = Buffer.from(text, 'base64');
  return bytes.length === 32 && bytes.toString('base64') === text;
}

function validateSdkValidation({ invoiceHash, expectedHash, sdkVersion, result, evidence }) {
  if (!isCanonicalSha256Base64(expectedHash)) {
    throw new Error('Stored invoice hash is not a canonical SHA-256 Base64 digest.');
  }
  if (!isCanonicalSha256Base64(invoiceHash)) {
    throw new Error('SDK validation must reference a canonical SHA-256 Base64 invoice hash.');
  }
  const supplied = Buffer.from(String(invoiceHash).trim(), 'base64');
  const expected = Buffer.from(String(expectedHash).trim(), 'base64');
  if (!crypto.timingSafeEqual(supplied, expected)) {
    throw new Error('SDK validation report is for a different invoice hash.');
  }
  if (String(result || '').trim() !== 'PASS') {
    throw new Error('Only an explicit official SDK PASS result can be recorded.');
  }
  const version = String(sdkVersion || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._+ -]{0,39}$/.test(version)) {
    throw new Error('Enter the official ZATCA SDK version (1-40 safe characters).');
  }
  const report = String(evidence || '').trim();
  if (report.length < 10 || report.length > 8000 || /\u0000/.test(report)) {
    throw new Error('Paste the official SDK PASS summary (10-8000 characters).');
  }
  return {
    status: 'PASS',
    invoiceHash: String(expectedHash).trim(),
    sdkVersion: version,
    evidenceSha256: crypto.createHash('sha256').update(report, 'utf8').digest('hex'),
    evidenceSummary: report.slice(0, 500)
  };
}

module.exports = { isCanonicalSha256Base64, validateSdkValidation };
