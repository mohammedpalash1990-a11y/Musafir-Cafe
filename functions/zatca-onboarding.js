'use strict';

const OTP_RE = /^\\d{6}$/;
const MAX_CSR_BYTES = 32 * 1024;

function validateComplianceRequest({ otp, csr }) {
  const cleanOtp = String(otp || '').trim();
  if (!OTP_RE.test(cleanOtp)) return { valid: false, reason: 'OTP must be exactly 6 digits from the FATOORA portal.' };
  const encoded = String(csr || '').trim();
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return { valid: false, reason: 'CSR must be canonical Base64 containing a PEM-encoded PKCS#10 certificate request.' };
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_CSR_BYTES || bytes.toString('base64') !== encoded) return { valid: false, reason: 'CSR is empty, oversized, or not canonical Base64.' };
  const pem = bytes.toString('utf8');
  if (!pem.includes('-----BEGIN CERTIFICATE REQUEST-----') || !pem.includes('-----END CERTIFICATE REQUEST-----')) return { valid: false, reason: 'Decoded CSR must contain a PEM CERTIFICATE REQUEST block.' };
  return { valid: true, otp: cleanOtp, csr: encoded };
}

function extractCsidCredentials(data) {
  const value = data && typeof data === 'object' ? data : {};
  const token = value.binarySecurityToken || value.binary_security_token || value.BinarySecurityToken;
  const secret = value.secret || value.Secret;
  const requestId = value.requestID || value.requestId || value.request_id || value.RequestID;
  if (!token || !secret || !requestId) return { valid: false, reason: 'ZATCA response did not contain the expected CSID token, secret, and request ID.' };
  return { valid: true, token: String(token), secret: String(secret), requestId: String(requestId) };
}

function validateProductionRequest({ requestId }) {
  const clean = String(requestId || '').trim();
  if (!/^\\d{5,30}$/.test(clean)) return { valid: false, reason: 'A valid numeric compliance request ID is required.' };
  return { valid: true, requestId: clean };
}

module.exports = { validateComplianceRequest, extractCsidCredentials, validateProductionRequest };
