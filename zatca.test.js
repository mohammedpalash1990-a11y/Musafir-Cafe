'use strict';
const test = require('node:test'); const assert = require('node:assert');
const crypto = require('crypto'); const { execFileSync } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { isVat, validateProfile } = require('../lib/zatca/validation');
const { buildQr, parseQr } = require('../lib/zatca/qr');
const { buildInvoiceXml } = require('../lib/zatca/xml');
const S = require('../lib/zatca/signing');
const { generateInvoice, INITIAL_PIH } = require('../lib/zatca/invoice');
const { submitInvoice } = require('../lib/zatca/submit');
const api = require('../lib/zatca/api');
const { canMove } = require('../lib/zatca/states');
const { getEnv } = require('../lib/zatca/config');
const { redact } = require('../lib/zatca/audit');
const { generateKeyAndCsr } = require('../lib/zatca/csr');
const { makeTestCert, fakeDb } = require('./helpers');

const seller = { sellerName: 'مسافر كافيه Musafir Cafe', vatNumber: '399999999900003', crNumber: '1010010000', street: 'King Road', building: '1234', district: 'Olaya', city: 'Riyadh', postalCode: '12345' };
const sale = (id, extra = {}) => ({ saleId: id, lines: [{ name: 'Coffee', qty: 2, unitPriceExclVat: 10 }, { name: 'Cake', qty: 1, unitPriceExclVat: 12.5 }], ...extra });

