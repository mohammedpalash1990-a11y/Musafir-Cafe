'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { assessSaleForZatca } = require('./zatca-egs');
const { validateSignedInvoicePayload, classifySubmissionOutcome } = require('./zatca-invoice-validation');
const { validateComplianceRequest, extractCsidCredentials, validateProductionRequest } = require('./zatca-onboarding');
const { generateInvoice } = require('./lib/zatca/invoice');
const { preparePosSaleForInvoice } = require('./lib/zatca/pos-sale');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const ZATCA_PROD_TOKEN = defineSecret('ZATCA_PROD_TOKEN');
const ZATCA_PROD_SECRET = defineSecret('ZATCA_PROD_SECRET');
const ZATCA_SANDBOX_TOKEN = defineSecret('ZATCA_SANDBOX_TOKEN');
const ZATCA_SANDBOX_SECRET = defineSecret('ZATCA_SANDBOX_SECRET');
const ZATCA_ONBOARDING_ENCRYPTION_KEY = defineSecret('ZATCA_ONBOARDING_ENCRYPTION_KEY');
const ZATCA_EGS_PRIVATE_KEY = defineSecret('ZATCA_EGS_PRIVATE_KEY');

const REGION = 'me-central1';
const API_VERSION = 'V2';
const SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';
const PRODUCTION_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';


function onboardingEncryptionKey() {
  const key = Buffer.from(String(ZATCA_ONBOARDING_ENCRYPTION_KEY.value() || ''), 'base64');
  if (key.length !== 32) {
    throw new HttpsError('failed-precondition', 'ZATCA_ONBOARDING_ENCRYPTION_KEY must be a base64-encoded 32-byte key in Firebase Secret Manager.');
  }
  return key;
}

function encryptOnboardingValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', onboardingEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptOnboardingValue(envelope) {
  if (!envelope || envelope.algorithm !== 'aes-256-gcm') {
    throw new HttpsError('failed-precondition', 'Encrypted ZATCA onboarding credentials are missing or use an unsupported format.');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      onboardingEncryptionKey(),
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    return JSON.parse(plaintext);
  } catch (_) {
    throw new HttpsError('data-loss', 'Could not decrypt the stored ZATCA onboarding credentials.');
  }
}

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return request.auth.uid;
}

function getProfile(uid) {
  return db.doc(`users/${uid}/pos/settings`).get().then((snap) => {
    const settings = snap.exists ? snap.data() : {};
    const z = settings.zatca || {};
    const required = ['sellerName', 'vatNumber', 'street', 'building', 'district', 'city', 'postalCode'];
    const missing = required.filter((key) => !String(z[key] || '').trim());
    const vat = String(z.vatNumber || '').trim();
    if (vat && !/^3\d{13}3$/.test(vat)) missing.push('vatNumber (must be a 15-digit Saudi VAT number)');
    return { z, missing };
  });
}

function getEnvironment() {
  const env = String(process.env.ZATCA_ENVIRONMENT || 'sandbox').toLowerCase();
  if (!['sandbox', 'production'].includes(env)) {
    throw new HttpsError('failed-precondition', 'ZATCA_ENVIRONMENT must be sandbox or production.');
  }
  return env;
}

function getCredentials(env) {
  const token = env === 'production' ? ZATCA_PROD_TOKEN.value() : ZATCA_SANDBOX_TOKEN.value();
  const secret = env === 'production' ? ZATCA_PROD_SECRET.value() : ZATCA_SANDBOX_SECRET.value();
  if (!token || !secret) {
    throw new HttpsError('failed-precondition',
      `ZATCA ${env} credentials are not configured in Firebase Secret Manager.`);
  }
  return { token, secret };
}

