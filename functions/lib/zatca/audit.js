'use strict';
const SENSITIVE = /secret|token|private|key|otp|password|authorization|csr|certificate/i;
function redact(obj, depth = 0) {
  if (obj === null || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}
// Append-only audit trail (server-side collection; clients have no access through Firestore rules defaults).
async function audit(db, uid, type, detail = {}) {
  await db.collection('zatca_tenants').doc(uid).collection('audit').add({ ts: new Date().toISOString(), type, detail: redact(detail) });
}
module.exports = { audit, redact };
