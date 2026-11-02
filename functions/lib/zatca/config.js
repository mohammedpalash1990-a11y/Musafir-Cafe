'use strict';
// Environment configuration. Endpoint paths follow ZATCA's published API list.
// PRODUCTION ("core") needs an explicit approval flag on every call (approve:true) plus the owner's real OTP.
// Sandbox and Simulation never touch real tax records.
const HOST = 'https://gw-fatoora.zatca.gov.sa/e-invoicing';
const ENVIRONMENTS = {
  sandbox:    { base: `${HOST}/developer-portal`, csrTemplate: 'TSTZATCA-Code-Signing', cnPrefix: 'TST', fixedOtp: '123345', live: false },
  simulation: { base: `${HOST}/simulation`,       csrTemplate: 'PREZATCA-Code-Signing', cnPrefix: 'PRE', fixedOtp: null,     live: false },
  production: { base: `${HOST}/core`,             csrTemplate: 'ZATCA-Code-Signing',    cnPrefix: '',    fixedOtp: null,     live: true  },
};
const PATHS = {
  compliance: '/compliance',
  complianceInvoices: '/compliance/invoices',
  productionCsids: '/production/csids',
  reporting: '/invoices/reporting/single',
  clearance: '/invoices/clearance/single',
};
function getEnv(name = 'sandbox', opts = {}) {
  const env = ENVIRONMENTS[name];
  if (!env) throw new Error(`Unknown ZATCA environment: ${name}`);
  if (env.live && opts.approve !== true) throw new Error('Production (real tax records) needs explicit approval: pass approve:true.');
  return { name, ...env };
}
module.exports = { ENVIRONMENTS, PATHS, getEnv };
