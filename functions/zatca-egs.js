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
  if (sale.vatEnabled === false) reasons.push('VAT is disabled in POS settings; a VAT-registered Saudi seller must not submit this sale as a standard-rated VAT invoice.');
  const currency = String(settings && settings.cur || '').trim().toUpperCase();
  if (currency !== 'SAR') reasons.push('Set the POS currency to SAR before issuing Saudi VAT invoices.');

  // Reconcile the persisted POS arithmetic before any legal invoice is built.
  const inclusive = sale.vatInclusive === true;
  const amounts = ['sub', 'disc', 'tax', 'total'].map((key) => Number(sale[key]));
  if (amounts.some((value) => !Number.isFinite(value))) {
    reasons.push('Sale subtotal, discount, VAT and total must all be finite numeric values.');
  } else {
    const [subtotal, discount, tax, total] = amounts;
    const globalVatForSubtotal = settings && settings.vat && typeof settings.vat === 'object' ? settings.vat : {};
    const globalRateForSubtotal = Number(sale.vatRate ?? globalVatForSubtotal.rate ?? (settings && settings.tax) ?? 15);
    const globalEnabledForSubtotal = sale.vatEnabled !== false && globalVatForSubtotal.enabled !== false;
    const lineSubtotal = sale.items.reduce((sum, item) => {
      const gross = Number(item.qty) * Number(item.price);
      const category = String(item.zatcaVatCategory || '').toUpperCase() || (globalEnabledForSubtotal && globalRateForSubtotal === 15 ? 'S' : '');
      const hasRate = item.zatcaVatRate !== null && item.zatcaVatRate !== undefined && item.zatcaVatRate !== '';
      const rate = hasRate ? Number(item.zatcaVatRate) : (category === 'S' && globalEnabledForSubtotal ? globalRateForSubtotal : 0);
      return sum + (inclusive && category === 'S' && rate > 0 ? gross * 100 / (100 + rate) : gross);
    }, 0);
    if (Math.abs(lineSubtotal - subtotal) > 0.02) {
      reasons.push('Invoice line extension amounts do not reconcile with the POS subtotal.');
    }
    if (Math.abs((subtotal - discount + tax) - total) > 0.02) {
      reasons.push('POS subtotal minus discount plus tax does not reconcile with the sale total.');
    }
  }

  // One global Saudi VAT setting is the default for ordinary menu items.
  // If no product override exists, inherit Standard-rated 15% from the POS
  // global setting. Explicit Z/ZERO/EXEMPT/O overrides remain opt-in for
  // genuinely different tax treatment; menu category names are never inferred.
  const globalVat = settings && settings.vat && typeof settings.vat === 'object' ? settings.vat : {};
  const globalRate = Number(sale.vatRate ?? globalVat.rate ?? (settings && settings.tax) ?? 15);
  const globalEnabled = sale.vatEnabled !== false && globalVat.enabled !== false;
  const lineTax = sale.items.map((item) => {
    const rawCategory = String(item.zatcaVatCategory || '').trim().toUpperCase();
    const hasRate = item.zatcaVatRate !== null && item.zatcaVatRate !== undefined && item.zatcaVatRate !== '';
    if (!rawCategory && !hasRate && globalEnabled && globalRate === 15) return { category: 'S', rate: 15 };
    if (rawCategory === 'S' && !hasRate && globalEnabled && globalRate === 15) return { category: 'S', rate: 15 };
    return { category: rawCategory, rate: hasRate ? Number(item.zatcaVatRate) : NaN };
  });
  const invalidLineTax = lineTax.some(({ category, rate }) =>
    !['S', 'Z', 'E', 'O'].includes(category) || !Number.isFinite(rate) || rate < 0 || rate > 100 ||
    (category === 'S' && rate <= 0) || (category !== 'S' && rate !== 0)
  );
  if (invalidLineTax) {
    reasons.push('Invoice line tax override is invalid. Ordinary products inherit the global 15% Standard-rated VAT automatically; only special tax treatments need explicit overrides.');
  } else if (amounts.every(Number.isFinite) && Number(sale.sub) > 0) {
    const subtotal = Number(sale.sub);
    const discountRatio = Number(sale.disc) / subtotal;
    if (discountRatio < 0 || discountRatio > 1) {
      reasons.push('Discount must be between zero and the invoice subtotal before VAT allocation.');
    } else {
      const expectedVat = sale.items.reduce((sum, item, index) => {
        const { category, rate } = lineTax[index];
        const grossAfterDiscount = Number(item.qty) * Number(item.price) * (1 - discountRatio);
        return sum + (grossAfterDiscount * (inclusive && category === 'S' ? rate / (100 + rate) : rate / 100));
      }, 0);
      if (Math.abs(expectedVat - Number(sale.tax)) > 0.02) {
        reasons.push('Calculated VAT from the global default/explicit line overrides does not reconcile with the POS VAT total.');
      }
    }
  }
  const documentType = String(sale.zatca && sale.zatca.documentType || '').toLowerCase();
  if (!['standard', 'simplified'].includes(documentType)) {
    reasons.push('Select Standard (B2B) or Simplified (B2C) for each transaction.');
  } else if (documentType === 'standard') {
    const buyer = sale.zatca && sale.zatca.buyer || {};
    const buyerRequired = ['name', 'vatNumber', 'street', 'building', 'district', 'city', 'postalCode'];
    const missingBuyer = buyerRequired.filter((key) => !String(buyer[key] || '').trim());
    if (!/^3\d{13}3$/.test(String(buyer.vatNumber || '').trim())) missingBuyer.push('vatNumber (invalid Saudi VAT number format)');
    if (missingBuyer.length) reasons.push('Complete Standard invoice buyer details: ' + missingBuyer.join(', ') + '.');
  }
  return {
    status: reasons.length ? 'awaiting_egs_review' : 'awaiting_egs',
    reasons,
    documentType: documentType || null,
    currency: currency || null,
    total: Number(sale.total),
    vatAmount: Number(sale.tax) || 0
  };
}

module.exports = { assessSaleForZatca, isSha256Base64 };
