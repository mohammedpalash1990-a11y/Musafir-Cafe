'use strict';
// CSR + secp256k1 key generation through the OpenSSL CLI, following ZATCA's published csr.cnf layout.
// The private key is returned to the caller ONLY so it can go straight into Secret Manager. It is never logged.
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises'); const os = require('os'); const path = require('path');
const run = promisify(execFile);
const clean = (s) => String(s).replace(/[\r\n=\\]/g, ' ').trim();

function buildConfig({ profile, templateName, egsId, cnPrefix }) {
  const funcMap = profile.invoiceType === 'standard' ? '1000' : '0100';
  return `oid_section = OIDs
[OIDs]
certificateTemplateName = 1.3.6.1.4.1.311.20.2
[req]
default_bits = 2048
prompt = no
default_md = sha256
utf8 = yes
string_mask = utf8only
req_extensions = req_ext
distinguished_name = dn
[dn]
C = SA
OU = ${clean(profile.branchName || profile.sellerName)}
O = ${clean(profile.sellerName)}
CN = ${cnPrefix ? clean(cnPrefix) + '-' : ''}${clean(egsId)}-${clean(profile.vatNumber)}
[req_ext]
certificateTemplateName = ASN1:PRINTABLESTRING:${templateName}
subjectAltName = dirName:alt_names
[alt_names]
SN = 1-Musafir|2-POS|3-${clean(egsId)}
UID = ${clean(profile.vatNumber)}
title = ${funcMap}
registeredAddress = ${clean(`${profile.building} ${profile.street} ${profile.district} ${profile.city}`)}
businessCategory = ${clean(profile.businessCategory || 'Food and beverage')}
`;
}
async function generateKeyAndCsr({ profile, templateName, egsId, cnPrefix = 'TST' }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zatca-'));
  try {
    const cnf = path.join(dir, 'csr.cnf'), key = path.join(dir, 'key.pem'), csr = path.join(dir, 'csr.pem');
    await fs.writeFile(cnf, buildConfig({ profile, templateName, egsId, cnPrefix }), { mode: 0o600 });
    await run('openssl', ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', key]);
    await run('openssl', ['req', '-new', '-sha256', '-key', key, '-config', cnf, '-out', csr]);
    const privateKeyPem = await fs.readFile(key, 'utf8'); const csrPem = await fs.readFile(csr, 'utf8');
    return { privateKeyPem, csrPem, csrB64: Buffer.from(csrPem, 'utf8').toString('base64') };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
module.exports = { generateKeyAndCsr, buildConfig };
