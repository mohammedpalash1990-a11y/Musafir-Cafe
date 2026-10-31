'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'musafir-pos-check-'));
let checked = 0;
try {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || '';
    const code = match[2] || '';
    if (!code.trim()) continue;
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    const file = path.join(dir, 'inline-' + (++checked) + (isModule ? '.mjs' : '.js'));
    fs.writeFileSync(file, code, 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
  execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'functions', 'index.js')], { stdio: 'inherit' });
  if (!checked) throw new Error('No inline scripts were found in index.html');
  process.stdout.write('Syntax OK: ' + checked + ' inline script(s) and functions/index.js\n');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