function getBaseUrl(env) {
  const configured = String(process.env.ZATCA_API_BASE_URL || '').trim();
  if (configured) {
    let parsed;
    try { parsed = new URL(configured); } catch (_) {
      throw new HttpsError('failed-precondition', 'ZATCA_API_BASE_URL must be a valid HTTPS URL.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'gw-fatoora.zatca.gov.sa') {
      throw new HttpsError('failed-precondition', 'ZATCA_API_BASE_URL must use the official ZATCA gateway host over HTTPS.');
    }
    let path = parsed.pathname;
    while (path.endsWith('/')) path = path.slice(0, -1);
    return parsed.origin + path;
  }
  return env === 'production' ? PRODUCTION_URL : SANDBOX_URL;
}

function basicAuth(token, secret) {
  return 'Basic ' + Buffer.from(`${token}:${secret}`, 'utf8').toString('base64');
}

async function zatcaRequest({ env, path, body, headers = {}, method = 'POST', credentials }) {
  const auth = credentials || getCredentials(env);
  const url = getBaseUrl(env) + path;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuth(auth.token, auth.secret),
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'en',
        'Accept-Version': API_VERSION,
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    throw new HttpsError('unavailable', 'Could not reach the ZATCA FATOORA gateway.', {
      cause: String(error && error.message || error)
    });
  }

  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { rawResponse: raw.slice(0, 4000) }; }
  if (!response.ok) {
    throw new HttpsError('failed-precondition', `ZATCA API returned HTTP ${response.status}.`, {
      status: response.status,
      response: data
    });
  }
  return { status: response.status, data, headers: {
    requestId: response.headers.get('request-id') || response.headers.get('x-request-id') || null
  }};
}

// Profile check is intentionally separate from gateway connectivity.
exports.zatcaCheckSetup = onCall({ region: REGION }, async (request) => {
  const uid = requireUser(request);
  const { z, missing } = await getProfile(uid);
  return {
    profileSaved: !!z.enabled,
    invoiceType: z.invoiceType === 'standard' ? 'standard' : 'simplified',
    missing,
    integration: 'api_adapter_available',
    message: 'This checks the saved seller profile only. Configure credentials and complete ZATCA onboarding before submitting invoices.'
  };
});

exports.zatcaStatus = onCall({
  region: REGION,
  secrets: [ZATCA_PROD_TOKEN, ZATCA_PROD_SECRET, ZATCA_SANDBOX_TOKEN, ZATCA_SANDBOX_SECRET]
}, async (request) => {
  const uid = requireUser(request);
  const { z, missing } = await getProfile(uid);
  const env = getEnvironment();
  const credentials = env === 'production'
    ? !!(ZATCA_PROD_TOKEN.value() && ZATCA_PROD_SECRET.value())
    : !!(ZATCA_SANDBOX_TOKEN.value() && ZATCA_SANDBOX_SECRET.value());
  return {
    environment: env,
    profileReady: !!z.enabled && missing.length === 0,
    profileErrors: missing,
    apiCredentialsConfigured: credentials,
    egsOnboarding: 'requires CSR and OTP onboarding',
    complianceCsid: 'not verified by this status check',
    productionCsid: process.env.ZATCA_PRODUCTION_CSID_VERIFIED === 'true' ? 'explicitly verified by deployment administrator' : 'not verified',
    productionEnabled: env === 'production' && process.env.ZATCA_PRODUCTION_ENABLED === 'true' && process.env.ZATCA_PRODUCTION_CSID_VERIFIED === 'true' && credentials && !!z.enabled && missing.length === 0,
    apiVersion: API_VERSION
  };
});

