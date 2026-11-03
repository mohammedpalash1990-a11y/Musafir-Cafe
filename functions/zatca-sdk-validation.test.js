'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { isCanonicalSha256Base64, validateSdkValidation } = require('./zatca-sdk-validation');

const hash = crypto.createHash('sha256').update('signed invoice XML').digest('base64');
const base = {
  invoiceHash: hash,
  expectedHash: hash,
  sdkVersion: '3.4.4',
  result: 'PASS',
  evidence: 'Valid: true; Errors: 0; Warnings: 0'
};

test('records an SDK PASS only for the exact immutable invoice hash', () => {
  const record = validateSdkValidation(base);
  assert.equal(record.status, 'PASS');
  assert.equal(record.invoiceHash, hash);
  assert.equal(record.sdkVersion, '3.4.4');
  assert.equal(record.evidenceSha256.length, 64);
  assert.equal(record.evidenceSummary, base.evidence);
});

test('rejects malformed, mismatched or non-PASS SDK results', () => {
  assert.equal(isCanonicalSha256Base64(hash), true);
  assert.equal(isCanonicalSha256Base64('not-base64'), false);
  assert.throws(() => validateSdkValidation({ ...base, invoiceHash: crypto.randomBytes(32).toString('base64') }), /different invoice hash/);
  assert.throws(() => validateSdkValidation({ ...base, result: 'FAIL' }), /explicit official SDK PASS/);
  assert.throws(() => validateSdkValidation({ ...base, sdkVersion: '' }), /SDK version/);
  assert.throws(() => validateSdkValidation({ ...base, evidence: 'PASS' }), /summary/);
});
