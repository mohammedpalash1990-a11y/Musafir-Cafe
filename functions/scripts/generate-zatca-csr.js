'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ENV_TEMPLATES = Object.freeze({
  sandbox: 'TSTZATCA-Code-Signing',
  simulation: 'PREZATCA-Code-Signing',
  production: 'ZATCA-Code-Signing'
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error('Unexpected argument: ' + token);
    const key = token.slice(2);
    if (!key || out[key] !== undefined) throw new Error('Invalid or duplicate option: ' + token);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error('Missing value for ' + token);
    out[key] = value;
  }
  return out;
}

function clean(value, label, max = 160) {
  const text = String(value || '').trim();
  if (!text || text.length > max || /[\r\n\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(label + ' is required and must be a single line of at most ' + max + ' characters.');
  }
  return text;
}

function validateOptions(input) {
  const env = String(input.environment || 'sandbox').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ENV_TEMPLATES, env)) {
    throw new Error('environment must be sandbox, simulation, or production.');
  }
  const vat = clean(input.vat, 'VAT number', 15);
  if (!/^3\d{13}3$/.test(vat)) throw new Error('VAT number must be 15 digits, starting and ending with 3.');
  const invoiceType = String(input['invoice-type'] || '1100');
  if (!/^[01]{4}$/.test(invoiceType) || invoiceType === '0000') {
    throw new Error('invoice-type must be a non-zero four-digit TSCZ functionality map (for example 1100).');
  }
  const solutionName = clean(input['solution-name'] || 'MusafirCafe', 'solution-name', 40).replace(/[|]/g, '');
  const model = clean(input.model || 'POS', 'model', 40).replace(/[|]/g, '');
  const serial = clean(input.serial || crypto.randomUUID(), 'serial', 80).replace(/[|]/g, '');
  const serialNumber = '1-' + solutionName + '|2-' + model + '|3-' + serial;
  const commonName = clean(input['common-name'] || (solutionName + '-' + model + '-' + serial.slice(0, 8)), 'common-name', 64);
  const branch = clean(input.branch, 'branch', 64);
  const organization = clean(input.organization, 'organization', 128);
  const address = clean(input.address, 'address', 160);
  const industry = clean(input.industry, 'industry', 64);
  return {
    environment: env,
    template: ENV_TEMPLATES[env],
    vat,
    invoiceType,
    serialNumber,
    commonName,
    branch,
    organization,
    address,
    industry
  };
}

function configValue(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/,/g, '\\,') + '"';
}

function buildOpenSslConfig(p) {
  return [
    'oid_section = OIDs',
    '',
    '[ OIDs ]',
    'certificateTemplateName = 1.3.6.1.4.1.311.20.2',
    '',
    '[ req ]',
    'prompt = no',
    'default_md = sha256',
    'distinguished_name = dn',
    'req_extensions = req_ext',
    '',
    '[ dn ]',
    'CN = ' + configValue(p.commonName),
    'OU = ' + configValue(p.branch),
    'O = ' + configValue(p.organization),
    'C = SA',
    'organizationIdentifier = ' + configValue(p.vat),
    'businessCategory = ' + p.invoiceType,
    '',
    '[ req_ext ]',
    'certificateTemplateName = ASN1:PRINTABLESTRING:' + p.template,
    'subjectAltName = dirName:alt_names',
    '',
    '[ alt_names ]',
    'SN = ' + configValue(p.serialNumber),
    'registeredAddress = ' + configValue(p.address),
    'businessCategory = ' + configValue(p.industry),
    ''
  ].join('\n');
}

function generate(argv = process.argv.slice(2)) {
  const p = validateOptions(parseArgs(argv));
  const id = crypto.randomUUID();
  const outputDir = path.resolve(__dirname, '../../.secrets/zatca', id);
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(outputDir, 'egs-private-key.pem');
  const csrPath = path.join(outputDir, 'egs.csr');
  const configPath = path.join(outputDir, 'zatca-csr.cnf');
  const base64Path = path.join(outputDir, 'egs.csr.base64.txt');

  fs.writeFileSync(configPath, buildOpenSslConfig(p), { mode: 0o600, flag: 'wx' });
  execFileSync('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath], { stdio: 'pipe' });
  fs.chmodSync(keyPath, 0o600);
  execFileSync('openssl', ['req', '-new', '-sha256', '-key', keyPath, '-extensions', 'req_ext', '-config', configPath, '-out', csrPath], { stdio: 'pipe' });
  execFileSync('openssl', ['req', '-in', csrPath, '-noout', '-verify'], { stdio: 'pipe' });
  const csrPem = fs.readFileSync(csrPath, 'utf8');
  fs.writeFileSync(base64Path, Buffer.from(csrPem, 'utf8').toString('base64'), { mode: 0o600, flag: 'wx' });

  process.stdout.write([
    'ZATCA CSR generated locally.',
    'Environment/template: ' + p.environment + ' / ' + p.template,
    'CSR Base64 (paste into the authenticated onboarding screen): ' + base64Path,
    'Private key (never upload to GitHub or chat): ' + keyPath,
    'OpenSSL config: ' + configPath,
    'Next: keep the private key in your protected local backup, then provision it to Firebase Secret Manager as ZATCA_EGS_PRIVATE_KEY using your secured terminal.',
    'The CSR request has NOT been sent to ZATCA; no OTP or CSID has been used.'
  ].join('\n') + '\n');
  return { outputDir, keyPath, csrPath, configPath, base64Path, environment: p.environment };
}

if (require.main === module) {
  try { generate(); }
  catch (error) {
    process.stderr.write('CSR generation failed: ' + (error.message || String(error)) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, validateOptions, buildOpenSslConfig, generate };
