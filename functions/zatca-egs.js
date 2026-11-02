'use strict';

const VAT_NUMBER_RE = /^3\\d{13}3$/;

function isSha256Base64(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(String(value || ''))) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}

function assessSaleForZatca(sale, settings) {
  const z = (settings && settings.zatca) || {};
  const missingProfile = ['sellerName', 'vatNumber', 'street', 'building', 'district', 'city', 'postalCode']
    .filter((key) => !String(z[key] || '').trim());
  if (z.vatNumber && !VAT_NUMBER_RE.test(String(z.vatNumber).trim())) {
    missingProfile.push('vatNumber (invalid Saudi VAT number format)');
  }
  if (!z.enabled || missingProfile.length) {
    return { status: 'blocked_profile', reasons: ['Complete and enable the ZATCA seller profile.', ...missingProfile] };
  }
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) {
    return { status: 'manual_review', reasons: ['Sale has no invoice lines.'] };
  }
  if (sale.refund || Number(sale.total) < 0 || sale.items.some((item) => Number(item.qty) < 0)) {
    return { status: 'credit_note_required', reasons: ['Refunds must be issued as compliant credit notes; automatic refund conversion is not enabled.'] };
  }
  if (!Number.isFinite(Number(sale.total)) || Number(sale.total) <= 0) {
    return { status: 'manual_review', reasons: ['Sale total must be a positive amount.'] };
  }
  const invalidLine = sale.items.some((item) =>
    !String(item.name || '').trim() ||
    !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 ||
    !Number.isFinite(Number(item.price)) || Number(item.price) < 0
  );
  if (invalidLine) return { status: 'manual_review', reasons: ['One or more sale lines have invalid descriptions, quantities, or prices.'] };

  const reasons = [];
  const currency = String(settings && settings.cur || '').trim().toUpperCase();
  if (currency !== 'SAR') reasons.push('Set the POS currency to SAR before issuing Saudi VAT invoices.');
  if (!Number.isFinite(Number(sale.tax)) || Number(sale.tax) <= 0) {
    reasons.push('Review the VAT rate and item tax categories; zero VAT is not assumed to be correct for cafe sales.');
  }
  reasons.push('Confirm Standard (B2B) or Simplified (B2C) for this transaction using the buyer details.');
  reasons.push('UBL 2.1 generation, invoice hash/PIH, XAdES signing, and TLV QR are not yet implemented.');
  return {
    status: reasons.length ? 'awaiting_egs_review' : 'awaiting_egs',
    reasons,
    currency: currency || null,
    total: Number(sale.total),
    vatAmount: Number(sale.tax) || 0
  };
}

module.exports = { assessSaleForZatca, isSha256Base64 };
