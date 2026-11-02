'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSha256Base64,
  validateSignedInvoicePayload,
  classifySubmissionOutcome
} = require('./zatca-invoice-validation');

const uuid = '7d9f2c4a-6b1e-4d8f-9a2c-1e5b7f3a9c20';
const hash = Buffer.alloc(32, 9).toString('base64');
function payload(xml) {
  return { uuid, invoiceHash: hash, invoice: Buffer.from(xml, 'utf8').toString('base64') };
}

test('accepts a UTF-8 UBL Invoice whose UUID matches the request', () => {
  const result = validateSignedInvoicePayload(payload(
    '<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:UUID>' + uuid + '</cbc:UUID></Invoice>'
  ));
  assert.equal(result.valid, true);
  assert.ok(result.byteLength > 0);
});

test('rejects UUID mismatch, DTD/entity declarations, and non-UBL roots', () => {
  assert.equal(validateSignedInvoicePayload(payload('<Invoice><UUID>00000000-0000-4000-8000-000000000000</UUID></Invoice>')).valid, false);
  assert.equal(validateSignedInvoicePayload(payload('<!DOCTYPE Invoice [<!ENTITY x "x">]><Invoice><UUID>' + uuid + '</UUID></Invoice>')).valid, false);
  assert.equal(validateSignedInvoicePayload(payload('<NotInvoice><UUID>' + uuid + '</UUID></NotInvoice>')).valid, false);
});

test('rejects malformed or non-canonical Base64 and invalid UTF-8', () => {
  assert.equal(validateSignedInvoicePayload({ uuid, invoiceHash: hash, invoice: 'a' }).valid, false);
  assert.equal(validateSignedInvoicePayload({ uuid, invoiceHash: hash, invoice: Buffer.from([0xff, 0xfe]).toString('base64') }).valid, false);
});

test('requires a canonical Base64 SHA-256 digest', () => {
  assert.equal(isSha256Base64(hash), true);
  assert.equal(isSha256Base64('a'.repeat(64)), false);
});

test('maps gateway responses without assuming acceptance', () => {
  assert.equal(classifySubmissionOutcome({ documentType: 'standard', responseData: { clearedInvoice: '<Invoice/>' } }), 'cleared');
  assert.equal(classifySubmissionOutcome({ documentType: 'standard', responseData: {} }), 'submitted');
  assert.equal(classifySubmissionOutcome({ documentType: 'simplified', responseData: { status: 'REPORTED' } }), 'reported');
});