test('VAT number rule', () => { assert.ok(isVat('399999999900003')); assert.ok(!isVat('299999999900003')); assert.ok(!isVat('39999999990003')); });
test('profile validation', () => { assert.ok(validateProfile({ ...seller }).ok); assert.ok(!validateProfile({ ...seller, postalCode: '12' }).ok); });
test('only sandbox unlocked', () => { assert.ok(getEnv('sandbox')); assert.throws(() => getEnv('production')); assert.throws(() => getEnv('simulation')); });
test('initial PIH equals the known ZATCA constant', () => assert.strictEqual(INITIAL_PIH, 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=='));
test('state machine blocks fake success', () => { assert.ok(!canMove('Generated', 'Reported')); assert.ok(canMove('Submitted', 'Reported')); assert.ok(!canMove('Reported', 'Failed')); });
test('audit redacts secrets', () => assert.deepStrictEqual(redact({ a: 1, privateKey: 'x', nested: { secret: 'y', ok: 2 } }), { a: 1, privateKey: '[redacted]', nested: { secret: '[redacted]', ok: 2 } }));

test('QR TLV round trip', () => {
  const q = buildQr({ sellerName: 'Musafir', vatNumber: '399999999900003', timestamp: '2026-10-31T10:00:00Z', totalWithVat: '34.50', vatTotal: '4.50', invoiceHash: 'aGFzaA==', signature: 'c2ln', publicKey: Buffer.from([1, 2, 3]), certSignature: Buffer.from([9]) });
  const p = parseQr(q); assert.strictEqual(p[1].toString(), 'Musafir'); assert.strictEqual(p[4].toString(), '34.50'); assert.deepStrictEqual([...p[8]], [1, 2, 3]); assert.ok(p[9]);
});

test('XML totals + compact + discount refused', () => {
  const x = buildInvoiceXml({ subtype: 'simplified', number: 'INV-1', uuid: crypto.randomUUID(), issuedAt: '2026-10-31T10:00:00Z', icv: 1, pih: INITIAL_PIH, seller, lines: sale('a').lines });
  assert.strictEqual(x.totals.net, 3250); assert.strictEqual(x.totals.tax, 488); assert.strictEqual(x.totals.total, 3738);   // 4.875 -> 4.88
  assert.ok(!/>\s+</.test(x.xmlBody));
  assert.throws(() => buildInvoiceXml({ subtype: 'simplified', number: 'x', uuid: 'u', issuedAt: '2026-10-31T10:00:00Z', icv: 1, pih: 'p', seller, lines: [{ name: 'a', qty: 1, unitPriceExclVat: 1, discount: 1 }] }));
  assert.throws(() => buildInvoiceXml({ subtype: 'standard', number: 'x', uuid: 'u', issuedAt: '2026-10-31T10:00:00Z', icv: 1, pih: 'p', seller, lines: sale('a').lines }), /buyer/i);
  assert.throws(() => buildInvoiceXml({ kind: 'credit', subtype: 'simplified', number: 'x', uuid: 'u', issuedAt: '2026-10-31T10:00:00Z', icv: 1, pih: 'p', seller, lines: sale('a').lines }), /original/i);
});

test('signature verifies and final XML minus signed parts equals hash input', () => {
  const { key, token } = makeTestCert(); const db = fakeDb();
  return generateInvoice({ db, uid: 'u1', stateKey: 'sandbox', sale: sale('s1'), seller, subtype: 'simplified', privateKeyPem: key, certToken: token }).then((rec) => {
    const { x509 } = S.loadCertificate(token);
    assert.ok(crypto.createVerify('sha256').update(Buffer.from(rec.invoiceHash, 'base64')).verify(x509.publicKey, Buffer.from(rec.xml.match(/<ds:SignatureValue>([^<]+)</)[1], 'base64')));
    const stripped = rec.xml.replace(/<\?xml[^>]*\?>\n/, '').replace(/<ext:UBLExtensions>.*?<\/ext:UBLExtensions>/, '')
      .replace(/<cac:Signature>.*?<\/cac:Signature>/, '').replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>.*?<\/cac:AdditionalDocumentReference>/, '');
    assert.strictEqual(S.invoiceHash(stripped), rec.invoiceHash);
    assert.ok(parseQr(rec.qr)[9]);                       // cert-signature tag present for simplified
    assert.strictEqual(parseQr(rec.qr)[6].toString(), rec.invoiceHash);
  });
});

test('ICV increments, PIH chains, same saleId is idempotent', async () => {
  const { key, token } = makeTestCert(); const db = fakeDb(); const g = (id) => generateInvoice({ db, uid: 'u1', stateKey: 'sandbox', sale: sale(id), seller, subtype: 'simplified', privateKeyPem: key, certToken: token });
  const a = await g('a1'); const b = await g('a2'); const again = await g('a1');
  assert.strictEqual(a.icv, 1); assert.strictEqual(b.icv, 2); assert.strictEqual(a.pih, INITIAL_PIH); assert.strictEqual(b.pih, a.invoiceHash);
  assert.ok(again.duplicate); assert.strictEqual(again.uuid, a.uuid); assert.strictEqual(db._data.get('zatca_tenants/u1/state/sandbox').icv, 2);
  assert.rejects(() => g('bad id!'));
});

test('classify never invents success', () => {
  assert.strictEqual(api.classify('reporting', { status: 200, json: { reportingStatus: 'REPORTED' } }).status, 'Reported');
  assert.strictEqual(api.classify('clearance', { status: 200, json: { clearanceStatus: 'CLEARED' } }).status, 'Cleared');
  assert.strictEqual(api.classify('reporting', { status: 200, json: {} }).status, 'Failed');
  assert.strictEqual(api.classify('reporting', { status: 400, json: {} }).status, 'Rejected');
  const t = api.classify('reporting', { status: 503, json: null }); assert.ok(t.status === 'Failed' && t.retryable);
  assert.ok(api.classify('reporting', { status: 0, networkError: 'x' }).retryable);
});

test('submission: reporting vs clearance, retry queue, no resend after success', async () => {
  const { key, token } = makeTestCert(); const db = fakeDb(); const env = getEnv('sandbox'); const creds = { token: 'tok', secret: 'sec' };
  await generateInvoice({ db, uid: 'u1', stateKey: 'sandbox', sale: sale('r1'), seller, subtype: 'simplified', privateKeyPem: key, certToken: token });
  const calls = []; const fetchImpl = (status, body) => async (url, o) => { calls.push({ url, h: o.headers }); return { status, json: async () => body }; };
  let r = await submitInvoice({ db, uid: 'u1', invoiceId: 'r1', env, creds, fetchImpl: fetchImpl(503, {}) });
  assert.strictEqual(r.status, 'Failed'); assert.ok(db._data.has('zatca_retry_queue/u1__r1'));
  assert.match(calls[0].url, /invoices\/reporting\/single$/); assert.strictEqual(calls[0].h['Clearance-Status'], '0');
  assert.ok(calls[0].h.Authorization.startsWith('Basic '));
  r = await submitInvoice({ db, uid: 'u1', invoiceId: 'r1', env, creds, fetchImpl: fetchImpl(200, { reportingStatus: 'REPORTED' }) });
  assert.strictEqual(r.status, 'Reported'); assert.ok(!db._data.has('zatca_retry_queue/u1__r1'));
  const n = calls.length; r = await submitInvoice({ db, uid: 'u1', invoiceId: 'r1', env, creds, fetchImpl: fetchImpl(200, { reportingStatus: 'REPORTED' }) });
  assert.ok(r.skipped); assert.strictEqual(calls.length, n);   // duplicate protection: nothing sent
  const std = { name: 'B Co', vatNumber: '399999999800003', street: 's', building: '1111', district: 'd', city: 'c', postalCode: '54321' };
  await generateInvoice({ db, uid: 'u1', stateKey: 'sandbox', sale: sale('c1', { buyer: std }), seller, subtype: 'standard', privateKeyPem: key, certToken: token });
  await submitInvoice({ db, uid: 'u1', invoiceId: 'c1', env, creds, fetchImpl: fetchImpl(200, { clearanceStatus: 'CLEARED' }) });
  assert.match(calls.at(-1).url, /invoices\/clearance\/single$/); assert.strictEqual(calls.at(-1).h['Clearance-Status'], '1');
  assert.strictEqual(db._data.get('zatca_tenants/u1/submissions/c1').status, 'Cleared');
});

test('CSR generation (needs openssl): secp256k1 key + template + subject', async () => {
  const { privateKeyPem, csrPem, csrB64 } = await generateKeyAndCsr({ profile: { ...seller, invoiceType: 'simplified' }, templateName: 'TSTZATCA-Code-Signing', egsId: 'abc-123' });
  const f = path.join(os.tmpdir(), 'chk.csr'); fs.writeFileSync(f, csrPem);
  const txt = execFileSync('openssl', ['req', '-in', f, '-noout', '-text']).toString(); fs.rmSync(f);
  assert.match(privateKeyPem, /EC PRIVATE KEY/); assert.match(txt, /secp256k1/); assert.match(txt, /TSTZATCA-Code-Signing/); assert.match(txt, /399999999900003/); assert.ok(Buffer.from(csrB64, 'base64').toString().startsWith('-----BEGIN'));
});
