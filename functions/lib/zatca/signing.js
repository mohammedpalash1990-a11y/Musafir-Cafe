'use strict';
// Hash, ECDSA (secp256k1) signature, XAdES block, certificate helpers.
// Procedure mirrors ZATCA's published security-feature description and public open-source references.
// UNVERIFIED against the official SDK until you run it (see docs/ZATCA-TESTING-BN.md). Never trust blindly.
const crypto = require('crypto');
const sha256b64 = (d) => crypto.createHash('sha256').update(d).digest('base64');
const sha256HexB64 = (d) => Buffer.from(crypto.createHash('sha256').update(d).digest('hex')).toString('base64');

const invoiceHash = (hashInputXml) => sha256b64(Buffer.from(hashInputXml, 'utf8'));

function signHash(invoiceHashB64, privateKeyPem) {
  const s = crypto.createSign('sha256'); s.update(Buffer.from(invoiceHashB64, 'base64'));
  return s.sign(privateKeyPem).toString('base64'); // DER ECDSA
}

// ZATCA returns binarySecurityToken = base64( base64(DER) ). Returns {certB64, x509}.
function loadCertificate(binarySecurityToken) {
  const certB64 = Buffer.from(binarySecurityToken, 'base64').toString('utf8').replace(/\s+/g, '');
  const pem = `-----BEGIN CERTIFICATE-----\n${certB64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  return { certB64, x509: new crypto.X509Certificate(pem) };
}
// Minimal DER reader to extract the certificate's own signature BIT STRING (QR tag 9).
function certSignature(x509) {
  const der = x509.raw; let i = 0;
  const readLen = () => { let l = der[i++]; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let k = 0; k < n; k++) l = (l << 8) | der[i++]; } return l; };
  if (der[i++] !== 0x30) throw new Error('bad cert'); readLen();            // Certificate
  for (let part = 0; part < 2; part++) { i++; const l = readLen(); i += l; } // tbs, sigAlg
  if (der[i++] !== 0x03) throw new Error('bad cert sig'); const l = readLen();
  return der.subarray(i + 1, i + l); // skip unused-bits byte
}
const publicKeyDer = (x509) => x509.publicKey.export({ type: 'spki', format: 'der' });
const issuerName = (x509) => x509.issuer.split('\n').reverse().join(', ');
const serialDecimal = (x509) => BigInt('0x' + x509.serialNumber).toString();

const DS = 'http://www.w3.org/2000/09/xmldsig#';
function signedPropertiesXml({ signingTime, certB64, x509 }) {
  const ds = (n, t, a = '') => `<ds:${n} xmlns:ds="${DS}"${a}>${t}</ds:${n}>`;
  return `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">` +
    `<xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>${ds('DigestMethod', '', ' Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"')}${ds('DigestValue', sha256HexB64(certB64))}</xades:CertDigest>` +
    `<xades:IssuerSerial>${ds('X509IssuerName', issuerName(x509))}${ds('X509SerialNumber', serialDecimal(x509))}</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`;
}

function buildExtensions({ invoiceHashB64, signatureB64, certB64, x509, signingTime }) {
  const sp = signedPropertiesXml({ signingTime, certB64, x509 });
  const spDigest = sha256HexB64(sp);
  const signedInfo = `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${invoiceHashB64}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${spDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
  const sig = `<ds:Signature xmlns:ds="${DS}" Id="signature">${signedInfo}<ds:SignatureValue>${signatureB64}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">${sp}</xades:QualifyingProperties></ds:Object></ds:Signature>`;
  return '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent>' +
    '<sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">' +
    `<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>${sig}</sac:SignatureInformation>` +
    '</sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';
}
module.exports = { invoiceHash, signHash, loadCertificate, certSignature, publicKeyDer, buildExtensions, sha256b64 };
