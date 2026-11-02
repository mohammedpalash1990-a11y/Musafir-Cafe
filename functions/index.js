'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { assessSaleForZatca } = require('./zatca-egs');
const { validateSignedInvoicePayload, classifySubmissionOutcome } = require('./zatca-invoice-validation');
const { validateComplianceRequest, extractCsidCredentials, validateProductionRequest } = require('./zatca-onboarding');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const ZATCA_PROD_TOKEN = defineSecret('ZATCA_PROD_TOKEN');
const ZATCA_PROD_SECRET = defineSecret('ZATCA_PROD_SECRET');
const ZATCA_SANDBOX_TOKEN = defineSecret('ZATCA_SANDBOX_TOKEN');
const ZATCA_SANDBOX_SECRET = defineSecret('ZATCA_SANDBOX_SECRET');

const REGION = 'me-central1';
const API_VERSION = 'V2';
const SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';
const PRODUCTION_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

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
  region: REGION
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
 * Starts FATOORA Compliance CSID onboarding. OTP is accepted only for this
 * request and is never persisted. Returned CSID credentials are sensitive:
 * caller must transfer them directly to a secure secret store and must not
 * place them in browser storage, Firestore, logs, or source control.
 */
exports.zatcaRequestComplianceCsid = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  requireUser(request);
  const checked = validateComplianceRequest({
    otp: request.data && request.data.otp,
    csr: request.data && request.data.csr
  });
  if (!checked.valid) throw new HttpsError('invalid-argument', checked.reason);
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
  return {
    accepted: true,
    environment: env,
    requestId: credentials.requestId,
    complianceCsid: credentials.token,
    complianceSecret: credentials.secret,
    warning: 'Sensitive one-time response. Transfer credentials to an approved secret manager immediately; do not save in browser storage, Firestore, logs, or GitHub.'
  };
});

/**
 * Sends one pre-generated, signed compliance test invoice. It never creates
 * tax XML or signs documents. The caller must supply official SDK-validated
 * test fixtures and Compliance CSID credentials.
 */
exports.zatcaSubmitComplianceInvoice = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  requireUser(request);
  const input = request.data || {};
  const credentials = {
    token: String(input.complianceCsid || ''),
    secret: String(input.complianceSecret || '')
  };
  if (!credentials.token || !credentials.secret) {
    throw new HttpsError('invalid-argument', 'Compliance CSID and secret are required.');
  }
  const uuid = String(input.uuid || '').trim();
  const invoiceHash = String(input.invoiceHash || '').trim();
  const invoice = String(input.invoice || '').trim();
  const clearanceStatus = String(input.clearanceStatus || '');
  if (!['0', '1'].includes(clearanceStatus)) {
    throw new HttpsError('invalid-argument', 'clearanceStatus must be 0 (reporting) or 1 (clearance).');
  }
  const payloadCheck = validateSignedInvoicePayload({ uuid, invoiceHash, invoice });
  if (!payloadCheck.valid) throw new HttpsError('invalid-argument', payloadCheck.reason);
  const env = getEnvironment();
  if (env !== 'sandbox') throw new HttpsError('failed-precondition', 'Compliance invoice checks are locked to sandbox in this workflow.');
  const result = await zatcaRequest({
    env,
    path: '/compliance/invoices',
    credentials,
    headers: { 'Clearance-Status': clearanceStatus },
    body: { invoiceHash, uuid, invoice }
  });
  return { accepted: true, environment: env, uuid, response: result.data };
});

/**
 * Exchanges a Compliance CSID for a Production CSID only after the taxpayer
 * confirms all required compliance invoice checks have passed. This callable
 * remains sandbox-only and returns credentials once; it does not persist them.
 */
exports.zatcaRequestProductionCsid = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  requireUser(request);
  const input = request.data || {};
  const checked = validateProductionRequest({ requestId: input.requestId });
  if (!checked.valid) throw new HttpsError('invalid-argument', checked.reason);
  const token = String(input.complianceCsid || '');
  const secret = String(input.complianceSecret || '');
  if (!token || !secret) throw new HttpsError('invalid-argument', 'Compliance CSID and secret are required.');
  if (input.complianceChecksPassed !== true) {
    throw new HttpsError('failed-precondition', 'Confirm that every required compliance invoice check passed before requesting a Production CSID.');
  }
  const env = getEnvironment();
  if (env !== 'sandbox') throw new HttpsError('failed-precondition', 'Production CSID exchange is locked to sandbox in this workflow.');
  const result = await zatcaRequest({
    env,
    path: '/production/csids',
    credentials: { token, secret },
    body: { compliance_request_id: checked.requestId }
  });
  const issued = extractCsidCredentials(result.data);
  if (!issued.valid) throw new HttpsError('data-loss', issued.reason);
  return {
    accepted: true,
    environment: env,
    requestId: issued.requestId,
    productionCsid: issued.token,
    productionSecret: issued.secret,
    warning: 'Sensitive one-time response. Store only in Firebase Secret Manager. Production invoice submission remains disabled until separate administrator verification.'
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
