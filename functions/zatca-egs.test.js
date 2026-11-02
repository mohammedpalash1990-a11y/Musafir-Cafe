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

test('reconciles per-line VAT category/rate against the POS VAT total', () => {
  const vatSale = {
    ...sale,
    sub: 100,
    disc: 0,
    tax: 15,
    total: 115,
    items: [{ name: 'Coffee', qty: 1, price: 100, zatcaVatCategory: 'S', zatcaVatRate: 15 }]
  };
  const valid = assessSaleForZatca(vatSale, settings);
  assert.ok(!valid.reasons.some((reason) => reason.includes('per-line categories and rates')));
  const invalid = assessSaleForZatca({ ...vatSale, tax: 10, total: 110 }, settings);
  assert.ok(invalid.reasons.some((reason) => reason.includes('per-line categories and rates')));
});

test('rejects non-zero VAT rates on zero-rated, exempt or out-of-scope lines', () => {
  const result = assessSaleForZatca({
    ...sale,
    sub: 100,
    disc: 0,
    tax: 5,
    total: 105,
    items: [{ name: 'Coffee', qty: 1, price: 100, zatcaVatCategory: 'Z', zatcaVatRate: 5 }]
  }, settings);
  assert.ok(result.reasons.some((reason) => reason.includes('must use a zero VAT rate')));
});

test('requires per-transaction invoice classification and Standard buyer VAT/address', () => {
  const base = {
    ...sale,
    sub: 100,
    disc: 0,
    tax: 15,
    total: 115,
    items: [{ name: 'Coffee', qty: 1, price: 100, zatcaVatCategory: 'S', zatcaVatRate: 15 }]
  };
  const missingType = assessSaleForZatca(base, settings);
  assert.ok(missingType.reasons.some((reason) => reason.includes('Select Standard (B2B) or Simplified (B2C)')));
  const missingBuyer = assessSaleForZatca({ ...base, zatca: { documentType: 'standard', buyer: {} } }, settings);
  assert.ok(missingBuyer.reasons.some((reason) => reason.includes('Complete Standard invoice buyer details')));
  const standardReady = assessSaleForZatca({
    ...base,
    zatca: { documentType: 'standard', buyer: {
      name: 'Business Buyer', vatNumber: '312345678901233',
      street: 'Market Road', building: '1234', district: 'Central',
      city: 'Madinah', postalCode: '42311'
    } }
  }, settings);
  assert.equal(standardReady.documentType, 'standard');
  assert.ok(!standardReady.reasons.some((reason) => reason.includes('Complete Standard invoice buyer details')));
});

test('reconciles VAT-inclusive 9.90 SAR sale with 1.29 SAR embedded VAT', () => {
  const inclusiveSale = {
    sub: 9.90, disc: 0, tax: 1.29, total: 9.90,
    vatInclusive: true, vatEnabled: true, vatRate: 15,
    zatca: { documentType: 'simplified' },
    items: [{ name: 'Coffee', qty: 1, price: 9.90, zatcaVatCategory: 'S', zatcaVatRate: 15 }]
  };
  const result = assessSaleForZatca(inclusiveSale, settings);
  assert.ok(!result.reasons.some((reason) => reason.includes('does not reconcile with the sale total')));
  assert.ok(!result.reasons.some((reason) => reason.includes('Calculated VAT from the per-line categories')));
});

test('reconciles VAT-inclusive discount using the embedded VAT fraction', () => {
  const inclusiveSale = {
    sub: 19.80, disc: 1.00, tax: 2.45, total: 18.80,
    vatInclusive: true, vatEnabled: true, vatRate: 15,
    zatca: { documentType: 'simplified' },
    items: [{ name: 'Coffee', qty: 2, price: 9.90, zatcaVatCategory: 'S', zatcaVatRate: 15 }]
  };
  const result = assessSaleForZatca(inclusiveSale, settings);
  assert.ok(!result.reasons.some((reason) => reason.includes('VAT-inclusive POS subtotal')));
  assert.ok(!result.reasons.some((reason) => reason.includes('Calculated VAT from the per-line categories')));
});
