'use strict';

const MAX_INVOICE_BYTES = 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_BASE64_RE = /^[A-Za-z0-9+/]{43}=$/;

function isSha256Base64(value) {
  if (!SHA256_BASE64_RE.test(String(value || ''))) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}

/**
 * Performs transport-level checks only. This is deliberately not represented
 * as UBL, XAdES, invoice-hash, or ZATCA SDK compliance validation.
 */
function validateSignedInvoicePayload({ uuid, invoiceHash, invoice }) {
  if (!UUID_RE.test(String(uuid || ''))) {
    return { valid: false, reason: 'A valid invoice UUID is required.' };
  }
  const encoded = String(invoice || '');
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return { valid: false, reason: 'Invoice must be canonical Base64.' };
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_INVOICE_BYTES || bytes.toString('base64') !== encoded) {
    return { valid: false, reason: 'Invoice must decode to a non-empty XML document no larger than 1 MiB.' };
  }
  if (!isSha256Base64(String(invoiceHash || ''))) {
    return { valid: false, reason: 'invoiceHash must be a Base64-encoded 32-byte SHA-256 digest.' };
  }

  let xml;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (_) {
    return { valid: false, reason: 'Invoice XML must be valid UTF-8.' };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { valid: false, reason: 'DTD and ENTITY declarations are forbidden.' };
  }
  const root = /<(?:[A-Za-z_][\w.-]*:)?Invoice(?:\s|>)/i;
  if (!root.test(xml)) {
    return { valid: false, reason: 'A UBL Invoice XML root element is required.' };
  }
  const uuidMatch = xml.match(/<(?:[A-Za-z_][\w.-]*:)?UUID\b[^>]*>\s*([^<]+?)\s*<\/(?:[A-Za-z_][\w.-]*:)?UUID\s*>/i);
  if (!uuidMatch || uuidMatch[1].trim().toLowerCase() !== String(uuid).toLowerCase()) {
    return { valid: false, reason: 'The invoice XML UUID must match the submitted UUID.' };
  }
  return { valid: true, xml, byteLength: bytes.length };
}

function classifySubmissionOutcome({ documentType, responseData }) {
  if (documentType === 'standard') {
    return responseData && responseData.clearedInvoice ? 'cleared' : 'submitted';
  }
  return String(responseData && responseData.status || '').toLowerCase() === 'reported'
    ? 'reported'
    : 'submitted';
}

module.exports = {
  isSha256Base64,
  validateSignedInvoicePayload,
  classifySubmissionOutcome,
  MAX_INVOICE_BYTES
};
