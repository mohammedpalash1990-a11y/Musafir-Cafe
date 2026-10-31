'use strict';
const { execFileSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
function makeTestCert() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zt-')); const k = path.join(d, 'k.pem'), c = path.join(d, 'c.pem');
  execFileSync('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', k]);
  execFileSync('openssl', ['req', '-new', '-x509', '-key', k, '-subj', '/C=SA/O=Test/CN=Test', '-days', '2', '-out', c]);
  const key = fs.readFileSync(k, 'utf8'); const pem = fs.readFileSync(c, 'utf8');
  const der64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  fs.rmSync(d, { recursive: true, force: true });
  return { key, token: Buffer.from(der64).toString('base64') };   // same double-base64 shape ZATCA returns
}
// Tiny in-memory stand-in for the Firestore calls we use.
function fakeDb() {
  const data = new Map();
  const ref = (p) => ({ path: p,
    collection: (n) => coll(`${p}/${n}`), async get() { return snap(p); }, async set(v, o) { data.set(p, o && o.merge ? { ...(data.get(p) || {}), ...v } : { ...v }); },
    async delete() { data.delete(p); } });
  const coll = (p) => ({ doc: (id) => ref(`${p}/${id}`), async add(v) { data.set(`${p}/${Math.random()}`, v); } });
  const snap = (p) => ({ exists: data.has(p), data: () => (data.has(p) ? { ...data.get(p) } : undefined) });
  const db = { _data: data, collection: coll,
    async runTransaction(fn) {
      const writes = [];
      const tx = { async get(r) { return snap(r.path); },
        set(r, v) { writes.push(() => data.set(r.path, { ...v })); },
        create(r, v) { if (data.has(r.path)) throw new Error('ALREADY_EXISTS'); writes.push(() => data.set(r.path, { ...v })); } };
      const out = await fn(tx); writes.forEach((w) => w()); return out; } };
  return db;
}
module.exports = { makeTestCert, fakeDb };
