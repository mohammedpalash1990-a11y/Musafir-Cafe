'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQr, parseQr } = require('./qr');

test('encodes ZATCA QR tags as byte-length TLV in the required order', () => {
  const qr = buildQr({
    sellerName: 'مُسافِر كافيه',
    vatNumber: '312345678901233',
    timestamp: '2026-11-03T10:00:00Z',
    totalWithVat: '9.90',
    vatTotal: '1.29',
    invoiceHash: Buffer.alloc(32, 1).toString('base64'),
    signature: Buffer.from('signature').toString('base64'),
    publicKey: Buffer.from('public-key'),
    certSignature: Buffer.from('certificate-signature')
  });
  const tags = parseQr(qr);
  assert.deepEqual(Object.keys(tags).map(Number), [1,2,3,4,5,6,7,8,9]);
  assert.equal(tags[1].toString('utf8'), 'مُسافِر كافيه');
  assert.equal(tags[4].toString('utf8'), '9.90');
  assert.equal(tags[5].toString('utf8'), '1.29');
});

test('rejects a TLV value longer than the one-byte length field', () => {
  assert.throws(() => buildQr({
    sellerName: 'x'.repeat(256), vatNumber: '312345678901233',
    timestamp: '2026-11-03T10:00:00Z', totalWithVat: '9.90', vatTotal: '1.29',
    invoiceHash: 'hash', signature: 'signature', publicKey: Buffer.from('key')
  }), /too long/);
});
