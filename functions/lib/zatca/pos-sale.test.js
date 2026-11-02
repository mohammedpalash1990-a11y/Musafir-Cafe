'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceInputFromPosSale } = require('./pos-sale');

const baseSale = {
  t: Date.parse('2026-11-03T10:00:00.000Z'),
  sub: 8.61, disc: 0, tax: 1.29, total: 9.90,
  vatEnabled: true, vatInclusive: true, vatRate: 15,
  zatca: { documentType: 'simplified' },
  items: [{ name: 'Coffee', qty: 1, price: 9.90, zatcaVatCategory: 'S', zatcaVatRate: 15 }]
};

test('maps VAT-inclusive POS gross price to a reconciled ZATCA net invoice line', () => {
  const result = buildInvoiceInputFromPosSale(baseSale, 's1001');
  assert.equal(result.subtype, 'simplified');
  assert.equal(result.sale.saleId, 's1001');
  assert.equal(result.sale.lines[0].unitPriceExclVat, 8.61);
  assert.equal(result.totals.tax, 129);
  assert.equal(result.totals.total, 990);
});

test('rejects exclusive pricing, wrong rates, and mismatched totals', () => {
  assert.throws(() => buildInvoiceInputFromPosSale({ ...baseSale, vatInclusive: false }, 's1'), /VAT-inclusive/);
  assert.throws(() => buildInvoiceInputFromPosSale({ ...baseSale, items: [{ ...baseSale.items[0], zatcaVatRate: 10 }] }, 's1'), /Standard-rated/);
  assert.throws(() => buildInvoiceInputFromPosSale({ ...baseSale, total: 10.10 }, 's1'), /do not reconcile/);
});
