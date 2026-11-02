'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceXml, computeTotals } = require('./xml');

const invoice = {
  subtype: 'simplified',
  kind: 'invoice',
  number: 'MUS-000001',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  issuedAt: '2026-11-03T10:00:00.000Z',
  icv: 1,
  pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5Mjc4NmM2ZDY5NmM3OWNiMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
  seller: { sellerName: 'Musafir Cafe', vatNumber: '312345678901233', crNumber: '1010101010', street: 'King Road', building: '1234', district: 'Central', city: 'Madinah', postalCode: '42311' },
  lines: [{ name: 'Tea & Coffee ]]> <special>', qty: 1, unitPriceExclVat: 8.61 }],
  vatRatePercent: 15
};

test('computes 15% VAT correctly for a VAT-exclusive 8.61 SAR base', () => {
  const totals = computeTotals(invoice);
  assert.equal(totals.net, 861);
  assert.equal(totals.tax, 129);
  assert.equal(totals.total, 990);
});

test('builds compact UBL XML with canonical text escaping and no XML declaration in hash input', () => {
  const result = buildInvoiceXml(invoice);
  assert.match(result.xmlBody, /^<Invoice /);
  assert.ok(!result.xmlBody.startsWith('<?xml'));
  assert.ok(result.xmlBody.includes('Tea &amp; Coffee ]]&gt; &lt;special>'));
  assert.ok(!result.xmlBody.includes('&gt; Coffee'));
  assert.equal(result.totals.total, 990);
});

test('omits optional seller CRN identification when no CR number is configured', () => {
  const withoutCr = { ...invoice, seller: { ...invoice.seller, crNumber: '' } };
  const result = buildInvoiceXml(withoutCr);
  assert.ok(!result.xmlBody.includes('<cac:PartyIdentification>'));
  assert.ok(!result.xmlBody.includes('<cbc:ID schemeID="CRN"></cbc:ID>'));
});


test('preserves sub-halala VAT-exclusive unit prices for multi-quantity low-price products', () => {
  const lowPrice = {
    ...invoice,
    lines: [{ name: 'Small add-on', qty: 100, unitPriceExclVat: Number((0.01 * 100 / 115).toFixed(6)) }]
  };
  const result = buildInvoiceXml(lowPrice);
  assert.equal(result.totals.net, 87);
  assert.equal(result.totals.tax, 13);
  assert.equal(result.totals.total, 100);
  assert.ok(result.xmlBody.includes('<cbc:PriceAmount currencyID="SAR">0.008696</cbc:PriceAmount>'));
  assert.ok(result.xmlBody.includes('<cbc:LineExtensionAmount currencyID="SAR">0.87</cbc:LineExtensionAmount>'));
});
