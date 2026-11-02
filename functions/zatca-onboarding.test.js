'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateComplianceRequest, extractCsidCredentials, validateProductionRequest } = require('./zatca-onboarding');
const csr = Buffer.from('-----BEGIN CERTIFICATE REQUEST-----\\nMIIB...\\n-----END CERTIFICATE REQUEST-----\\n').toString('base64');

test('compliance request requires a six digit OTP and PEM CSR', () => {
  assert.equal(validateComplianceRequest({ otp: '123456', csr }).valid, true);
  assert.equal(validateComplianceRequest({ otp: '12345', csr }).valid, false);
  assert.equal(validateComplianceRequest({ otp: '123456', csr: 'bm90LWEtY3Ny' }).valid, false);
});

test('compliance CSR must be canonical base64 and size limited', () => {
  assert.equal(validateComplianceRequest({ otp: '123456', csr: '%%%'}).valid, false);
  const huge = Buffer.from('-----BEGIN CERTIFICATE REQUEST-----' + 'x'.repeat(40000) + '-----END CERTIFICATE REQUEST-----').toString('base64');
  assert.equal(validateComplianceRequest({ otp: '123456', csr: huge }).valid, false);
});

test('CSID response parser requires token, secret and request ID', () => {
  assert.deepEqual(extractCsidCredentials({ binarySecurityToken: 'token', secret: 'secret', requestID: 123 }), { valid: true, token: 'token', secret: 'secret', requestId: '123' });
  assert.equal(extractCsidCredentials({ binarySecurityToken: 'token' }).valid, false);
});

test('production CSID requires a numeric compliance request ID', () => {
  assert.equal(validateProductionRequest({ requestId: '1727863119677' }).valid, true);
  assert.equal(validateProductionRequest({ requestId: 'abc' }).valid, false);
});
