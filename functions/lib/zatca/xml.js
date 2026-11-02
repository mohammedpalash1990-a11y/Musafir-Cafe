'use strict';
// UBL 2.1 invoice builder. Output is COMPACT (no whitespace between elements) so that the hash input
// (document minus UBLExtensions / cac:Signature / QR reference) is byte-identical to the final document
// with those parts removed. Structure follows ZATCA's published sample invoices; the official SDK
// validation decides whether it is accepted - nothing here is "compliant" until that check passes.
const { toHalala, fmt } = require('./money');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (name, text, attrs = {}) => {
  const a = Object.keys(attrs).sort().map((k) => ` ${k}="${esc(attrs[k])}"`).join('');
  return `<${name}${a}>${text === undefined ? '' : esc(text)}</${name}>`;
};
const raw = (name, inner, attrs = {}) => {
  const a = Object.keys(attrs).sort().map((k) => ` ${k}="${esc(attrs[k])}"`).join('');
  return `<${name}${a}>${inner}</${name}>`;
};
const TYPE_CODES = { invoice: '388', credit: '381', debit: '383' };

// Hard limits: refuse rather than guess.
function computeTotals(inv) {
  if (!Array.isArray(inv.lines) || inv.lines.length === 0) throw new Error('Invoice needs at least one line');
  const rate = inv.vatRatePercent === undefined ? 15 : Number(inv.vatRatePercent);
  if (rate !== 15) throw new Error('Only standard-rated 15% VAT lines are supported in this version (no zero-rated/exempt yet).');
  let net = 0, tax = 0;
  const allow = toHalala(inv.discount || 0);
  if (allow < 0) throw new Error('Discount cannot be negative');
  const lines = inv.lines.map((l, i) => {
    if (l.discount) throw new Error(`Line ${i + 1}: discounts are not supported yet; pass the net unit price`);
    const qty = Number(l.qty); const unit = Number(l.unitPriceExclVat);
    if (!(qty > 0) || !(unit >= 0)) throw new Error(`Line ${i + 1}: invalid quantity or price`);
    const lineNet = toHalala(qty * unit); const lineTax = Math.round(lineNet * rate / 100);
    net += lineNet; tax += lineTax;
    return { name: String(l.name || '').trim() || 'Item', qty, unit, lineNet, lineTax, lineTotal: lineNet + lineTax };
  });
  if (allow > net) throw new Error('Discount is larger than the invoice');
  const taxable = net - allow; const docTax = Math.round(taxable * rate / 100);   // VAT is due on net AFTER the document discount
  return { rate, lines, lineNet: net, allow, net: taxable, tax: docTax, total: taxable + docTax };
}

function party(inv) {
  const s = inv.seller;
  return raw('cac:AccountingSupplierParty', raw('cac:Party',
    raw('cac:PartyIdentification', el('cbc:ID', s.crNumber || '', { schemeID: 'CRN' })) +
    raw('cac:PostalAddress', el('cbc:StreetName', s.street) + el('cbc:BuildingNumber', s.building) +
      el('cbc:CitySubdivisionName', s.district) + el('cbc:CityName', s.city) + el('cbc:PostalZone', s.postalCode) +
      raw('cac:Country', el('cbc:IdentificationCode', 'SA'))) +
    raw('cac:PartyTaxScheme', el('cbc:CompanyID', s.vatNumber) + raw('cac:TaxScheme', el('cbc:ID', 'VAT'))) +
    raw('cac:PartyLegalEntity', el('cbc:RegistrationName', s.sellerName))));
}
function buyer(inv) {
  const b = inv.buyer;
  if (inv.subtype === 'simplified' && !b) return raw('cac:AccountingCustomerParty', raw('cac:Party', ''));
  if (!b || !b.name || !b.vatNumber || !b.street || !b.building || !b.district || !b.city || !b.postalCode)
    throw new Error('Standard invoices need buyer name, VAT number and full address');
  return raw('cac:AccountingCustomerParty', raw('cac:Party',
    raw('cac:PostalAddress', el('cbc:StreetName', b.street) + el('cbc:BuildingNumber', b.building) +
      el('cbc:CitySubdivisionName', b.district) + el('cbc:CityName', b.city) + el('cbc:PostalZone', b.postalCode) +
      raw('cac:Country', el('cbc:IdentificationCode', 'SA'))) +
    raw('cac:PartyTaxScheme', el('cbc:CompanyID', b.vatNumber) + raw('cac:TaxScheme', el('cbc:ID', 'VAT'))) +
    raw('cac:PartyLegalEntity', el('cbc:RegistrationName', b.name))));
}
const taxCat = (id, rate) => raw('cac:TaxCategory', el('cbc:ID', 'S', { schemeAgencyID: '6', schemeID: 'UN/ECE 5305' }) +
  el('cbc:Percent', rate.toFixed(2)) + raw('cac:TaxScheme', el('cbc:ID', 'VAT', { schemeAgencyID: '6', schemeID: 'UN/ECE 5153' })));

/**
 * inv: {subtype:'simplified'|'standard', kind:'invoice'|'credit'|'debit', number, uuid, issuedAt(ISO UTC),
 *       icv, pih, seller, buyer?, lines[], paymentMeansCode?, original?:{number,date}, reason?}
 * extras: {extensionsXml?, qrB64?, signatureStub?: boolean}  (omit all three to get the HASH INPUT)
 */
