'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessSaleForZatca } = require('./zatca-egs');

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
