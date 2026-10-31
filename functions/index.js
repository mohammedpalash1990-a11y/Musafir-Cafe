'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

function getProfile(uid) {
  return db.doc(`users/${uid}/pos/settings`).get().then((snap) => {
    const settings = snap.exists ? snap.data() : {};
    const z = settings.zatca || {};
    const required = ['sellerName', 'vatNumber', 'street', 'building', 'district', 'city', 'postalCode'];
    const missing = required.filter((key) => !String(z[key] || '').trim());
    const vat = String(z.vatNumber || '').trim();
    if (vat && !/^3\\d{13}3$/.test(vat)) missing.push('vatNumber (must be a valid 15-digit Saudi VAT number format)');
    return { z, missing };
  });
}

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return request.auth.uid;
}

// Profile validation only. This does not connect to FATOORA or submit invoices.
exports.zatcaCheckSetup = onCall({ region: 'me-central1' }, async (request) => {
  const uid = requireUser(request);
  const { z, missing } = await getProfile(uid);
  return {
    profileSaved: !!z.enabled,
    invoiceType: z.invoiceType === 'standard' ? 'standard' : 'simplified',
    missing,
    integration: 'not_connected',
    message: 'Profile check only. FATOORA onboarding, CSID, signing, XML validation and Sandbox tests are not configured.'
  };
});

// Status endpoint intentionally reports only what this release can verify.
exports.zatcaStatus = onCall({ region: 'me-central1' }, async (request) => {
  const uid = requireUser(request);
  const { z, missing } = await getProfile(uid);
  return {
    environment: 'Profile-only (no FATOORA connection)',
    profileReady: !!z.enabled && missing.length === 0,
    profileErrors: missing,
    egsOnboarding: 'not configured',
    complianceCsid: 'not configured',
    complianceChecks: 'not run',
    productionCsidSandbox: 'not requested',
    lastSubmission: null,
    productionEnabled: false
  };
});
