'use strict';

const { computeTotals } = require('./xml');

function buildInvoiceInputFromPosSale(sale, saleId) {
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error('POS sale must contain at least one line');
  }
  if (sale.vatEnabled === false || sale.vatInclusive !== true || Number(sale.vatRate) !== 15) {
    throw new Error('POS invoice generation requires the global 15% VAT-inclusive setting');
  }
  const subtype = String(sale.zatca && sale.zatca.documentType || '').toLowerCase();
  if (!['standard', 'simplified'].includes(subtype)) {
    throw new Error('Select Standard or Simplified invoice type on the POS sale');
  }
  const lines = sale.items.map((item, index) => {
    const category = String(item.zatcaVatCategory || '').toUpperCase();
    const rate = Number(item.zatcaVatRate);
    const grossUnitPrice = Number(item.price);
    const qty = Number(item.qty);
    if (category !== 'S' || rate !== 15 || !Number.isFinite(grossUnitPrice) || grossUnitPrice < 0 ||
        !Number.isFinite(qty) || qty <= 0 || !String(item.name || '').trim()) {
      throw new Error('Sale line ' + (index + 1) + ' must be a valid Standard-rated 15% line');
    }
    return {
      name: String(item.name).trim(),
      qty,
      unitPriceExclVat: Number((grossUnitPrice * 100 / 115).toFixed(2))
    };
  });
  const saleTime = Number(sale.t);
  const issuedAt = Number.isFinite(saleTime) ? new Date(saleTime).toISOString() : new Date().toISOString();
  const invoiceSale = {
    saleId: String(saleId || sale.id || ''),
    issuedAt,
    lines,
    discount: Number(sale.disc) || 0,
    vatRatePercent: 15,
    buyer: sale.zatca && sale.zatca.buyer || undefined
  };
  const totals = computeTotals({
    subtype,
    kind: 'invoice',
    number: 'preflight',
    uuid: '123e4567-e89b-42d3-a456-426614174000',
    issuedAt,
    icv: 1,
    pih: 'preflight',
    lines,
    discount: invoiceSale.discount,
    vatRatePercent: 15
  });
  const mismatch =
    Math.abs(totals.lineNet / 100 - Number(sale.sub)) > 0.02 ||
    Math.abs(totals.net / 100 - (Number(sale.sub) - Number(sale.disc || 0))) > 0.02 ||
    Math.abs(totals.tax / 100 - Number(sale.tax)) > 0.02 ||
    Math.abs(totals.total / 100 - Number(sale.total)) > 0.02;
  if (mismatch) {
    throw new Error('POS sale amounts do not reconcile to the generated 15% VAT invoice totals');
  }
  return { subtype, sale: invoiceSale, totals };
}

module.exports = { buildInvoiceInputFromPosSale };
