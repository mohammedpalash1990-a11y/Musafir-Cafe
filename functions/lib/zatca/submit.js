'use strict';
const api = require('./api');
const { assertMove } = require('./states');
const { audit } = require('./audit');
const { tenant } = require('./invoice');
const LEASE_MS = 2 * 60 * 1000;
const BACKOFF_MIN = [1, 5, 15, 60, 240, 720];

// Reporting for simplified, Clearance for standard. Safe to call repeatedly (idempotent).
async function submitInvoice({ db, uid, invoiceId, env, creds, fetchImpl, now = () => Date.now() }) {
  const t = tenant(db, uid); const invRef = t.collection('invoices').doc(invoiceId); const subRef = t.collection('submissions').doc(invoiceId);
  const inv = (await invRef.get()).data(); if (!inv) throw new Error('Invoice not found');
  const claim = await db.runTransaction(async (tx) => {
    const sub = (await tx.get(subRef)).data() || { status: 'Generated', attempts: 0 };
    if (['Reported', 'Cleared', 'Rejected'].includes(sub.status)) return { skip: sub.status };
    if (sub.status === 'Submitted' && sub.leaseUntil > now()) return { skip: 'InProgress' };
    if (sub.status === 'Failed' && sub.retryable === false && !sub.manualRetry) return { skip: 'NeedsManualReview' };
    if (sub.status !== 'Submitted') assertMove(sub.status, 'Submitted');
    tx.set(subRef, { ...sub, status: 'Submitted', attempts: (sub.attempts || 0) + 1, leaseUntil: now() + LEASE_MS, updatedAt: new Date(now()).toISOString() });
    return { attempts: (sub.attempts || 0) + 1 };
  });
  if (claim.skip) return { status: claim.skip, skipped: true };
  const kind = inv.subtype === 'standard' ? 'clearance' : 'reporting';
  const payload = { invoiceHash: inv.invoiceHash, uuid: inv.uuid, invoice: Buffer.from(inv.xml, 'utf8').toString('base64') };
  const r = await (kind === 'clearance' ? api.clear : api.report)(env, creds, payload, fetchImpl);
  const out = api.classify(kind, r);
  const nextMin = BACKOFF_MIN[Math.min(claim.attempts - 1, BACKOFF_MIN.length - 1)];
  const update = { status: out.status, attempts: claim.attempts, leaseUntil: 0, retryable: !!out.retryable, manualRetry: false,
    lastHttpStatus: r.status, lastError: out.reason || null, warnings: out.warnings ? (r.json && r.json.validationResults) || true : null,
    updatedAt: new Date(now()).toISOString(),
    ...(out.retryable ? { nextRetryAt: now() + nextMin * 60000 } : {}),
    ...(out.status === 'Rejected' ? { errors: (r.json && r.json.validationResults && r.json.validationResults.errorMessages) || null } : {}) };
  await subRef.set(update, { merge: true });
  const qRef = db.collection('zatca_retry_queue').doc(`${uid}__${invoiceId}`);
  if (out.retryable) await qRef.set({ uid, invoiceId, nextRetryAt: update.nextRetryAt }); else await qRef.delete();
  await audit(db, uid, `submit_${out.status.toLowerCase()}`, { invoiceId, kind, http: r.status, reason: out.reason, attempts: claim.attempts });
  return { status: out.status, reason: out.reason, retryable: !!out.retryable };
}
module.exports = { submitInvoice };
