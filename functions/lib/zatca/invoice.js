'use strict';
const crypto = require('crypto');
const { buildInvoiceXml } = require('./xml');
const S = require('./signing');
const { buildQr } = require('./qr');
const { fmt } = require('./money');
// ZATCA initial PIH = base64 of hex SHA-256 of "0"
const INITIAL_PIH = Buffer.from(crypto.createHash('sha256').update('0').digest('hex')).toString('base64');
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const tenant = (db, uid) => db.collection('zatca_tenants').doc(uid);

/**
 * Atomically: allocate ICV, read previous hash, build + hash + sign, store the immutable record.
 * Same saleId twice => returns the first record (idempotent, no duplicate invoice, no second counter).
 */
async function generateInvoice({ db, uid, stateKey, sale, seller, subtype, privateKeyPem, certToken, numberPrefix = 'INV-' }) {
  if (!SAFE_ID.test(String(sale.saleId || ''))) throw new Error('saleId must be 1-100 chars: letters, digits, _ or -');
  const { certB64, x509 } = S.loadCertificate(certToken);
  const invRef = tenant(db, uid).collection('invoices').doc(sale.saleId);
  const stRef = tenant(db, uid).collection('state').doc(stateKey);
  const subRef = tenant(db, uid).collection('submissions').doc(sale.saleId);
  return db.runTransaction(async (tx) => {
    const [existing, st] = await Promise.all([tx.get(invRef), tx.get(stRef)]);
    if (existing.exists) return { ...existing.data(), duplicate: true };
    const s = st.exists ? st.data() : {};
    const icv = (s.icv || 0) + 1, pih = s.lastHash || INITIAL_PIH;
    const inv = { subtype, kind: sale.kind || 'invoice', number: `${numberPrefix}${String(icv).padStart(6, '0')}`, uuid: crypto.randomUUID(),
      issuedAt: sale.issuedAt || new Date().toISOString(), icv, pih, seller, buyer: sale.buyer, lines: sale.lines,
      paymentMeansCode: sale.paymentMeansCode, discount: sale.discount, original: sale.original, reason: sale.reason, vatRatePercent: sale.vatRatePercent };
    const core = buildInvoiceXml(inv);                       // hash input (no extensions/QR/signature)
    const hash = S.invoiceHash(core.xmlBody);
    const signature = S.signHash(hash, privateKeyPem);
    const signingTime = new Date().toISOString().slice(0, 19) + 'Z';
    const qr = buildQr({ sellerName: seller.sellerName, vatNumber: seller.vatNumber, timestamp: `${core.date}T${core.time}Z`,
      totalWithVat: fmt(core.totals.total), vatTotal: fmt(core.totals.tax), invoiceHash: hash, signature,
      publicKey: S.publicKeyDer(x509), certSignature: subtype === 'simplified' ? S.certSignature(x509) : undefined });
    const extensionsXml = S.buildExtensions({ invoiceHashB64: hash, signatureB64: signature, certB64, x509, signingTime });
    const final = buildInvoiceXml(inv, { extensionsXml, qrB64: qr, signatureStub: true });
    const record = { saleId: sale.saleId, number: inv.number, uuid: inv.uuid, icv, pih, invoiceHash: hash, subtype, kind: inv.kind,
      xml: '<?xml version="1.0" encoding="UTF-8"?>\n' + final.xmlBody, qr, totalWithVat: fmt(core.totals.total), vatTotal: fmt(core.totals.tax),
      stateKey, createdAt: new Date().toISOString() };
    tx.create(invRef, record);                               // create() fails if it already exists => immutable
    tx.set(stRef, { icv, lastHash: hash, updatedAt: record.createdAt });
    tx.set(subRef, { status: 'Generated', attempts: 0, updatedAt: record.createdAt });
    return { ...record, duplicate: false };
  });
}
module.exports = { generateInvoice, INITIAL_PIH, tenant };