// Sends an already ZATCA-signed UBL XML document. XML generation, XAdES signing,
// invoice hashing and TLV QR generation must be completed by the EGS before this call.
exports.zatcaSubmitInvoice = onCall({
  region: REGION,
  secrets: [ZATCA_PROD_TOKEN, ZATCA_PROD_SECRET, ZATCA_SANDBOX_TOKEN, ZATCA_SANDBOX_SECRET]
}, async (request) => {
  const uid = requireUser(request);
  const input = request.data || {};
  const uuid = String(input.uuid || '').trim();
  const invoiceHash = String(input.invoiceHash || '').trim();
  const invoiceBase64 = String(input.invoice || '').trim();
  const documentType = String(input.documentType || '').toLowerCase();

  if (!['simplified', 'standard'].includes(documentType)) {
    throw new HttpsError('invalid-argument', 'documentType must be simplified or standard.');
  }
  const payloadCheck = validateSignedInvoicePayload({
    uuid, invoiceHash, invoice: invoiceBase64
  });
  if (!payloadCheck.valid) {
    throw new HttpsError('invalid-argument', payloadCheck.reason);
  }

  const { z, missing } = await getProfile(uid);
  if (!z.enabled || missing.length) {
    throw new HttpsError('failed-precondition', 'Complete the ZATCA seller profile first.', { missing });
  }

  const env = getEnvironment();
  if (env === 'production' && (process.env.ZATCA_PRODUCTION_ENABLED !== 'true' || process.env.ZATCA_PRODUCTION_CSID_VERIFIED !== 'true')) {
    throw new HttpsError('failed-precondition', 'Production submission is locked until a deployment administrator confirms Production CSID onboarding and end-to-end verification.');
  }

  const invoiceRef = db.doc(`users/${uid}/zatcaInvoices/${uuid}`);
  const reservation = await db.runTransaction(async (tx) => {
    const existing = await tx.get(invoiceRef);
    if (existing.exists) {
      const state = existing.data().status;
      if (state === 'reported' || state === 'cleared') return { duplicate: true, data: existing.data() };
      if (state === 'processing') throw new HttpsError('aborted', 'This invoice is already being submitted.');
      if (state === 'submission_unknown') {
        throw new HttpsError('failed-precondition', 'A previous request may have reached ZATCA. Reconcile its status before retrying this UUID.');
      }
      tx.update(invoiceRef, { status: 'processing', updatedAt: FieldValue.serverTimestamp() });
      return { duplicate: false };
    }
    tx.create(invoiceRef, {
      uuid, invoiceHash, documentType, environment: env, status: 'processing',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return { duplicate: false };
  });
  if (reservation.duplicate) {
    return { duplicate: true, status: reservation.data.status, uuid };
  }

  try {
    const path = documentType === 'standard'
      ? '/invoices/clearance/single'
      : '/invoices/reporting/single';
    const headers = documentType === 'standard'
      ? { 'Clearance-Status': '1' }
      : { 'Clearance-Status': '0' };
    const result = await zatcaRequest({
      env, path, headers,
      body: { invoiceHash, uuid, invoice: invoiceBase64 }
    });
    const status = classifySubmissionOutcome({ documentType, responseData: result.data });
    await invoiceRef.update({
      status, response: result.data, requestId: result.headers.requestId,
      submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return { uuid, status, environment: env, response: result.data };
  } catch (error) {
    // A timeout/network failure can happen after ZATCA accepted the request.
    // Do not automatically re-submit an ambiguous invoice; reconcile it first.
    const uncertain = error.code === 'unavailable' ||
      (error.details && Number(error.details.status) >= 500);
    await invoiceRef.update({
      status: uncertain ? 'submission_unknown' : 'failed',
      errorCode: error.code || 'zatca_error',
      errorMessage: error.message || 'ZATCA submission failed',
      errorDetails: error.details || null,
      manualReconciliationRequired: uncertain,
      updatedAt: FieldValue.serverTimestamp()
    });
    throw error;
  }
});

/**
 * Every authenticated POS sale is mirrored into a ZATCA work queue.
 * This deliberately does NOT submit an invoice: the legal EGS generator,
 * signer, buyer classification and SDK validation must be completed first.
 */
exports.zatcaQueueSale = onDocumentCreated({
  document: 'users/{uid}/sales/{saleId}',
  region: REGION,
  retry: true
}, async (event) => {
  const { uid, saleId } = event.params;
  const sale = event.data && event.data.data();
  if (!sale) return;
  const settingsSnap = await db.doc(`users/${uid}/pos/settings`).get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const assessment = assessSaleForZatca(sale, settings);
  const jobRef = db.doc(`users/${uid}/zatcaInvoices/sale-${saleId}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(jobRef);
    if (existing.exists) return;
    tx.create(jobRef, {
      source: 'pos_sale',
      saleId: String(saleId),
      saleNo: Number(sale.no) || null,
      receiptNo: Number(sale.sn) || null,
      documentType: assessment.documentType || null,
      status: assessment.status,
      reasons: assessment.reasons,
      currency: assessment.currency || String(settings.cur || ''),
      total: Number(sale.total) || 0,
      vatAmount: Number(sale.tax) || 0,
      environment: getEnvironment(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
});


/**
 * Generate and sign one immutable invoice from an existing POS sale.
 * This is generation only; it never submits automatically to FATOORA.
 */
/**
 * Automatic draft generation for eligible queued POS sales.
 * Seller-profile enablement is the opt-in; this never submits to FATOORA.
 */
exports.zatcaAutoGenerateSandboxDraft = onDocumentCreated({
  document: 'users/{uid}/zatcaInvoices/{jobId}',
  region: REGION,
  retry: true,
  secrets: [ZATCA_EGS_PRIVATE_KEY, ZATCA_ONBOARDING_ENCRYPTION_KEY]
}, async (event) => {
  const { uid, jobId } = event.params;
  if (!String(jobId).startsWith('sale-')) return;
  const job = event.data && event.data.data();
  if (!job || job.source !== 'pos_sale') return;
  if (['generated_pending_sdk', 'reported', 'cleared', 'submitted', 'submission_unknown'].includes(String(job.status || '').toLowerCase())) return;
  if (String(job.status || '') !== 'awaiting_egs') return;

  const [saleSnap, settingsSnap] = await Promise.all([
    db.doc(`users/${uid}/sales/${job.saleId}`).get(),
    db.doc(`users/${uid}/pos/settings`).get()
  ]);
  if (!saleSnap.exists || !settingsSnap.exists) return;
  const sale = saleSnap.data();
  const settings = settingsSnap.data();
  const z = settings.zatca || {};
  if (z.enabled !== true) return;
  const jobRef = db.doc(`users/${uid}/zatcaInvoices/${jobId}`);
  if (getEnvironment() !== 'sandbox') {
    await jobRef.set({ status: 'auto_generation_blocked', reasons: ['Automatic draft generation is sandbox-only; production remains disabled.'], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  try {
    const requestId = String(z.onboardingRequestId || '').trim();
    if (!requestId) throw new Error('Complete sandbox OTP/CSID onboarding and save its request ID before automatic draft generation.');
    onboardingEncryptionKey();
    const onboardingSnap = await db.doc(`users/${uid}/zatcaOnboarding/${requestId}`).get();
    if (!onboardingSnap.exists || onboardingSnap.data().status !== 'sandbox_production_csid_issued') throw new Error('A sandbox Production CSID must be issued before automatic draft generation.');
    const credentials = decryptOnboardingValue(onboardingSnap.data().sandboxProductionCredentialsEncrypted);
    const privateKeyPem = String(ZATCA_EGS_PRIVATE_KEY.value() || '');
    if (!privateKeyPem) throw new Error('Configure ZATCA_EGS_PRIVATE_KEY in Firebase Secret Manager.');
    const prepared = preparePosSaleForInvoice({ sale, saleId: job.saleId, settings });
    const generated = await generateInvoice({
      db, uid, stateKey: 'default', sale: prepared.invoiceSale,
      seller: prepared.seller, subtype: prepared.subtype,
      privateKeyPem, certToken: credentials.token, numberPrefix: 'MUS-'
    });
    await jobRef.set({
      status: 'generated_pending_sdk', reasons: [],
      invoiceNumber: generated.number, uuid: generated.uuid,
      invoiceHash: generated.invoiceHash, icv: generated.icv,
      totalWithVat: generated.totalWithVat, vatTotal: generated.vatTotal,
      generatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      generationMode: 'automatic_sandbox_draft'
    }, { merge: true });
  } catch (error) {
    await jobRef.set({
      status: 'auto_generation_blocked',
      reasons: Array.isArray(error.details && error.details.reasons) ? error.details.reasons : [String(error && error.message || 'Automatic invoice draft generation failed.')],
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});

exports.zatcaGenerateInvoice = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [ZATCA_EGS_PRIVATE_KEY, ZATCA_ONBOARDING_ENCRYPTION_KEY]
}, async (request) => {
  const uid = requireUser(request);
  const input = request.data || {};
  const saleId = String(input.saleId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(saleId)) {
    throw new HttpsError('invalid-argument', 'A valid POS sale document ID is required.');
  }

  const env = getEnvironment();
  if (env !== 'sandbox') {
    throw new HttpsError('failed-precondition', 'This invoice-generation callable is sandbox-only. Production generation remains disabled until the official SDK and end-to-end gates are verified.');
  }

  const [saleSnap, settingsSnap] = await Promise.all([
    db.doc(`users/${uid}/sales/${saleId}`).get(),
    db.doc(`users/${uid}/pos/settings`).get()
  ]);
  if (!saleSnap.exists) throw new HttpsError('not-found', 'POS sale was not found.');
  if (!settingsSnap.exists) throw new HttpsError('failed-precondition', 'POS settings are missing.');

  const sale = saleSnap.data();
  const settings = settingsSnap.data();
  let prepared;
  try {
    prepared = preparePosSaleForInvoice({ sale, saleId, settings });
  } catch (error) {
    throw new HttpsError('failed-precondition', error.message || 'Sale is not ready for ZATCA invoice generation.', error.details || null);
  }
  const { invoiceSale, seller: z, subtype } = prepared;
  const checked = validateProductionRequest({ requestId: input.onboardingRequestId });
  if (!checked.valid) throw new HttpsError('invalid-argument', 'A valid sandbox onboardingRequestId is required.');
  onboardingEncryptionKey();
  const onboardingSnap = await db.doc(`users/${uid}/zatcaOnboarding/${checked.requestId}`).get();
  if (!onboardingSnap.exists || onboardingSnap.data().status !== 'sandbox_production_csid_issued') {
    throw new HttpsError('failed-precondition', 'A sandbox Production CSID must be issued through onboarding before invoice generation.');
  }
  const sandboxCredentials = decryptOnboardingValue(onboardingSnap.data().sandboxProductionCredentialsEncrypted);
  const certToken = sandboxCredentials.token;
  const privateKeyPem = String(ZATCA_EGS_PRIVATE_KEY.value() || '');
  if (!privateKeyPem) throw new HttpsError('failed-precondition', 'Configure ZATCA_EGS_PRIVATE_KEY in Firebase Secret Manager.');

  const generated = await generateInvoice({
    db, uid, stateKey: 'default', sale: invoiceSale, seller: z, subtype,
    privateKeyPem, certToken, numberPrefix: 'MUS-'
  });
  const jobRef = db.doc(`users/${uid}/zatcaInvoices/sale-${saleId}`);
  const submissionSnap = await db.doc(`zatca_tenants/${uid}/submissions/${saleId}`).get();
  const existingSubmissionStatus = String(submissionSnap.exists ? submissionSnap.data().status || '' : '').toLowerCase();
  const queueStatus = ['reported', 'cleared', 'submitted', 'submission_unknown'].includes(existingSubmissionStatus)
    ? existingSubmissionStatus : 'generated_pending_sdk';
  await jobRef.set({
    status: queueStatus,
    invoiceNumber: generated.number,
    uuid: generated.uuid,
    invoiceHash: generated.invoiceHash,
    icv: generated.icv,
    totalWithVat: generated.totalWithVat,
    vatTotal: generated.vatTotal,
    generatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    generated: true,
    duplicate: !!generated.duplicate,
    status: queueStatus,
    saleId,
    invoiceNumber: generated.number,
    uuid: generated.uuid,
    invoiceHash: generated.invoiceHash,
    qr: generated.qr,
    totalWithVat: generated.totalWithVat,
    vatTotal: generated.vatTotal,
    warning: 'Invoice is generated and signed locally. Run official ZATCA SDK validation and sandbox submission before any production use.'
  };
});

/**
 * Returns a previously generated invoice XML for authenticated SDK validation.
 * The XML contains public certificate/signature material, never the private key.
 */
exports.zatcaGetGeneratedInvoice = onCall({ region: REGION }, async (request) => {
  const uid = requireUser(request);
  const saleId = String(request.data && request.data.saleId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(saleId)) {
    throw new HttpsError('invalid-argument', 'A valid POS sale document ID is required.');
  }
  const snap = await db.doc(`zatca_tenants/${uid}/invoices/${saleId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Generated invoice was not found.');
  const invoice = snap.data();
  return {
    saleId,
    invoiceNumber: invoice.number,
    uuid: invoice.uuid,
    invoiceHash: invoice.invoiceHash,
    icv: invoice.icv,
    pih: invoice.pih,
    qr: invoice.qr,
    xml: invoice.xml
  };
});

/**
 * Explicit sandbox submission of an already generated immutable invoice.
 * Ambiguous outcomes are blocked from automatic retry to prevent duplicate reporting.
 */
exports.zatcaSubmitGeneratedInvoice = onCall({
  region: REGION,
  timeoutSeconds: 60,
  secrets: [ZATCA_ONBOARDING_ENCRYPTION_KEY]
}, async (request) => {
  const uid = requireUser(request);
  const input = request.data || {};
  const saleId = String(input.saleId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(saleId)) {
    throw new HttpsError('invalid-argument', 'A valid POS sale document ID is required.');
  }
  const env = getEnvironment();
  if (env !== 'sandbox') {
    throw new HttpsError('failed-precondition', 'This generated-invoice submission callable is sandbox-only.');
  }
  const checked = validateProductionRequest({ requestId: input.onboardingRequestId });
  if (!checked.valid) throw new HttpsError('invalid-argument', 'A valid sandbox onboardingRequestId is required.');
  onboardingEncryptionKey();

  const onboardingSnap = await db.doc('users/' + uid + '/zatcaOnboarding/' + checked.requestId).get();
  if (!onboardingSnap.exists || onboardingSnap.data().status !== 'sandbox_production_csid_issued') {
    throw new HttpsError('failed-precondition', 'A sandbox Production CSID must be issued through onboarding before submission.');
  }
  const credentials = decryptOnboardingValue(onboardingSnap.data().sandboxProductionCredentialsEncrypted);
  const invoiceRef = db.doc('zatca_tenants/' + uid + '/invoices/' + saleId);
  const submissionRef = db.doc('zatca_tenants/' + uid + '/submissions/' + saleId);
  const jobRef = db.doc('users/' + uid + '/zatcaInvoices/sale-' + saleId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Generate the invoice before submitting it.');
  const invoice = invoiceSnap.data();
  const documentType = String(invoice.subtype || '').toLowerCase();
  if (!['standard', 'simplified'].includes(documentType)) {
    throw new HttpsError('failed-precondition', 'Generated invoice has an invalid document type.');
  }
  const invoiceBase64 = Buffer.from(String(invoice.xml || ''), 'utf8').toString('base64');
  const payloadCheck = validateSignedInvoicePayload({
    uuid: invoice.uuid, invoiceHash: invoice.invoiceHash, invoice: invoiceBase64
  });
  if (!payloadCheck.valid) throw new HttpsError('failed-precondition', payloadCheck.reason);

  const reservation = await db.runTransaction(async (tx) => {
    const existing = await tx.get(submissionRef);
    if (existing.exists) {
      const state = String(existing.data().status || '').toLowerCase();
      if (state === 'reported' || state === 'cleared') return { duplicate: true, status: state };
      if (state === 'processing') throw new HttpsError('aborted', 'This invoice is already being submitted.');
      if (state === 'submission_unknown' || state === 'submitted') {
        throw new HttpsError('failed-precondition', 'A previous request may have reached FATOORA. Reconcile its outcome before retrying this invoice.');
      }
      tx.set(submissionRef, {
        status: 'processing',
        attempts: Number(existing.data().attempts || 0) + 1,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { duplicate: false };
    }
    tx.create(submissionRef, {
      saleId, uuid: invoice.uuid, invoiceHash: invoice.invoiceHash,
      status: 'processing', attempts: 1,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return { duplicate: false };
  });
  if (reservation.duplicate) return { duplicate: true, status: reservation.status, saleId, uuid: invoice.uuid };

  try {
    const standard = documentType === 'standard';
    const result = await zatcaRequest({
      env,
      path: standard ? '/invoices/clearance/single' : '/invoices/reporting/single',
      headers: { 'Clearance-Status': standard ? '1' : '0' },
      credentials,
      body: { invoiceHash: invoice.invoiceHash, uuid: invoice.uuid, invoice: invoiceBase64 }
    });
    const status = classifySubmissionOutcome({ documentType, responseData: result.data });
    await submissionRef.set({
      status, response: result.data, requestId: result.headers.requestId || null,
      submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await jobRef.set({
      status, response: result.data, requestId: result.headers.requestId || null,
      submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { saleId, uuid: invoice.uuid, status, environment: env, response: result.data };
  } catch (error) {
    const httpStatus = Number(error.details && error.details.status);
    const uncertain = error.code === 'unavailable' || httpStatus >= 500;
    const status = uncertain ? 'submission_unknown' : 'failed';
    const details = {
      status,
      errorCode: error.code || 'zatca_error',
      errorMessage: error.message || 'FATOORA submission failed',
      errorDetails: error.details || null,
      manualReconciliationRequired: uncertain,
      updatedAt: FieldValue.serverTimestamp()
    };
    await submissionRef.set(details, { merge: true });
    await jobRef.set(details, { merge: true });
    throw error;
  }
});

/**
 * Starts FATOORA Compliance CSID onboarding. OTP is accepted only for this
 * request and is never persisted. CSID credentials are encrypted at rest
 * before the callable returns; they are never exposed to the browser.
 */
exports.zatcaRequestComplianceCsid = onCall({ region: REGION, timeoutSeconds: 60, secrets: [ZATCA_ONBOARDING_ENCRYPTION_KEY] }, async (request) => {
  requireUser(request);
  const checked = validateComplianceRequest({
    otp: request.data && request.data.otp,
    csr: request.data && request.data.csr
  });
  if (!checked.valid) throw new HttpsError('invalid-argument', checked.reason);
  onboardingEncryptionKey(); // Fail before requesting a certificate if secure storage is not configured.
  const env = getEnvironment();
  if (env === 'production') {
    throw new HttpsError('failed-precondition', 'Compliance onboarding must be performed in the configured sandbox workflow first; production onboarding is not enabled by this callable.');
  }
  const url = getBaseUrl(env) + '/compliance';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'en',
        'Accept-Version': API_VERSION,
        OTP: checked.otp
      },
      body: JSON.stringify({ csr: checked.csr }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    throw new HttpsError('unavailable', 'Could not reach the FATOORA compliance onboarding endpoint.', {
      cause: String(error && error.message || error)
    });
  }
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: raw.slice(0, 1000) }; }
  if (!response.ok) {
    throw new HttpsError('failed-precondition', 'FATOORA rejected the Compliance CSID request.', {
      status: response.status, response: data
    });
  }
  const credentials = extractCsidCredentials(data);
  if (!credentials.valid) {
    throw new HttpsError('data-loss', credentials.reason);
  }
  await db.doc(`users/${request.auth.uid}/zatcaOnboarding/${credentials.requestId}`).set({
    requestId: credentials.requestId, environment: env, status: 'compliance_csid_issued',
    complianceCredentialsEncrypted: encryptOnboardingValue({ token: credentials.token, secret: credentials.secret }),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    accepted: true,
    environment: env,
    requestId: credentials.requestId,
    credentialsStoredEncrypted: true,
    warning: 'Compliance credentials are encrypted server-side with AES-256-GCM. The encryption key must remain in Firebase Secret Manager.'
  };
});

/**
 * Sends one pre-generated, signed compliance test invoice. It never creates
 * tax XML or signs documents. The caller supplies official SDK-validated
 * signed test fixtures; Compliance CSID credentials are decrypted server-side.
 */
exports.zatcaSubmitComplianceInvoice = onCall({ region: REGION, timeoutSeconds: 60, secrets: [ZATCA_ONBOARDING_ENCRYPTION_KEY] }, async (request) => {
  requireUser(request);
  const input = request.data || {};
  const uuid = String(input.uuid || '').trim();
  const invoiceHash = String(input.invoiceHash || '').trim();
  const invoice = String(input.invoice || '').trim();
  const clearanceStatus = String(input.clearanceStatus || '');
  const requestId = String(input.requestId || '').trim();
  const scenario = String(input.scenario || '').trim();
  const scenarios = ['standard_invoice', 'standard_credit_note', 'standard_debit_note', 'simplified_invoice', 'simplified_credit_note', 'simplified_debit_note'];
  if (!validateProductionRequest({ requestId }).valid || !scenarios.includes(scenario)) {
    throw new HttpsError('invalid-argument', 'A valid compliance requestId and supported scenario are required.');
  }
  if (!['0', '1'].includes(clearanceStatus)) {
    throw new HttpsError('invalid-argument', 'clearanceStatus must be 0 (reporting) or 1 (clearance).');
  }
  if ((scenario.startsWith('standard_') && clearanceStatus !== '1') || (scenario.startsWith('simplified_') && clearanceStatus !== '0')) {
    throw new HttpsError('invalid-argument', 'clearanceStatus must match the Standard or Simplified scenario.');
  }
  const payloadCheck = validateSignedInvoicePayload({ uuid, invoiceHash, invoice });
  if (!payloadCheck.valid) throw new HttpsError('invalid-argument', payloadCheck.reason);
  const env = getEnvironment();
  if (env !== 'sandbox') throw new HttpsError('failed-precondition', 'Compliance invoice checks are locked to sandbox in this workflow.');
  const onboardingRef = db.doc(`users/${request.auth.uid}/zatcaOnboarding/${requestId}`);
  const onboardingSnap = await onboardingRef.get();
  if (!onboardingSnap.exists || onboardingSnap.data().status !== 'compliance_csid_issued') {
    throw new HttpsError('failed-precondition', 'No matching Compliance CSID onboarding request exists for this account.');
  }
  const credentials = decryptOnboardingValue(onboardingSnap.data().complianceCredentialsEncrypted);
  const result = await zatcaRequest({
    env,
    path: '/compliance/invoices',
    credentials,
    headers: { 'Clearance-Status': clearanceStatus },
    body: { invoiceHash, uuid, invoice }
  });
  const validationStatus = String(result.data && result.data.validationResults && result.data.validationResults.status || '').toUpperCase();
  const passed = validationStatus === 'PASS';
  await onboardingRef.collection('checks').doc(scenario).set({
    scenario, uuid, clearanceStatus, validationStatus: validationStatus || 'UNKNOWN',
    passed, response: result.data, updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { accepted: passed, environment: env, uuid, scenario, validationStatus: validationStatus || 'UNKNOWN', response: result.data };
});

/**
 * Exchanges a Compliance CSID for a Production CSID only after the taxpayer
 * confirms all required compliance invoice checks have passed. This callable
 * remains sandbox-only and stores the resulting credentials encrypted server-side.
 */
exports.zatcaRequestProductionCsid = onCall({ region: REGION, timeoutSeconds: 60, secrets: [ZATCA_ONBOARDING_ENCRYPTION_KEY] }, async (request) => {
  requireUser(request);
  const input = request.data || {};
  const checked = validateProductionRequest({ requestId: input.requestId });
  if (!checked.valid) throw new HttpsError('invalid-argument', checked.reason);
  const env = getEnvironment();
  if (env !== 'sandbox') throw new HttpsError('failed-precondition', 'Production CSID exchange is locked to sandbox in this workflow.');
  const onboardingRef = db.doc(`users/${request.auth.uid}/zatcaOnboarding/${checked.requestId}`);
  const onboardingSnap = await onboardingRef.get();
  if (!onboardingSnap.exists || onboardingSnap.data().status !== 'compliance_csid_issued') {
    throw new HttpsError('failed-precondition', 'No matching Compliance CSID onboarding request exists for this account.');
  }
  const complianceCredentials = decryptOnboardingValue(onboardingSnap.data().complianceCredentialsEncrypted);
  const requiredScenarios = ['standard_invoice', 'standard_credit_note', 'standard_debit_note', 'simplified_invoice', 'simplified_credit_note', 'simplified_debit_note'];
  const checkSnaps = await Promise.all(requiredScenarios.map((name) => onboardingRef.collection('checks').doc(name).get()));
  const missingChecks = requiredScenarios.filter((name, index) => !checkSnaps[index].exists || checkSnaps[index].data().passed !== true);
  if (missingChecks.length) throw new HttpsError('failed-precondition', 'Required compliance scenarios have not all passed.', { missingChecks });
  const result = await zatcaRequest({
    env,
    path: '/production/csids',
    credentials: complianceCredentials,
    body: { compliance_request_id: checked.requestId }
  });
  const issued = extractCsidCredentials(result.data, { requireRequestId: false });
  if (!issued.valid) throw new HttpsError('data-loss', issued.reason);
  await onboardingRef.set({
    sandboxProductionCredentialsEncrypted: encryptOnboardingValue({ token: issued.token, secret: issued.secret }),
    status: 'sandbox_production_csid_issued',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    accepted: true,
    environment: env,
    requestId: checked.requestId,
    credentialsStoredEncrypted: true,
    warning: 'Sandbox Production CSID credentials are encrypted server-side. This does not create or verify a production CSID.'
  };
});

exports.zatcaCheckCredentials = onCall({
  region: REGION,
  secrets: [ZATCA_PROD_TOKEN, ZATCA_PROD_SECRET, ZATCA_SANDBOX_TOKEN, ZATCA_SANDBOX_SECRET]
}, async (request) => {
  requireUser(request);
  const env = getEnvironment();
  const credentials = getCredentials(env);
  return {
    credentialsConfigured: true,
    environment: env,
    baseUrl: getBaseUrl(env),
    authenticationConfigured: !!credentials.token && !!credentials.secret,
    note: 'Secret values are configured. This is not a network test; production activation requires a valid production CSID and successful end-to-end compliance verification.'
  };
});
