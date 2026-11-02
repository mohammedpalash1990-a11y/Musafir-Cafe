const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// Readiness checker only. This intentionally does NOT submit invoices to FATOORA.
// Live integration must be completed with the current ZATCA SDK/specification,
// onboarded EGS CSID credentials and server-side cryptographic signing.
exports.zatcaCheckSetup = onCall({ region: 'me-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const uid = request.auth.uid;
  const snap = await db.doc(`users/${uid}/pos/settings`).get();
  const settings = snap.exists ? snap.data() : {};
  const z = settings.zatca || {};
  const required = ['sellerName', 'vatNumber', 'street', 'building', 'district', 'city', 'postalCode'];
  const missing = required.filter((key) => !String(z[key] || '').trim());
  const validVat = /^3\d{13}3$/.test(String(z.vatNumber || '').trim());
  if (z.vatNumber && !validVat) missing.push('vatNumber (must be a valid 15-digit Saudi VAT number format)');
  return {
    profileSaved: !!z.enabled,
    invoiceType: z.invoiceType === 'standard' ? 'standard' : 'simplified',
    missing,
    integration: 'not_connected',
    message: 'Profile check only. FATOORA onboarding, CSID, signing, XML validation and Sandbox tests are not yet configured.'
  };
});
