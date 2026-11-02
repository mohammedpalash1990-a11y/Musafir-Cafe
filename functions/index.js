'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
const SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
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
    if (vat && !/^3\\d{13}3$/.test(vat)) missing.push('vatNumber (must be a 15-digit Saudi VAT number)');
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
    if (!configured.startsWith('https://')) {
      throw new HttpsError('failed-precondition', 'ZATCA_API_BASE_URL must use HTTPS.');
    }
    return configured.replace(/\\/+$/, '');
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
    productionCsid: env === 'production' && credentials ? 'configured in Secret Manager' : 'not configured',
    productionEnabled: env === 'production' && credentials && !!z.enabled && missing.length === 0,
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

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new HttpsError('invalid-argument', 'A valid invoice UUID is required.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(invoiceBase64) || invoiceBase64.length > 1400000) {
    throw new HttpsError('invalid-argument', 'Invoice must be a base64-encoded XML string under 1 MB.');
  }
  if (!/^[a-f0-9]{64}$/i.test(invoiceHash)) {
    throw new HttpsError('invalid-argument', 'invoiceHash must be a 64-character SHA-256 hex digest.');
  }
  if (!['simplified', 'standard'].includes(documentType)) {
    throw new HttpsError('invalid-argument', 'documentType must be simplified or standard.');
  }

  const xml = Buffer.from(invoiceBase64, 'base64').toString('utf8');
  if (!xml.includes('<Invoice') || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new HttpsError('invalid-argument', 'A UBL Invoice XML document is required; DTD and ENTITY declarations are forbidden.');
  }

  const { z, missing } = await getProfile(uid);
  if (!z.enabled || missing.length) {
    throw new HttpsError('failed-precondition', 'Complete the ZATCA seller profile first.', { missing });
  }

  const env = getEnvironment();
  if (env === 'production' && !z.productionApproved) {
    throw new HttpsError('failed-precondition', 'Production submission is locked until the taxpayer confirms production CSID onboarding in the ZATCA portal.');
  }

  const invoiceRef = db.doc(`users/${uid}/zatcaInvoices/${uuid}`);
  const reservation = await db.runTransaction(async (tx) => {
    const existing = await tx.get(invoiceRef);
    if (existing.exists) {
      const state = existing.data().status;
      if (state === 'reported' || state === 'cleared') return { duplicate: true, data: existing.data() };
      if (state === 'processing') throw new HttpsError('aborted', 'This invoice is already being submitted.');
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
    const status = documentType === 'standard'
      ? (result.data.clearedInvoice ? 'cleared' : 'submitted')
      : (String(result.data.status || '').toLowerCase() === 'reported' ? 'reported' : 'submitted');
    await invoiceRef.update({
      status, response: result.data, requestId: result.headers.requestId,
      submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return { uuid, status, environment: env, response: result.data };
  } catch (error) {
    await invoiceRef.update({
      status: 'failed', errorCode: error.code || 'zatca_error',
      errorMessage: error.message || 'ZATCA submission failed',
      errorDetails: error.details || null,
      updatedAt: FieldValue.serverTimestamp()
    });
    throw error;
  }
});

exports.zatcaTestGateway = onCall({
  region: REGION,
  secrets: [ZATCA_PROD_TOKEN, ZATCA_PROD_SECRET, ZATCA_SANDBOX_TOKEN, ZATCA_SANDBOX_SECRET]
}, async (request) => {
  requireUser(request);
  const env = getEnvironment();
  const credentials = getCredentials(env);
  return {
    reachableConfiguration: true,
    environment: env,
    baseUrl: getBaseUrl(env),
    authenticationConfigured: !!credentials.token && !!credentials.secret,
    note: 'Credentials are configured. A successful invoice API response still requires a valid onboarded CSID and a compliant signed invoice.'
  };
});
