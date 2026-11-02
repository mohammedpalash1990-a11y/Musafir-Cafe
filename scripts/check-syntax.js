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
