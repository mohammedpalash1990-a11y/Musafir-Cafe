'use strict';

const { assessSaleForZatca } = require('../../zatca-egs');
const { computeTotals } = require('./xml');

function preparePosSaleForInvoice({ sale, saleId, settings }) {
  const assessment = assessSaleForZatca(sale, settings);
  if (assessment.reasons && assessment.reasons.length) {
    const error = new Error('Sale is not ready for ZATCA invoice generation.');
    error.details = { reasons: assessment.reasons };
    throw error;
  }
  const seller = settings && settings.zatca || {};
  if (String(settings && settings.cur || '').trim().toUpperCase() !== 'SAR' || sale.vatEnabled === false || sale.vatInclusive !== true || Number(sale.vatRate) !== 15) {
    throw new Error('Invoice generation currently requires SAR and the global 15% VAT-inclusive POS setting.');
  }
  const subtype = String(sale.zatca && sale.zatca.documentType || '').toLowerCase();
  if (!['standard', 'simplified'].includes(subtype)) throw new Error('Choose Standard or Simplified invoice type on the POS sale first.');
  const lines = (sale.items || []).map((item, index) => {
    const category = String(item.zatcaVatCategory || 'S').toUpperCase();
    const rawRate = item.zatcaVatRate;
    const rate = rawRate === null || rawRate === undefined || rawRate === '' ? Number(sale.vatRate || 15) : Number(rawRate);
    const grossUnitPrice = Number(item.price);
    if (category !== 'S' || rate !== 15 || !Number.isFinite(grossUnitPrice) || grossUnitPrice < 0) throw new Error(`Sale line ${index + 1} must use the automatic Standard-rated 15% VAT classification.`);
    return { name: String(item.name || '').trim(), qty: Number(item.qty), unitPriceExclVat: Number((grossUnitPrice * 100 / 115).toFixed(6)) };
  });
  const saleTime = Number(sale.t);
  const issuedAt = Number.isFinite(saleTime) ? new Date(saleTime).toISOString() : new Date().toISOString();
  const invoiceSale = { saleId: String(saleId), issuedAt, lines, discount: Number(sale.disc) || 0, vatRatePercent: 15, buyer: sale.zatca && sale.zatca.buyer || undefined };
  const calculated = computeTotals({ subtype, kind: 'invoice', number: 'preflight', uuid: '123e4567-e89b-42d3-a456-426614174000', issuedAt, icv: 1, pih: 'preflight', seller, buyer: invoiceSale.buyer, lines, discount: invoiceSale.discount, vatRatePercent: 15 });
  const mismatch = Math.abs(calculated.lineNet / 100 - Number(sale.sub)) > 0.02 || Math.abs(calculated.net / 100 - (Number(sale.sub) - Number(sale.disc || 0))) > 0.02 || Math.abs(calculated.tax / 100 - Number(sale.tax)) > 0.02 || Math.abs(calculated.total / 100 - Number(sale.total)) > 0.02;
  if (mismatch) {
    const error = new Error('POS sale amounts do not reconcile to the generated 15% VAT invoice totals. Keep this sale in manual review.');
    error.details = { pos: { sub: sale.sub, disc: sale.disc, tax: sale.tax, total: sale.total }, generated: { lineNet: calculated.lineNet / 100, net: calculated.net / 100, tax: calculated.tax / 100, total: calculated.total / 100 } };
    throw error;
  }
  return { invoiceSale, seller, subtype, calculated };
}
module.exports = { preparePosSaleForInvoice };
