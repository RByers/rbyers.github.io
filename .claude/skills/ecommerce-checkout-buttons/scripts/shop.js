#!/usr/bin/env node
'use strict';

/**
 * shop.js -- a small browser driver for checkout-button audits.
 *
 * Every command connects to a long-lived Chromium over CDP, does one thing, and
 * disconnects. The browser keeps running between invocations, so the cart and
 * session cookies survive: `start`, then any number of `goto`/`click`/`detect`
 * calls, then `stop`. This shape exists because real storefronts are all
 * different -- the agent has to look, decide, and click, and a single
 * fire-and-forget script can't do that.
 *
 * Run `node shop.js help` for usage.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const { WALLETS, REGION_PATTERNS, CHECKOUT_SIGNAL_PATTERNS, withExtraPatterns } = require('./wallet-patterns');
const { scanFrame, scanInteractive, scanPrices } = require('./page-scan');
const { appendRow } = require('./csv-record');

// ---------------------------------------------------------------- environment

function loadPlaywright() {
  const tries = ['playwright', 'playwright-core'];
  for (const m of tries) {
    try { return require(m); } catch (e) { /* keep looking */ }
  }
  for (const envRoot of [process.env.NODE_PATH, '/opt/node22/lib/node_modules', '/usr/lib/node_modules']) {
    if (!envRoot) continue;
    for (const m of tries) {
      try { return require(path.join(envRoot.split(path.delimiter)[0], m)); } catch (e) { /* keep looking */ }
    }
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    for (const m of tries) {
      try { return require(path.join(root, m)); } catch (e) { /* keep looking */ }
    }
  } catch (e) { /* fall through */ }
  fail('Playwright not found. Install it with:  npm install -g playwright\n' +
       'and make sure a Chromium build is available (npx playwright install chromium).');
}

function fail(msg) {
  process.stderr.write('ERROR: ' + msg + '\n');
  process.exit(1);
}

function out(obj) {
  process.stdout.write(typeof obj === 'string' ? obj + '\n' : JSON.stringify(obj, null, 2) + '\n');
}

// ------------------------------------------------------------------ arg parse

function parseArgs(argv) {
  const positional = [];
  const flags = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) flags[name] = true;
        else { flags[name] = next; i++; }
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

function boolFlag(flags, name, dflt) {
  if (flags['no-' + name] !== undefined) return false;
  if (flags[name] === undefined) return dflt;
  return flags[name] !== 'false' && flags[name] !== '0';
}

// ----------------------------------------------------------------- state file

function stateDir(flags) {
  return path.resolve(flags['state-dir'] || process.env.CHECKOUT_AUDIT_DIR ||
                      path.join(os.tmpdir(), 'checkout-buttons-audit'));
}
function statePath(flags) { return path.join(stateDir(flags), 'session.json'); }

