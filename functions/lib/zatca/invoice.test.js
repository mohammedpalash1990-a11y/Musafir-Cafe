'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { generateInvoice } = require('./invoice');
const { parseQr } = require('./qr');

function fakeDb() {
  const docs = new Map();
  const ref = (key) => ({
    key,
    collection(name) { return collection(key + '/' + name); }
  });
  const collection = (key) => ({ doc(id) { return ref(key + '/' + id); } });
  return {
    docs,
    collection,
    async runTransaction(fn) {
      const tx = {
        async get(r) { return { exists: docs.has(r.key), data: () => docs.get(r.key) }; },
        create(r, value) {
          if (docs.has(r.key)) throw new Error('already exists');
          docs.set(r.key, structuredClone(value));
        },
        set(r, value) { docs.set(r.key, { ...(docs.get(r.key) || {}), ...structuredClone(value) }); }
      };
      return fn(tx);
    }
  };
}

test('generates a signed immutable invoice, TLV QR and idempotent ICV/PIH record', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musafir-zatca-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath]);
  execFileSync('openssl', ['req', '-new', '-x509', '-key', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=Musafir Cafe Test']);
  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
  const certToken = Buffer.from(certificate.raw.toString('base64'), 'utf8').toString('base64');

  const db = fakeDb();
  const sale = {
    saleId: 's1001',
    issuedAt: '2026-11-03T10:00:00.000Z',
    lines: [{ name: 'Coffee', qty: 1, unitPriceExclVat: 8.61 }],
    discount: 0,
    vatRatePercent: 15
  };
  const seller = {
    sellerName: 'Musafir Cafe', vatNumber: '312345678901233', crNumber: '1010101010',
    street: 'King Road', building: '1234', district: 'Central', city: 'Madinah', postalCode: '42311'
  };

  const first = await generateInvoice({
    db, uid: 'tenant-1', stateKey: 'default', sale, seller, subtype: 'simplified',
    privateKeyPem, certToken, numberPrefix: 'MUS-'
  });
  const second = await generateInvoice({
    db, uid: 'tenant-1', stateKey: 'default', sale, seller, subtype: 'simplified',
    privateKeyPem, certToken, numberPrefix: 'MUS-'
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.icv, 1);
  assert.equal(second.icv, 1);
  assert.equal(first.totalWithVat, '9.90');
  assert.equal(first.vatTotal, '1.29');
  assert.ok(first.xml.includes('<ext:UBLExtensions>'));
  assert.ok(first.xml.includes('<cbc:ID>QR</cbc:ID>'));
  const qr = parseQr(first.qr);
  assert.deepEqual(Object.keys(qr).map(Number), [1,2,3,4,5,6,7,8,9]);
  assert.equal(qr[4].toString('utf8'), '9.90');
  assert.equal(qr[5].toString('utf8'), '1.29');
  assert.equal(db.docs.get('zatca_tenants/tenant-1/state/default').icv, 1);
});
