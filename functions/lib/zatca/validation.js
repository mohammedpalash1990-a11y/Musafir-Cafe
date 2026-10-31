'use strict';
const VAT_RE = /^3\d{13}3$/;        // 15 digits, starts and ends with 3
const isVat = (v) => VAT_RE.test(String(v || '').trim());
const isDigits = (v, n) => new RegExp(`^\\d{${n}}$`).test(String(v || '').trim());

function validateProfile(z = {}) {
  const errors = [];
  const need = { sellerName: 'Seller legal name', street: 'Street', district: 'District', city: 'City' };
  for (const [k, label] of Object.entries(need)) if (!String(z[k] || '').trim()) errors.push(`${label} is required`);
  if (!isVat(z.vatNumber)) errors.push('VAT number must be 15 digits, starting and ending with 3');
  if (!isDigits(z.building, 4)) errors.push('Building number must be 4 digits');
  if (!isDigits(z.postalCode, 5)) errors.push('Postal code must be 5 digits');
  if (z.crNumber && !isDigits(z.crNumber, 10)) errors.push('Commercial Registration number must be 10 digits');
  if (!['simplified', 'standard'].includes(z.invoiceType || 'simplified')) errors.push('Invoice type must be simplified or standard');
  // Arabic seller name is required on human-readable invoices; we only warn here.
  const warnings = [];
  if (z.sellerName && !/[\u0600-\u06FF]/.test(z.sellerName)) warnings.push('Seller name has no Arabic text; Arabic is required on the human-readable invoice');
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { isVat, validateProfile };
