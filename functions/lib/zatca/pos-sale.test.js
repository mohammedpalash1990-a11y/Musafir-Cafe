'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePosSaleForInvoice } = require('./pos-sale');
const settings = { cur: 'SAR', zatca: { enabled: true, sellerName: 'Musafir Cafe LLC', vatNumber: '312345678901233', crNumber: '1010101010', street: 'King Road', building: '1234', district: 'Central', city: 'Madinah', postalCode: '42311' } };
const sale = { t: 1793700000000, sub: 8.61, disc: 0, tax: 1.29, total: 9.90, vatEnabled: true, vatInclusive: true, vatRate: 15, items: [{ name: 'Coffee', qty: 1, price: 9.90, zatcaVatCategory: 'S', zatcaVatRate: 15 }], zatca: { documentType: 'simplified' } };
test('maps a SAR 9.90 VAT-inclusive sale to 8.61 net + 1.29 VAT', () => { const r = preparePosSaleForInvoice({ sale, saleId: 's1001', settings }); assert.equal(r.subtype, 'simplified'); assert.equal(r.invoiceSale.lines[0].unitPriceExclVat, 8.608696); assert.equal(r.calculated.lineNet, 861); assert.equal(r.calculated.tax, 129); assert.equal(r.calculated.total, 990); });
test('blocks missing Standard buyer details', () => { assert.throws(() => preparePosSaleForInvoice({ sale: { ...sale, zatca: { documentType: 'standard', buyer: {} } }, saleId: 's1002', settings }), /not ready for ZATCA/); });
test('blocks inconsistent POS totals', () => { assert.throws(() => preparePosSaleForInvoice({ sale: { ...sale, tax: 1.20, total: 9.81 }, saleId: 's1003', settings }), /not ready for ZATCA|do not reconcile/); });
test('does not infer zero-rated tax classification', () => { assert.throws(() => preparePosSaleForInvoice({ sale: { ...sale, items: [{ ...sale.items[0], zatcaVatCategory: 'Z', zatcaVatRate: 0 }] }, saleId: 's1004', settings }), /not ready for ZATCA/); });
test('requires SAR and 15% VAT-inclusive pricing', () => { assert.throws(() => preparePosSaleForInvoice({ sale: { ...sale, vatInclusive: false }, saleId: 's1005', settings }), /not ready for ZATCA|requires SAR and the global 15% VAT-inclusive/); });

test('inherits the global 15% Standard-rated classification when product tax fields are absent', () => { const noProductTax = { ...sale, items: [{ name: 'Coffee', qty: 1, price: 9.90 }] }; const r = preparePosSaleForInvoice({ sale: noProductTax, saleId: 's1006', settings }); assert.equal(r.invoiceSale.lines[0].unitPriceExclVat, 8.608696); });
