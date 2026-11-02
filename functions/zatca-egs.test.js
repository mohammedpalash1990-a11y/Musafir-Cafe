'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSaleForZatca, isSha256Base64 } = require('./zatca-egs');

const settings = {
  cur: 'SAR',
  zatca: {
    enabled: true,
    sellerName: 'Musafir Cafe LLC',
    vatNumber: '312345678901233',
    street: 'King Road',
    building: '1234',
    district: 'Central',
    city: 'Madinah',
    postalCode: '42311'
  }
};
const sale = {
  total: 115,
  tax: 15,
  items: [{ name: 'Coffee', qty: 1, price: 100 }]
};

test('blocks a sale when seller profile is not enabled', () => {
  assert.equal(assessSaleForZatca(sale, { ...settings, zatca: { ...settings.zatca, enabled: false } }).status, 'blocked_profile');
});

test('marks refunds for credit-note workflow', () => {
  assert.equal(assessSaleForZatca({ ...sale, refund: true }, settings).status, 'credit_note_required');
});

test('requires SAR and transaction classification before EGS issuance', () => {
  const result = assessSaleForZatca(sale, settings);
  assert.equal(result.status, 'awaiting_egs_review');
  assert.ok(result.reasons.some((reason) => reason.includes('Standard (B2B)')));
});

test('rejects invalid invoice lines', () => {
  assert.equal(assessSaleForZatca({ ...sale, items: [{ name: '', qty: 0, price: -1 }] }, settings).status, 'manual_review');
});

test('accepts a Base64 SHA-256 digest and rejects hexadecimal form', () => {
  const digest = Buffer.alloc(32, 7).toString('base64');
  assert.equal(isSha256Base64(digest), true);
  assert.equal(isSha256Base64('a'.repeat(64)), false);
  assert.equal(isSha256Base64('not-a-hash'), false);
});

test('holds invoices when POS line VAT category and rate are missing', () => {
  const result = assessSaleForZatca(sale, settings);
  assert.ok(result.reasons.some((reason) => reason.includes('explicit ZATCA VAT category')));
});

test('detects inconsistent line subtotal and sale total arithmetic', () => {
  const result = assessSaleForZatca({
    ...sale,
    sub: 110,
    disc: 5,
    tax: 15,
    total: 115
  }, settings);
  assert.ok(result.reasons.some((reason) => reason.includes('line extension amounts')));
  assert.ok(result.reasons.some((reason) => reason.includes('does not reconcile with the sale total')));
});
