'use strict';
// ZATCA QR = Base64 of TLV. Tags 1-5 text, 6-7 text (base64 strings), 8-9 raw bytes (simplified only for 9).
// Layout reflects ZATCA's published QR structure; confirm with the official SDK (-qr) before relying on it.
function tlv(tag, value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  if (buf.length > 255) throw new Error(`QR tag ${tag} too long`);
  return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
}
function buildQr({ sellerName, vatNumber, timestamp, totalWithVat, vatTotal, invoiceHash, signature, publicKey, certSignature }) {
  const parts = [tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestamp), tlv(4, totalWithVat), tlv(5, vatTotal),
    tlv(6, invoiceHash), tlv(7, signature), tlv(8, publicKey)];
  if (certSignature) parts.push(tlv(9, certSignature));
  return Buffer.concat(parts).toString('base64');
}
function parseQr(b64) {
  const b = Buffer.from(b64, 'base64'); const out = {}; let i = 0;
  while (i < b.length) { const tag = b[i], len = b[i + 1]; out[tag] = b.subarray(i + 2, i + 2 + len); i += 2 + len; }
  return out;
}
module.exports = { buildQr, parseQr, tlv };
