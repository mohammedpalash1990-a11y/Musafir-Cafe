'use strict';
const { PATHS } = require('./config');
const basic = (token, secret) => 'Basic ' + Buffer.from(`${token}:${secret}`).toString('base64');
async function call(env, path, { method = 'POST', headers = {}, body }, fetchImpl = fetch, timeoutMs = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(env.base + path, {
      method, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'en', 'Accept-Version': 'V2', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  } catch (e) { return { status: 0, json: null, networkError: String(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || e) }; }
  finally { clearTimeout(t); }
}
const requestComplianceCsid = (env, csrB64, otp, f) => call(env, PATHS.compliance, { headers: { OTP: otp }, body: { csr: csrB64 } }, f);
const complianceCheck = (env, c, p, f) => call(env, PATHS.complianceInvoices, { headers: { Authorization: basic(c.token, c.secret) }, body: p }, f);
const requestProductionCsid = (env, c, complianceRequestId, f) => call(env, PATHS.productionCsids, { headers: { Authorization: basic(c.token, c.secret) }, body: { compliance_request_id: complianceRequestId } }, f);
const report = (env, c, p, f) => call(env, PATHS.reporting, { headers: { Authorization: basic(c.token, c.secret), 'Clearance-Status': '0' }, body: p }, f);
const clear = (env, c, p, f) => call(env, PATHS.clearance, { headers: { Authorization: basic(c.token, c.secret), 'Clearance-Status': '1' }, body: p }, f);

// Never mark success unless the API explicitly says so.
function classify(kind, r) {
  if (r.status === 0) return { status: 'Failed', retryable: true, reason: `Network: ${r.networkError}` };
  const j = r.json || {};
  if (r.status === 200 || r.status === 202) {
    if (kind === 'reporting' && j.reportingStatus === 'REPORTED') return { status: 'Reported', warnings: r.status === 202 };
    if (kind === 'clearance' && j.clearanceStatus === 'CLEARED') return { status: 'Cleared', warnings: r.status === 202 };
    return { status: 'Failed', retryable: false, reason: 'Unexpected success response; needs manual review' };
  }
  if (r.status === 401) return { status: 'Failed', retryable: false, reason: 'Authentication failed (check CSID)' };
  if (r.status === 429 || r.status === 408 || r.status >= 500) return { status: 'Failed', retryable: true, reason: `Server status ${r.status}` };
  if (r.status === 409) return { status: 'Failed', retryable: false, reason: 'Duplicate/conflict reported by ZATCA; needs manual review' };
  return { status: 'Rejected', retryable: false, reason: `Rejected (${r.status})` };
}
module.exports = { requestComplianceCsid, complianceCheck, requestProductionCsid, report, clear, classify, basic };
