'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseArgs, validateOptions, buildOpenSslConfig, generate } = require('./generate-zatca-csr');

const base = {
  vat: '312345678901233',
  branch: 'Madinah Branch',
  organization: 'Musafir Cafe LLC',
  address: 'King Road, Madinah 42311',
  industry: 'Cafe and Restaurant'
};

test('validates Saudi VAT, TSCZ functionality map and required CSR identity fields', () => {
  const p = validateOptions(base);
  assert.equal(p.environment, 'sandbox');
  assert.equal(p.template, 'TSTZATCA-Code-Signing');
  assert.equal(p.invoiceType, '1100');
  assert.match(p.serialNumber, /^1-MusafirCafe\|2-POS\|3-/);
  assert.throws(() => validateOptions({ ...base, vat: '123' }), /15 digits/);
  assert.throws(() => validateOptions({ ...base, 'invoice-type': '0000' }), /functionality map/);
  assert.throws(() => validateOptions({ ...base, organization: 'bad\nvalue' }), /single line/);
});

test('supports the distinct sandbox, simulation and production CSR templates', () => {
  assert.equal(validateOptions({ ...base, environment: 'simulation' }).template, 'PREZATCA-Code-Signing');
  assert.equal(validateOptions({ ...base, environment: 'production' }).template, 'ZATCA-Code-Signing');
});

test('builds the OpenSSL CSR config with the ZATCA subject alternative-name fields', () => {
  const config = buildOpenSslConfig(validateOptions(base));
  assert.match(config, /certificateTemplateName = ASN1:PRINTABLESTRING:TSTZATCA-Code-Signing/);
  assert.match(config, /subjectAltName = dirName:alt_names/);
  assert.match(config, /organizationIdentifier = "312345678901233"/);
  assert.match(config, /businessCategory = 1100/);
  assert.match(config, /SN = "1-MusafirCafe\|2-POS\|3-/);
  assert.match(config, /registeredAddress = "King Road\\, Madinah 42311"/);
  assert.match(config, /businessCategory = "Cafe and Restaurant"/);
});

test('parses only explicit named CLI options and rejects missing values', () => {
  assert.deepEqual(parseArgs(['--vat', '312345678901233', '--branch', 'Madinah']), {
    vat: '312345678901233', branch: 'Madinah'
  });
  assert.throws(() => parseArgs(['--vat']), /Missing value/);
  assert.throws(() => parseArgs(['--vat', '1', '--vat', '2']), /duplicate/);
});


test('generates a verifiable local secp256k1 CSR and protects the private key file', () => {
  const result = generate([
    '--vat', base.vat,
    '--organization', base.organization,
    '--branch', base.branch,
    '--address', base.address,
    '--industry', base.industry,
    '--environment', 'sandbox'
  ]);
  try {
    const keyStat = fs.statSync(result.keyPath);
    const csrPem = fs.readFileSync(result.csrPath, 'utf8');
    const csrBase64 = fs.readFileSync(result.base64Path, 'utf8');
    assert.equal(keyStat.mode & 0o777, 0o600);
    assert.match(csrPem, /-----BEGIN CERTIFICATE REQUEST-----/);
    const details = require('node:child_process').execFileSync('openssl', ['req', '-in', result.csrPath, '-noout', '-subject', '-text'], { encoding: 'utf8' });
    assert.match(details, /organizationIdentifier=312345678901233/);
    assert.match(details, /businessCategory=1100/);
    assert.match(details, /registeredAddress=King Road\\, Madinah/);
    assert.equal(Buffer.from(csrBase64, 'base64').toString('utf8'), csrPem);
  } finally {
    fs.rmSync(result.outputDir, { recursive: true, force: true });
  }
});
