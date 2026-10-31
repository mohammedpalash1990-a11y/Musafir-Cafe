'use strict';
// Environment configuration. Endpoint paths follow ZATCA's published API list.
// PRODUCTION ("core") is intentionally locked: it needs BOTH the env flag below
// AND an explicit per-user approval document. Nothing in this code enables it.
const HOST = 'https://gw-fatoora.zatca.gov.sa/e-invoicing';
const ENVIRONMENTS = {
  sandbox:    { base: `${HOST}/developer-portal`, csrTemplate: 'TSTZATCA-Code-Signing', fixedOtp: '123345', allowed: true },
  simulation: { base: `${HOST}/simulation`,       csrTemplate: 'PREZATCA-Code-Signing', fixedOtp: null,     allowed: false },
  production: { base: `${HOST}/core`,             csrTemplate: 'ZATCA-Code-Signing',    fixedOtp: null,     allowed: false },
};
const PATHS = {
  compliance: '/compliance',
  complianceInvoices: '/compliance/invoices',
  productionCsids: '/production/csids',
  reporting: '/invoices/reporting/single',
  clearance: '/invoices/clearance/single',
};
// Only sandbox is usable in this release.
function getEnv(name = 'sandbox') {
  const env = ENVIRONMENTS[name];
  if (!env) throw new Error(`Unknown ZATCA environment: ${name}`);
  if (!env.allowed) throw new Error(`Environment "${name}" is locked. Production/simulation need your explicit approval and a code change.`);
  return { name, ...env };
}
module.exports = { ENVIRONMENTS, PATHS, getEnv };
