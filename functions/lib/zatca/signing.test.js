'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signHash, verifyHash } = require('./signing');

test('signs the raw 32-byte invoice digest with secp256k1 without re-hashing it', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const digest = crypto.createHash('sha256').update('canonical invoice XML').digest();
  const digestB64 = digest.toString('base64');
  const signature = signHash(digestB64, privateKey.export({ type: 'sec1', format: 'pem' }));
  assert.equal(verifyHash(digestB64, signature, publicKey.export({ type: 'spki', format: 'pem' })), true);
  const otherDigest = crypto.createHash('sha256').update('different invoice XML').digest('base64');
  assert.equal(verifyHash(otherDigest, signature, publicKey.export({ type: 'spki', format: 'pem' })), false);
});

test('rejects malformed SHA-256 digest and non-secp256k1 signing keys', () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(() => signHash('not-base64', privateKey.export({ type: 'sec1', format: 'pem' })), /canonical Base64/);
  const digest = crypto.createHash('sha256').update('invoice').digest('base64');
  assert.throws(() => signHash(digest, privateKey.export({ type: 'sec1', format: 'pem' })), /secp256k1/);
});
