'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function checkHtmlScripts(filename, dir, prefix) {
  const html = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  let checked = 0;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || '';
    const code = match[2] || '';
    if (!code.trim()) continue;
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    const file = path.join(dir, `${prefix}-${++checked}${isModule ? '.mjs' : '.js'}`);
    fs.writeFileSync(file, code, 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
  if (!checked) throw new Error(`No inline scripts were found in ${filename}`);
  return checked;
}

function checkAllJs(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += checkAllJs(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', full], { stdio: 'inherit' });
      count++;
    }
  }
  return count;
}


function checkFirestoreRules() {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const rulesPath = config.firestore && config.firestore.rules;
  if (rulesPath !== 'firestore.rules') {
    throw new Error('firebase.json must point Firestore deployment at firestore.rules');
  }
  const rulesFile = path.join(root, rulesPath);
  if (!fs.existsSync(rulesFile)) throw new Error('Configured Firestore rules file is missing');
  const rules = fs.readFileSync(rulesFile, 'utf8');
  for (const required of [
    "rules_version = '2';",
    'match /users/{userId}/{document=**}',
    'match /shops/{shopId}',
    'match /orders/{orderId}',
    'match /ratings/{ratingId}',
    'match /receipts/{receiptId}',
    'allow read, write: if isOwner(userId);',
    'allow create: if signedIn()',
    'allow update: if signedIn()',
    'resource.data.uid == request.auth.uid',
    'allow delete: if signedIn() && resource.data.uid == request.auth.uid;'
  ]) {
    if (!rules.includes(required)) throw new Error('Firestore rules baseline is missing: ' + required);
  }
  process.stdout.write('Firestore rules wiring and baseline checks OK\\n');
}

checkFirestoreRules();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musafir-check-'));
try {
  const indexScripts = checkHtmlScripts('index.html', dir, 'index-inline');
  const orderScripts = fs.existsSync(path.join(__dirname, '..', 'order.html'))
    ? checkHtmlScripts('order.html', dir, 'order-inline')
    : 0;
  execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'sw.js')], { stdio: 'inherit' });
  const funcJsCount = checkAllJs(path.join(__dirname, '..', 'functions'));
  process.stdout.write(`Syntax OK: ${indexScripts} index script(s), ${orderScripts} order script(s), sw.js, and ${funcJsCount} functions js file(s)\n`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
