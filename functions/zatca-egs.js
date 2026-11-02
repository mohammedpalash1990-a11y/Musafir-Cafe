'use strict';

const VAT_NUMBER_RE = /^3\d{13}3$/;

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

  // Reconcile the persisted POS arithmetic before any legal invoice is built.
  const amounts = ['sub', 'disc', 'tax', 'total'].map((key) => Number(sale[key]));
  if (amounts.some((value) => !Number.isFinite(value))) {
    reasons.push('Sale subtotal, discount, VAT and total must all be finite numeric values.');
  } else {
    const [subtotal, discount, tax, total] = amounts;
    const lineSubtotal = sale.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.price), 0);
    if (Math.abs(lineSubtotal - subtotal) > 0.02) {
      reasons.push('Invoice line extension amounts do not reconcile with the POS subtotal.');
    }
    if (Math.abs((subtotal - discount + tax) - total) > 0.02) {
      reasons.push('POS subtotal minus discount plus tax does not reconcile with the sale total.');
    }
  }

  // POS currently stores one global tax percentage, not ZATCA VAT categories
  // and rates per line. Never infer a line's tax category from its menu category.
  const missingLineTax = sale.items.some((item) =>
    !['S', 'Z', 'E', 'O'].includes(String(item.zatcaVatCategory || '').toUpperCase()) ||
    item.zatcaVatRate === null || item.zatcaVatRate === undefined || item.zatcaVatRate === '' || !Number.isFinite(Number(item.zatcaVatRate)) || Number(item.zatcaVatRate) < 0
  );
  if (missingLineTax) {
    reasons.push('Add an explicit ZATCA VAT category (S/Z/E/O) and VAT rate to every invoice line; the POS global tax rate is not enough.');
  } else if (amounts.every(Number.isFinite) && Number(sale.sub) > 0) {
    const subtotal = Number(sale.sub);
    const discountRatio = Number(sale.disc) / subtotal;
    if (discountRatio < 0 || discountRatio > 1) {
      reasons.push('Discount must be between zero and the invoice subtotal before VAT allocation.');
    } else {
      const expectedVat = sale.items.reduce((sum, item) => {
        const category = String(item.zatcaVatCategory).toUpperCase();
        const rate = Number(item.zatcaVatRate);
        if (category !== 'S' && rate !== 0) {
          reasons.push('Zero-rated, exempt and out-of-scope lines must use a zero VAT rate.');
        }
        return sum + (Number(item.qty) * Number(item.price) * (1 - discountRatio) * rate / 100);
      }, 0);
      if (Math.abs(expectedVat - Number(sale.tax)) > 0.02) {
        reasons.push('Calculated VAT from the per-line categories and rates does not reconcile with the POS VAT total.');
      }
    }
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