function readState(flags) {
  const p = statePath(flags);
  if (!fs.existsSync(p)) {
    fail('No browser session. Start one first:  node shop.js start --url <store url>');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeState(flags, state) {
  const d = stateDir(flags);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(statePath(flags), JSON.stringify(state, null, 2));
}

// -------------------------------------------------------------------- browser

/**
 * The session's proxy re-terminates TLS, so Chromium (which reads NSS, not the
 * system store) rejects every certificate unless we tell it about the CA. We
 * pin the proxy CA's public key hash rather than disabling verification: this
 * trusts exactly that one key and nothing else.
 */
function proxyArgs() {
  const args = [];
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return args;
  args.push('--proxy-server=' + proxy);
  const bypass = (process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1,::1')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(';');
  if (bypass) args.push('--proxy-bypass-list=' + bypass);

  for (const caPath of ['/root/.ccr/agent-proxy-ca.crt', '/root/.ccr/ca-bundle.crt']) {
    if (!fs.existsSync(caPath)) continue;
    try {
      const pins = execSync(
        'awk \'/BEGIN CERT/,/END CERT/\' ' + JSON.stringify(caPath) +
        ' | csplit -z -f /tmp/.cba-ca- -b "%02d.pem" - \'/BEGIN CERT/\' \'{*}\' >/dev/null 2>&1;' +
        ' for f in /tmp/.cba-ca-*.pem; do openssl x509 -in "$f" -pubkey -noout 2>/dev/null' +
        ' | openssl pkey -pubin -outform der 2>/dev/null | openssl dgst -sha256 -binary | openssl enc -base64; done;' +
        ' rm -f /tmp/.cba-ca-*.pem',
        { encoding: 'utf8', shell: '/bin/sh', stdio: ['ignore', 'pipe', 'ignore'] }
      ).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (pins.length) {
        args.push('--ignore-certificate-errors-spki-list=' + Array.from(new Set(pins)).join(','));
        break;
      }
    } catch (e) { /* no openssl; the caller will see TLS errors and can pass --ca-spki */ }
  }
  return args;
}

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
                  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function connect(state) {
  const { chromium } = loadPlaywright();
  let browser;
  try {
    browser = await chromium.connectOverCDP(state.cdpEndpoint, { timeout: 15000 });
  } catch (e) {
    fail('Could not attach to the browser at ' + state.cdpEndpoint + '.\n' +
         'It may have exited. Run:  node shop.js stop  then  node shop.js start ...\n' + e.message);
  }
  const contexts = browser.contexts();
  if (!contexts.length) fail('Browser has no context. Restart with `stop` then `start`.');
  return { browser, context: contexts[0] };
}

/** Default to the most recently opened real page: checkout often opens a new tab. */
async function pickPage(context, flags) {
  let pages = context.pages();
  if (!pages.length) {
    await new Promise(function (r) { setTimeout(r, 500); });
    pages = context.pages();
  }
  if (!pages.length) fail('Browser has no open page.');
  if (flags && flags.page !== undefined) {
    const i = parseInt(flags.page, 10);
    if (!(i >= 0 && i < pages.length)) fail('No page index ' + flags.page + ' (0..' + (pages.length - 1) + ')');
    return pages[i];
  }
  const real = pages.filter(function (p) { return p.url() && p.url() !== 'about:blank'; });
  return (real.length ? real : pages)[(real.length ? real : pages).length - 1];
}

const APPLE_PAY_SHIM = function () {
  if (window.__cbaApplePayShim) return;
  window.__cbaApplePayShim = true;
  if (window.ApplePaySession) return;
  // Stores gate the Apple Pay button on ApplePaySession existing. Chromium has
  // no such API, so without this shim every non-Safari audit reports "no Apple
  // Pay" regardless of what the store actually offers. The constructor throws so
  // that an accidental click can never open a real payment sheet.
  function ApplePaySession() { throw new Error('checkout-audit shim: no real payment sheet'); }
  ApplePaySession.STATUS_SUCCESS = 0;
  ApplePaySession.STATUS_FAILURE = 1;
  ApplePaySession.canMakePayments = function () { return true; };
  ApplePaySession.canMakePaymentsWithActiveCard = function () { return Promise.resolve(true); };
  ApplePaySession.supportsVersion = function (v) { return v <= 14; };
  ApplePaySession.applePayCapabilities = function () {
    return Promise.resolve({ paymentCredentialStatus: 'paymentCredentialsAvailable' });
  };
  try {
    Object.defineProperty(window, 'ApplePaySession', { value: ApplePaySession, configurable: true, writable: true });
  } catch (e) { window.ApplePaySession = ApplePaySession; }
};

async function applyInitScripts(context, state) {
  if (state.applePaySpoof) {
    try { await context.addInitScript(APPLE_PAY_SHIM); } catch (e) { /* already applied */ }
  }
}

/** Best-effort quiet: real storefronts rarely reach true networkidle. */
async function settle(page, ms) {
  try { await page.waitForLoadState('domcontentloaded', { timeout: Math.min(ms, 15000) }); } catch (e) { /* ok */ }
  try { await page.waitForLoadState('networkidle', { timeout: ms }); } catch (e) { /* ok */ }
}

// -------------------------------------------------------------------- scanner

function scanConfig(flags) {
  let extra = [];
  if (flags.patterns) {
    try { extra = JSON.parse(fs.readFileSync(flags.patterns, 'utf8')); } catch (e) {
      fail('Could not read --patterns file: ' + e.message);
    }
  }
  return {
    patterns: withExtraPatterns(extra),
    regionPatterns: REGION_PATTERNS,
    signalPatterns: CHECKOUT_SIGNAL_PATTERNS,
    maxPerWallet: parseInt(flags['max-per-wallet'] || '3', 10),
  };
}

/** Is every iframe between this frame and the top actually on screen? */
async function frameChainVisible(frame) {
  let f = frame;
  let guard = 0;
  while (f && f.parentFrame() && guard++ < 10) {
    let el;
    try { el = await f.frameElement(); } catch (e) { return null; } // cross-process; unknown
    if (!el) return null;
    let box = null;
    try { box = await el.boundingBox(); } catch (e) { /* detached */ }
    if (!box || box.width < 2 || box.height < 2) return false;
    f = f.parentFrame();
  }
  return true;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

async function runScan(page, cfg) {
  const perFrame = [];
  const frames = page.frames();
  for (const frame of frames) {
    let res = null;
    try {
      res = await frame.evaluate(scanFrame, cfg);
    } catch (e) {
      continue; // frame navigated away or is not scriptable
    }
    const vis = await frameChainVisible(frame);
    perFrame.push({ frameUrl: frame.url(), isMain: frame === page.mainFrame(), frameVisible: vis, res });
  }

  // A cross-origin wallet iframe may be scriptable-but-empty; its *URL* is still
  // proof the SDK rendered something there.
  const hostHits = [];
  for (const frame of frames) {
    const h = hostOf(frame.url());
    if (!h) continue;
    for (const p of cfg.patterns) {
      if (!p.hosts) continue;
      if (p.hosts.some(function (src) { return new RegExp(src, 'i').test(h); })) {
        hostHits.push({ id: p.id, label: p.label, group: p.group, frameUrl: frame.url(), frameHost: h, frame });
      }
    }
  }
  for (const hh of hostHits) {
    hh.frameVisible = await frameChainVisible(hh.frame);
    delete hh.frame;
  }
  return { perFrame, hostHits };
}

function mergeScan(scan, cfg) {
  const byId = new Map();
  function bucket(id, label, group) {
    if (!byId.has(id)) {
      byId.set(id, { id, label, group, present: false, kinds: new Set(), count: 0, evidence: [], hiddenOnly: true });
    }
    return byId.get(id);
  }

  for (const f of scan.perFrame) {
    if (!f.res) continue;
    for (const hit of f.res.hits) {
      const b = bucket(hit.id, hit.label, hit.group);
      b.count++;
      b.kinds.add(hit.kind);
      // Something inside an invisible iframe is not on screen, whatever it says.
      const onScreen = hit.visible && f.frameVisible !== false;
      if (onScreen) b.hiddenOnly = false;
      if (b.evidence.length < cfg.maxPerWallet) {
        b.evidence.push({
          where: f.isMain ? 'main frame' : 'iframe ' + hostOf(f.frameUrl),
          frameUrl: f.isMain ? undefined : f.frameUrl,
          kind: hit.kind,
          onScreen,
          tag: hit.tag,
          text: hit.text || undefined,
          ariaLabel: hit.ariaLabel || undefined,
          selector: hit.selector,
          rect: hit.rect,
          matched: hit.evidence,
        });
      }
    }
  }
  for (const hh of scan.hostHits) {
    const b = bucket(hh.id, hh.label, hh.group);
    b.count++;
    b.kinds.add('iframe');
    if (hh.frameVisible !== false) b.hiddenOnly = false;
    if (b.evidence.length < cfg.maxPerWallet + 1) {
      b.evidence.push({
        where: 'frame url',
        frameUrl: hh.frameUrl,
        kind: 'iframe',
        onScreen: hh.frameVisible !== false,
        matched: hh.frameHost,
      });
    }
  }

  const ACTIONABLE = ['express_button', 'iframe', 'payment_option'];
  const order = ACTIONABLE.concat(['messaging', 'other']);

  const wallets = [];
  const messaging = [];
  const suppressed = [];
  for (const b of byId.values()) {
    const kinds = Array.from(b.kinds);
    kinds.sort(function (a, c) { return order.indexOf(a) - order.indexOf(c); });
    const rec = {
      id: b.id, label: b.label, group: b.group,
      kind: kinds[0], kinds, count: b.count, evidence: b.evidence,
    };
    if (b.hiddenOnly) {
      // Hidden SDK plumbing (PayPal in particular injects invisible iframes on
      // pages with no PayPal button). Reporting these as "offered" would be wrong.
      rec.reason = 'present in DOM but nothing visible on screen';
      suppressed.push(rec);
    } else if (ACTIONABLE.indexOf(rec.kind) >= 0) {
      wallets.push(rec);
    } else {
      // Visible, but it is a promo banner or stray prose -- not something a
      // shopper can check out with. Kept separate so the CSV counts buttons
      // only, while nothing found is silently discarded.
      rec.reason = 'visible text/branding, but not a clickable payment control';
      messaging.push(rec);
    }
  }
  wallets.sort(function (a, b) {
    const d = order.indexOf(a.kind) - order.indexOf(b.kind);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });

  const regions = new Set();
  const signals = new Set();
  for (const f of scan.perFrame) {
    if (!f.res) continue;
    for (const r of f.res.regions) regions.add(r);
    for (const s of f.res.signals) signals.add(s);
  }
  return { wallets, messaging, suppressed, regions: Array.from(regions), signals: Array.from(signals) };
}

async function detect(page, cfg, settleMs) {
  await settle(page, settleMs);
  const first = await runScan(page, cfg);
  // Wallet SDKs mount late; scan twice and take the union so a slow PayPal
  // button is not recorded as absent.
  await new Promise(function (r) { setTimeout(r, Math.min(settleMs, 2500)); });
  const second = await runScan(page, cfg);
  const combined = {
    perFrame: first.perFrame.concat(second.perFrame),
    hostHits: first.hostHits.concat(second.hostHits),
  };
  const merged = mergeScan(combined, cfg);
  const mainScan = second.perFrame.find(function (f) { return f.isMain; }) ||
                   first.perFrame.find(function (f) { return f.isMain; });

  return {
    checkedAt: new Date().toISOString(),
    pageUrl: page.url(),
    pageTitle: mainScan && mainScan.res ? mainScan.res.title : '',
    frameCount: page.frames().length,
    looksLikeCheckout: merged.signals.length >= 2 || /\/(checkout|cart|bag|basket|panier|kasse)/i.test(page.url()),
    checkoutSignals: merged.signals,
    expressRegionText: merged.regions,
    wallets: merged.wallets,
    messagingOnly: merged.messaging,
    suppressed: merged.suppressed,
  };
}

function summarize(result) {
  const lines = [];
  lines.push('page:  ' + result.pageUrl);
  lines.push('title: ' + (result.pageTitle || '(none)'));
  lines.push('looks like a cart/checkout page: ' + (result.looksLikeCheckout ? 'yes' : 'NO -- check before recording'));
  if (result.checkoutSignals.length) lines.push('signals: ' + result.checkoutSignals.slice(0, 6).join(', '));
  if (result.expressRegionText.length) lines.push('express region: ' + result.expressRegionText.join(', '));
  lines.push('');
  if (!result.wallets.length) {
    lines.push('No wallet / express checkout buttons visible.');
  } else {
    lines.push('Visible wallet buttons (' + result.wallets.length + '):');
    for (const w of result.wallets) {
      const ev = w.evidence[0] || {};
      lines.push('  - ' + w.label.padEnd(22) + w.kind.padEnd(16) +
                 (ev.where || '') + (ev.text ? '  "' + ev.text.slice(0, 40) + '"' : ''));
    }
  }
  if (result.messagingOnly.length) {
    lines.push('');
    lines.push('Branding/promo text only, not a button (not counted): ' +
               result.messagingOnly.map(function (w) { return w.label; }).join(', '));
  }
  if (result.suppressed.length) {
    lines.push('');
    lines.push('In the DOM but not visible (not counted): ' +
               result.suppressed.map(function (w) { return w.label; }).join(', '));
  }
  return lines.join('\n');
}

// -------------------------------------------------------------------- actions

const COMMANDS = {};

COMMANDS.start = async function (pos, flags) {
  const { chromium } = loadPlaywright();
  const dir = stateDir(flags);
  fs.mkdirSync(dir, { recursive: true });

  const existing = fs.existsSync(statePath(flags)) ? JSON.parse(fs.readFileSync(statePath(flags), 'utf8')) : null;
  if (existing && !boolFlag(flags, 'force', false)) {
    try {
      process.kill(existing.pid, 0);
      fail('A session is already running (pid ' + existing.pid + '). Use `stop` first, or pass --force.');
    } catch (e) { /* stale state; fall through */ }
  }

  const port = parseInt(flags['cdp-port'] || '0', 10) || (9300 + Math.floor(Math.random() * 400));
  const userDataDir = path.join(dir, 'profile');
  if (boolFlag(flags, 'fresh', true) && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  const headless = !boolFlag(flags, 'headed', false);
  const mobile = boolFlag(flags, 'mobile', false);
  const ua = flags.ua || (mobile ? MOBILE_UA : null);
  const size = mobile ? '414,896' : (flags.window || '1440,1000');

  const args = [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + userDataDir,
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    // Reduce the most obvious automation tells; storefronts behind bot walls
    // will still block, and that is reported rather than worked around.
    '--disable-blink-features=AutomationControlled',
    '--window-size=' + size,
  ];
  if (headless) args.push('--headless=new');
  if (ua) args.push('--user-agent=' + ua);
  if (flags.lang) args.push('--lang=' + flags.lang);
  if (flags['ca-spki']) args.push('--ignore-certificate-errors-spki-list=' + flags['ca-spki']);
  args.push.apply(args, proxyArgs());
  if (flags['chrome-arg']) {
    for (const a of [].concat(flags['chrome-arg'])) args.push(a);
  }
  args.push('about:blank');

  const exe = flags['chrome-path'] || chromium.executablePath();
  if (!fs.existsSync(exe)) fail('Chromium binary not found at ' + exe + '. Run: npx playwright install chromium');

  const logFile = path.join(dir, 'chrome.log');
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(exe, args, { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();

  const endpoint = 'http://127.0.0.1:' + port;
  const version = await waitForCdp(endpoint, 30000);
  if (!version) {
    fail('Chromium did not expose a debugging port within 30s. See ' + logFile);
  }

  const state = {
    pid: child.pid,
    cdpEndpoint: endpoint,
    userDataDir,
    dir,
    headless,
    mobile,
    userAgent: ua || version['User-Agent'] || '',
    applePaySpoof: boolFlag(flags, 'apple-pay-spoof', true),
    startedAt: new Date().toISOString(),
    browser: version.Browser,
  };
  writeState(flags, state);

  const { browser, context } = await connect(state);
  await applyInitScripts(context, state);
  let page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(parseInt(flags.timeout || '30000', 10));

  const url = flags.url || pos[0];
  let navResult = null;
  if (url) {
    navResult = await navigate(page, url, flags);
  }
  await browser.close(); // detaches the CDP client; Chromium keeps running

  out({
    ok: true,
    session: { pid: state.pid, cdp: endpoint, headless, mobile, applePaySpoof: state.applePaySpoof },
    browser: state.browser,
    stateFile: statePath(flags),
    navigated: navResult,
    next: 'node shop.js prices   |   node shop.js snapshot --grep "add to (cart|bag)"',
  });
};

function waitForCdp(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise(function (resolve) {
    (function attempt() {
      const req = http.get(endpoint + '/json/version', { timeout: 2000 }, function (res) {
        let body = '';
        res.on('data', function (c) { body += c; });
        res.on('end', function () {
          try { resolve(JSON.parse(body)); } catch (e) { retry(); }
        });
      });
      req.on('error', retry);
      req.on('timeout', function () { req.destroy(); retry(); });
      function retry() {
        if (Date.now() > deadline) return resolve(null);
        setTimeout(attempt, 250);
      }
    })();
  });
}

async function navigate(page, url, flags) {
  if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
  let status = null;
  let error = null;
  try {
    const resp = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: parseInt(flags.timeout || '45000', 10),
    });
    status = resp ? resp.status() : null;
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  await settle(page, parseInt(flags.settle || '5000', 10));
  return { url: page.url(), status, title: await page.title().catch(function () { return ''; }), error };
}

COMMANDS.goto = async function (pos, flags) {
  const state = readState(flags);
  const url = flags.url || pos[0];
  if (!url) fail('usage: node shop.js goto <url>');
  const { browser, context } = await connect(state);
  await applyInitScripts(context, state);
  const page = await pickPage(context, flags);
  const res = await navigate(page, url, flags);
  await browser.close();
  out(res);
};

COMMANDS.pages = async function (pos, flags) {
  const state = readState(flags);
  const { browser, context } = await connect(state);
  const list = [];
  const pages = context.pages();
  for (let i = 0; i < pages.length; i++) {
    list.push({ index: i, url: pages[i].url(), title: await pages[i].title().catch(function () { return ''; }) });
  }
  await browser.close();
  out(list);
};

COMMANDS.status = async function (pos, flags) {
  const state = readState(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const info = await page.evaluate(function () {
    function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    const cartHints = [];
    const els = document.querySelectorAll('[class*="cart" i],[id*="cart" i],[aria-label*="cart" i],[class*="bag" i]');
    for (let i = 0; i < els.length && cartHints.length < 6; i++) {
      const t = squash(els[i].textContent);
      if (t && t.length < 60) cartHints.push(t);
    }
    return {
      title: document.title,
      url: location.href,
      cartHints: cartHints,
      cookies: document.cookie.length,
    };
  }).catch(function (e) { return { error: e.message }; });
  await browser.close();
  out(Object.assign({ session: { pid: state.pid, headless: state.headless, applePaySpoof: state.applePaySpoof } }, info));
};

COMMANDS.snapshot = async function (pos, flags) {
  const state = readState(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const cfg = { limit: parseInt(flags.limit || '60', 10), grep: flags.grep || null };
  const rows = [];
  for (const frame of page.frames()) {
    let r;
    try { r = await frame.evaluate(scanInteractive, cfg); } catch (e) { continue; }
    for (const item of r) {
      rows.push(Object.assign({ frame: frame === page.mainFrame() ? 'main' : hostOf(frame.url()) }, item));
    }
  }
  await browser.close();
  if (flags.json) return out(rows);
  const lines = rows.slice(0, cfg.limit).map(function (r, i) {
    return String(i).padStart(3) + '  [' + r.frame + '] <' + r.tag + (r.type ? ' ' + r.type : '') + '> ' +
           JSON.stringify(r.label || '') + '\n      ' + r.selector + (r.href ? '   -> ' + r.href : '');
  });
  out(lines.length ? lines.join('\n') : '(no visible interactive elements found)');
};

COMMANDS.prices = async function (pos, flags) {
  const state = readState(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const rows = await page.evaluate(scanPrices, { limit: parseInt(flags.limit || '25', 10) })
    .catch(function () { return []; });
  await browser.close();
  if (flags.json) return out(rows);
  if (!rows.length) return out('(no priced product links found -- try a collection/category page, or use `snapshot`)');
  out(rows.map(function (r) {
    return r.priceText.padEnd(12) + (r.title || '(untitled)').slice(0, 50).padEnd(52) + r.url;
  }).join('\n'));
};

function resolveTarget(scope, target, flags) {
  let locator;
  if (/^(css=|text=|role=|xpath=|\/\/|id=|data-testid=)/.test(target)) locator = scope.locator(target);
  else locator = scope.locator(target);
  if (flags.nth !== undefined) locator = locator.nth(parseInt(flags.nth, 10));
  else locator = locator.first();
  return locator;
}

async function scopeFor(page, flags) {
  if (!flags.frame) return page;
  const frame = page.frames().find(function (f) { return f.url().includes(flags.frame); });
  if (!frame) fail('No frame whose URL contains ' + JSON.stringify(flags.frame));
  return frame;
}

COMMANDS.click = async function (pos, flags) {
  const state = readState(flags);
  const target = pos[0];
  if (!target) {
    fail('usage: node shop.js click <selector>\n' +
         '  selector may be CSS, or Playwright syntax:\n' +
         '    "text=Add to cart"            visible text\n' +
         '    "role=button[name=/add to/i]" accessible role + name\n' +
         '    "button.add-to-cart"          plain CSS');
  }
  const { browser, context } = await connect(state);
  await applyInitScripts(context, state);
  const page = await pickPage(context, flags);
  const before = page.url();
  const scope = await scopeFor(page, flags);
  const locator = resolveTarget(scope, target, flags);

  let error = null;
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(function () {});
    await locator.click({ timeout: parseInt(flags.timeout || '15000', 10), force: boolFlag(flags, 'force', false) });
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  await settle(page, parseInt(flags.settle || '4000', 10));
  const after = await pickPage(context, flags);
  const res = {
    clicked: target,
    error,
    urlBefore: before,
    urlAfter: after.url(),
    navigated: before !== after.url(),
    title: await after.title().catch(function () { return ''; }),
    openPages: context.pages().length,
  };
  await browser.close();
  out(res);
};

COMMANDS.fill = async function (pos, flags) {
  const state = readState(flags);
  if (pos.length < 2) fail('usage: node shop.js fill <selector> <value>');
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const scope = await scopeFor(page, flags);
  let error = null;
  try {
    await resolveTarget(scope, pos[0], flags).fill(pos[1], { timeout: 15000 });
  } catch (e) { error = e.message.split('\n')[0]; }
  await browser.close();
  out({ filled: pos[0], error });
};

COMMANDS.press = async function (pos, flags) {
  const state = readState(flags);
  if (!pos[0]) fail('usage: node shop.js press <key>   (e.g. Enter, Escape)');
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  await page.keyboard.press(pos[0]);
  await settle(page, parseInt(flags.settle || '2000', 10));
  const res = { pressed: pos[0], url: page.url() };
  await browser.close();
  out(res);
};

COMMANDS.screenshot = async function (pos, flags) {
  const state = readState(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const file = path.resolve(pos[0] || flags.out || path.join(stateDir(flags), 'screenshot.png'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: boolFlag(flags, 'full', false) });
  await browser.close();
  out({ screenshot: file, url: page.url() });
};

COMMANDS.detect = async function (pos, flags) {
  const state = readState(flags);
  const cfg = scanConfig(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const result = await detect(page, cfg, parseInt(flags.settle || '6000', 10));
  result.applePaySpoof = state.applePaySpoof;
  await browser.close();
  if (flags.json) return out(result);
  out(summarize(result));
};

COMMANDS.record = async function (pos, flags) {
  const csv = flags.csv || pos[0];
  if (!csv) fail('usage: node shop.js record --csv <path/to/file.csv> [--site NAME] [--product NAME] [--price 12.99]');
  const state = readState(flags);
  const cfg = scanConfig(flags);
  const { browser, context } = await connect(state);
  const page = await pickPage(context, flags);
  const result = await detect(page, cfg, parseInt(flags.settle || '6000', 10));
  result.applePaySpoof = state.applePaySpoof;

  // Validate before writing anything: a rejected record should leave no trace
  // in the user's CSV directory.
  if (!result.looksLikeCheckout && !boolFlag(flags, 'allow-any-page', false)) {
    await browser.close();
    fail('This does not look like a cart/checkout page (url=' + result.pageUrl + ').\n' +
         'Recording it would put misleading data in the CSV. Navigate to checkout first, or pass\n' +
         '--allow-any-page if you are deliberately auditing this page.');
  }

  let shot = '';
  if (boolFlag(flags, 'screenshot', true)) {
    const site = flags.site || hostOf(result.pageUrl) || 'site';
    const stamp = result.checkedAt.replace(/[:.]/g, '-');
    shot = path.resolve(path.dirname(path.resolve(csv)), 'evidence',
                        site.replace(/[^\w.-]+/g, '_') + '-' + stamp + '.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    try { await page.screenshot({ path: shot, fullPage: false }); } catch (e) { shot = ''; }
  }
  await browser.close();

  const present = new Set(result.wallets.map(function (w) { return w.id; }));
  const buttonsOnly = result.wallets.filter(function (w) {
    return w.kind === 'express_button' || w.kind === 'iframe';
  });

  const values = {
    timestamp: result.checkedAt,
    site: flags.site || hostOf(result.pageUrl),
    domain: hostOf(result.pageUrl),
    site_url: flags['site-url'] || '',
    checkout_url: result.pageUrl,
    product_url: flags['product-url'] || '',
    product_name: flags.product || '',
    price: flags.price || '',
    currency: flags.currency || '',
    platform: flags.platform || '',
    wallets: result.wallets.map(function (w) { return w.label + ' (' + w.kind.replace('express_', '') + ')'; }).join('; '),
    wallet_count: String(buttonsOnly.length),
    notes: [flags.notes || '', state.applePaySpoof ? '' : 'apple pay not testable (no ApplePaySession)',
            result.checkoutSignals.length < 2 ? 'weak checkout-page signals' : '']
      .filter(Boolean).join('; '),
    screenshot: shot,
    checkout_type: result.expressRegionText.length ? 'express region present' : '',
    __labels: {},
  };
  for (const w of cfg.patterns) {
    let v = present.has(w.id) ? 'yes' : 'no';
    // Without the shim, Chromium cannot render an Apple Pay button at all, so
    // "no" would be a claim about the browser, not about the store.
    if (w.id === 'apple_pay' && !state.applePaySpoof && !present.has(w.id)) v = 'unknown';
    values[w.id] = v;
    values.__labels[w.id] = w.label;
  }

  const res = appendRow(path.resolve(csv), values, { dryRun: boolFlag(flags, 'dry-run', false) });
  out({
    csv: path.resolve(csv),
    createdFile: res.created,
    dryRun: boolFlag(flags, 'dry-run', false),
    header: res.header,
    row: res.row,
    columnsNotInYourCsv: res.unmapped.filter(function (k) { return values[k] && values[k] !== 'no'; }),
    detected: result.wallets.map(function (w) { return w.label + ' [' + w.kind + ']'; }),
    messagingOnly: result.messagingOnly.map(function (w) { return w.label; }),
    suppressed: result.suppressed.map(function (w) { return w.label; }),
    screenshot: shot || undefined,
    summary: summarize(result),
  });
};

COMMANDS.stop = async function (pos, flags) {
  const p = statePath(flags);
  if (!fs.existsSync(p)) return out({ ok: true, note: 'no session to stop' });
  const state = JSON.parse(fs.readFileSync(p, 'utf8'));
  let killed = false;
  try { process.kill(state.pid, 'SIGTERM'); killed = true; } catch (e) { /* already gone */ }
  fs.unlinkSync(p);
  if (boolFlag(flags, 'clean', false) && state.userDataDir && fs.existsSync(state.userDataDir)) {
    fs.rmSync(state.userDataDir, { recursive: true, force: true });
  }
  out({ ok: true, killed, pid: state.pid });
};

COMMANDS.help = async function () {
  out([
    'shop.js -- browser driver for e-commerce checkout-button audits',
    '',
    'Session:',
    '  start [--url URL] [--headed] [--mobile] [--no-apple-pay-spoof] [--window 1440,1000]',
    '  stop [--clean]                      kill the browser',
    '  status                              current page url/title',
    '  pages                               list open tabs (use --page N on any command)',
    '',
    'Navigate and act:',
    '  goto <url> [--settle ms]',
    '  prices [--limit N]                  priced product links, cheapest first',
    '  snapshot [--grep RE] [--limit N]    visible clickable elements + selectors',
    '  click <selector> [--nth N] [--frame urlpart] [--force]',
    '  fill <selector> <value>',
    '  press <key>',
    '  screenshot [path] [--full]',
    '',
    'Audit:',
    '  detect [--json] [--settle ms] [--patterns extra.json]',
    '  record --csv <file> [--site S] [--product P] [--price N] [--product-url U]',
    '         [--notes T] [--dry-run] [--no-screenshot] [--allow-any-page]',
    '',
    'Selectors accept CSS or Playwright syntax: text=Add to cart, role=button[name=/cart/i], //xpath',
  ].join('\n'));
};

// ------------------------------------------------------------------------ run

async function main() {
  // Parse everything first, then take the command off the front of the
  // positionals, so `shop.js --state-dir X detect` works as well as
  // `shop.js detect --state-dir X`.
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional.shift() || 'help';
  const fn = COMMANDS[cmd];
  if (!fn) fail('Unknown command ' + JSON.stringify(cmd) + '. Run `node shop.js help`.');
  await fn(positional, flags);
}

main().then(
  function () { process.exit(0); },
  function (err) { fail(err && err.stack ? err.stack : String(err)); }
);
