'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Append a result row to a CSV the user provided.
 *
 * The user's file is the source of truth for shape: we read its header and fill
 * whatever columns it happens to have, in its order, leaving unknown columns
 * blank. Silently rewriting someone's column layout -- or worse, appending rows
 * whose fields don't line up with the header -- corrupts a file they may have
 * been collecting for weeks, so we never reorder or add columns to a file that
 * already has a header.
 */

const ALIASES = {
  timestamp: ['timestamp', 'time', 'date', 'datetime', 'run_at', 'checked_at', 'date_checked', 'audited_at', 'when'],
  site: ['site', 'store', 'merchant', 'brand', 'retailer', 'site_name', 'store_name', 'company'],
  domain: ['domain', 'hostname', 'host'],
  site_url: ['site_url', 'store_url', 'home_url', 'homepage', 'url'],
  checkout_url: ['checkout_url', 'checkout', 'checkout_page', 'checkout_link'],
  product_url: ['product_url', 'product_link', 'item_url', 'pdp_url'],
  product_name: ['product_name', 'product', 'item', 'item_name', 'sku', 'title'],
  price: ['price', 'product_price', 'item_price', 'amount', 'cart_total', 'total', 'subtotal'],
  currency: ['currency', 'ccy', 'curr'],
  platform: ['platform', 'ecommerce_platform', 'cms', 'stack'],
  wallets: ['wallets', 'buttons', 'checkout_buttons', 'express_checkout', 'detected', 'results',
            'payment_methods', 'wallet_list', 'express_buttons', 'wallet_buttons'],
  wallet_count: ['wallet_count', 'count', 'num_buttons', 'button_count', 'n_wallets', 'total_buttons'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  screenshot: ['screenshot', 'screenshot_path', 'evidence', 'image', 'capture'],
  checkout_type: ['checkout_type', 'checkout_kind', 'flow'],
};

const DEFAULT_HEADER = [
  'timestamp', 'site', 'checkout_url', 'product_name', 'price', 'platform',
  'apple_pay', 'google_pay', 'shop_pay', 'paypal', 'venmo', 'amazon_pay',
  'meta_pay', 'stripe_link', 'cash_app_pay', 'klarna', 'afterpay', 'affirm',
  'wallet_count', 'wallets', 'notes', 'screenshot',
];

function normKey(k) {
  return String(k).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** "Apple Pay", "ApplePay", "apple-pay" all need to find the apple_pay value. */
function keyForms(k) {
  const n = normKey(k);
  return [n, n.replace(/_/g, '')];
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Minimal RFC4180 parse -- we only ever need the first (header) line. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readHeader(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return null;
  const firstLine = raw.split(/\r?\n/, 1)[0];
  const cols = parseCsvLine(firstLine).map(function (c) { return c.trim(); });
  // A header that is all numbers/dates is probably data, not a header.
  const looksLikeHeader = cols.some(function (c) { return /[a-z]/i.test(c); });
  return looksLikeHeader ? cols : null;
}

function endsWithNewline(file) {
  const st = fs.statSync(file);
  if (st.size === 0) return true;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1);
  fs.readSync(fd, buf, 0, 1, st.size - 1);
  fs.closeSync(fd);
  return buf[0] === 0x0a || buf[0] === 0x0d;
}

/**
 * @param {string} file        CSV path (created with a default header if absent)
 * @param {object} values      canonical field name / wallet id -> value
 * @param {object} [opts]      { dryRun: boolean }
 * @returns {{header:string[], row:string[], created:boolean, unmapped:string[], line:string}}
 */
function appendRow(file, values, opts) {
  opts = opts || {};

  // Build a lookup from every accepted spelling to the value.
  const lookup = Object.create(null);
  function put(key, val) {
    for (const form of keyForms(key)) {
      if (!(form in lookup)) lookup[form] = val;
    }
  }
  for (const canonical of Object.keys(values)) {
    put(canonical, values[canonical]);
    const aliases = ALIASES[canonical];
    if (aliases) for (const a of aliases) put(a, values[canonical]);
  }
  // Let a column named "Apple Pay" find the apple_pay wallet value via its label.
  if (values.__labels) {
    for (const id of Object.keys(values.__labels)) {
      if (id in values) put(values.__labels[id], values[id]);
    }
  }
  delete lookup[normKey('__labels')];

  let header = readHeader(file);
  const created = !header;
  if (!header) header = DEFAULT_HEADER.slice();

  const used = new Set();
  const row = header.map(function (col) {
    for (const form of keyForms(col)) {
      if (form in lookup) { used.add(form); return lookup[form]; }
    }
    return '';
  });

  const unmapped = Object.keys(values)
    .filter(function (k) { return k !== '__labels'; })
    .filter(function (k) { return !keyForms(k).some(function (f) { return used.has(f); }); });

  const line = row.map(csvEscape).join(',');
  if (opts.dryRun) return { header, row, created, unmapped, line };

  const dir = path.dirname(path.resolve(file));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (created) {
    fs.writeFileSync(file, header.map(csvEscape).join(',') + '\n' + line + '\n', 'utf8');
  } else {
    const prefix = endsWithNewline(file) ? '' : '\n';
    fs.appendFileSync(file, prefix + line + '\n', 'utf8');
  }
  return { header, row, created, unmapped, line };
}

module.exports = { appendRow, readHeader, normKey, csvEscape, DEFAULT_HEADER, ALIASES };