function buildInvoiceXml(inv, extras = {}) {
  const t = computeTotals(inv);
  const d = new Date(inv.issuedAt); if (isNaN(d)) throw new Error('Bad issue date');
  const iso = d.toISOString(); const date = iso.slice(0, 10); const time = iso.slice(11, 19);
  const isStd = inv.subtype === 'standard';
  const kind = inv.kind || 'invoice';
  if ((kind === 'credit' || kind === 'debit') && (!inv.original || !inv.reason)) throw new Error('Credit/debit notes need the original invoice reference and a reason');
  const C = 'SAR';
  const parts = [];
  if (extras.extensionsXml) parts.push(extras.extensionsXml);
  parts.push(el('cbc:ProfileID', 'reporting:1.0'), el('cbc:ID', inv.number), el('cbc:UUID', inv.uuid),
    el('cbc:IssueDate', date), el('cbc:IssueTime', time),
    el('cbc:InvoiceTypeCode', TYPE_CODES[kind], { name: (isStd ? '01' : '02') + '00000' }),
    el('cbc:DocumentCurrencyCode', C), el('cbc:TaxCurrencyCode', C));
  if (inv.original) parts.push(raw('cac:BillingReference', raw('cac:InvoiceDocumentReference', el('cbc:ID', inv.original.number))));
  parts.push(raw('cac:AdditionalDocumentReference', el('cbc:ID', 'ICV') + el('cbc:UUID', String(inv.icv))));
  parts.push(raw('cac:AdditionalDocumentReference', el('cbc:ID', 'PIH') +
    raw('cac:Attachment', el('cbc:EmbeddedDocumentBinaryObject', inv.pih, { mimeCode: 'text/plain' }))));
  if (extras.qrB64) parts.push(raw('cac:AdditionalDocumentReference', el('cbc:ID', 'QR') +
    raw('cac:Attachment', el('cbc:EmbeddedDocumentBinaryObject', extras.qrB64, { mimeCode: 'text/plain' }))));
  if (extras.signatureStub) parts.push(raw('cac:Signature', el('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice') +
    el('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades')));
  parts.push(party(inv), buyer(inv));
  parts.push(raw('cac:Delivery', el('cbc:ActualDeliveryDate', date) + el('cbc:LatestDeliveryDate', date)));
  parts.push(raw('cac:PaymentMeans', el('cbc:PaymentMeansCode', inv.paymentMeansCode || '10') +
    (inv.reason ? el('cbc:InstructionNote', inv.reason) : '')));
  if (t.allow > 0) parts.push(raw('cac:AllowanceCharge', el('cbc:ChargeIndicator', 'false') + el('cbc:AllowanceChargeReason', 'discount') +
    el('cbc:Amount', fmt(t.allow), { currencyID: C }) + taxCat('S', t.rate)));
  parts.push(raw('cac:TaxTotal', el('cbc:TaxAmount', fmt(t.tax), { currencyID: C })));
  parts.push(raw('cac:TaxTotal', el('cbc:TaxAmount', fmt(t.tax), { currencyID: C }) +
    raw('cac:TaxSubtotal', el('cbc:TaxableAmount', fmt(t.net), { currencyID: C }) + el('cbc:TaxAmount', fmt(t.tax), { currencyID: C }) + taxCat('S', t.rate))));
  parts.push(raw('cac:LegalMonetaryTotal', el('cbc:LineExtensionAmount', fmt(t.lineNet), { currencyID: C }) +
    el('cbc:TaxExclusiveAmount', fmt(t.net), { currencyID: C }) + el('cbc:TaxInclusiveAmount', fmt(t.total), { currencyID: C }) +
    el('cbc:AllowanceTotalAmount', fmt(t.allow), { currencyID: C }) + el('cbc:PrepaidAmount', '0.00', { currencyID: C }) +
    el('cbc:PayableAmount', fmt(t.total), { currencyID: C })));
  t.lines.forEach((l, i) => parts.push(raw('cac:InvoiceLine', el('cbc:ID', String(i + 1)) +
    el('cbc:InvoicedQuantity', String(l.qty), { unitCode: 'PCE' }) +
    el('cbc:LineExtensionAmount', fmt(l.lineNet), { currencyID: C }) +
    raw('cac:TaxTotal', el('cbc:TaxAmount', fmt(l.lineTax), { currencyID: C }) + el('cbc:RoundingAmount', fmt(l.lineTotal), { currencyID: C })) +
    raw('cac:Item', el('cbc:Name', l.name) + raw('cac:ClassifiedTaxCategory', el('cbc:ID', 'S') + el('cbc:Percent', t.rate.toFixed(2)) + raw('cac:TaxScheme', el('cbc:ID', 'VAT')))) +
    raw('cac:Price', el('cbc:PriceAmount', l.unit.toFixed(2), { currencyID: C })))));
  const ns = 'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
  return { xmlBody: `<Invoice ${ns}>${parts.join('')}</Invoice>`, totals: t, date, time, iso };
}
module.exports = { buildInvoiceXml, computeTotals, esc };
