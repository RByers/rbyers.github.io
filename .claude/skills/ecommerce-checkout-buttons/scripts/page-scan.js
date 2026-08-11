'use strict';

/**
 * Functions in this file are stringified and evaluated inside the page, so they
 * must be entirely self-contained: no closures, no requires, no references to
 * anything outside their own arguments.
 */

/**
 * Scan one frame's DOM (including open shadow roots) for wallet buttons.
 * @param {{patterns:Array, regionPatterns:string[], signalPatterns:string[], maxPerWallet:number}} cfg
 */
function scanFrame(cfg) {
  const pats = cfg.patterns.map(function (p) {
    return {
      id: p.id,
      label: p.label,
      group: p.group,
      re: p.match ? new RegExp(p.match, 'i') : null,
      exclude: p.exclude ? new RegExp(p.exclude, 'i') : null,
      tags: (p.tags || []).map(function (t) { return t.toLowerCase(); }),
    };
  });

  // One combined regex as a cheap pre-filter so we only build the expensive
  // parts of a signature for elements that could possibly match.
  const quickSources = pats.map(function (p) { return p.re ? p.re.source : null; }).filter(Boolean);
  const quickRe = quickSources.length ? new RegExp(quickSources.join('|'), 'i') : null;
  const regionRe = cfg.regionPatterns.length ? new RegExp(cfg.regionPatterns.join('|'), 'i') : null;
  const signalRe = cfg.signalPatterns.length ? new RegExp(cfg.signalPatterns.join('|'), 'i') : null;

  const INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'LABEL', 'SUMMARY']);
  // Never read text out of these. An inline <script> that mentions
  // ApplePaySession is the single most common way to "detect" an Apple Pay
  // button on a page that has none.
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE']);
  const KIND_RANK = { express_button: 0, iframe: 1, payment_option: 2, messaging: 3, other: 4 };

  function squash(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  /** textContent with script/style subtrees removed. */
  function ownText(el) {
    if (el.children.length === 0) return squash(el.textContent);
    let s = '';
    const kids = el.childNodes;
    for (let i = 0; i < kids.length && s.length < 240; i++) {
      const n = kids[i];
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1 && !SKIP.has(n.tagName)) s += ' ' + n.textContent;
    }
    return squash(s);
  }

  function isInteractive(el) {
    const tag = el.tagName;
    if (INTERACTIVE.has(tag)) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'radio' || role === 'tab') return true;
    if (el.hasAttribute('onclick') || el.tabIndex >= 0) return true;
    // Custom elements named like buttons: <apple-pay-button>, <google-pay-button>
    if (tag.indexOf('-') > 0 && /button|btn/i.test(tag)) return true;
    return false;
  }

  function visible(el) {
    try {
      if (typeof el.checkVisibility === 'function') {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) {
          return false;
        }
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function rectOf(el) {
    try {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    } catch (e) {
      return null;
    }
  }

  // A selector that is stable enough to click later. Prefers ids and test hooks
  // because index-based paths break the moment the page re-renders.
  function selectorFor(el) {
    try {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;
      for (const attr of ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'name']) {
        const v = el.getAttribute && el.getAttribute(attr);
        if (v) return el.tagName.toLowerCase() + '[' + attr + '="' + v.replace(/"/g, '\\"') + '"]';
      }
      const parts = [];
      let node = el;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 6) {
        let part = node.tagName.toLowerCase();
        if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
          parts.unshift('#' + node.id);
          break;
        }
        const parent = node.parentElement;
        if (parent) {
          const sibs = Array.prototype.filter.call(parent.children, function (c) {
            return c.tagName === node.tagName;
          });
          if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = parent;
        depth++;
      }
      return parts.join(' > ');
    } catch (e) {
      return null;
    }
  }

  // The broad half of the strategy: pull every string a wallet brand could
  // plausibly be hiding in.
  function signatureOf(el, deep) {
    const parts = [el.tagName.toLowerCase()];
    try {
      const attrs = el.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (a.name === 'style') continue;
        parts.push(a.name + '=' + String(a.value || '').slice(0, 240));
      }
    } catch (e) { /* ignore */ }

    if (deep) {
      // Wallet buttons are very often just a logo image or an inline SVG.
      try {
        const media = el.querySelectorAll('img, svg title, svg desc, use, image');
        for (let i = 0; i < media.length && i < 12; i++) {
          const m = media[i];
          parts.push(squash(m.textContent).slice(0, 80));
          for (const attr of ['alt', 'src', 'href', 'xlink:href', 'aria-label']) {
            const v = m.getAttribute && m.getAttribute(attr);
            if (v) parts.push(attr + '=' + v.slice(0, 240));
          }
        }
      } catch (e) { /* ignore */ }
      try {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') parts.push('background=' + bg.slice(0, 240));
      } catch (e) { /* ignore */ }
    }

    // Text only for clickable or small nodes: taking textContent of a <body>
    // would match every brand mentioned anywhere on the page. "Small" rather
    // than "leaf" because BNPL widgets are usually a short <p> wrapping a
    // "Learn more" link, and a leaf-only rule misses them entirely.
    if (deep || textEligible(el)) {
      parts.push(ownText(el).slice(0, 200));
    }
    return parts.join(' ');
  }

  function textEligible(el) {
    if (el.children.length === 0) return true;
    try {
      return el.getElementsByTagName('*').length <= 6 && el.textContent.length <= 220;
    } catch (e) {
      return false;
    }
  }

  // Distinguishing a real express-checkout button from a radio in the payment
  // list from a marketing banner is the difference between a useful row and a
  // misleading one, so classify rather than lumping everything together.
  function classify(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

    if (tag === 'iframe') return 'iframe';

    if (tag === 'input' && (type === 'radio' || type === 'checkbox')) return 'payment_option';
    if (role === 'radio') return 'payment_option';
    try {
      if (el.querySelector('input[type="radio"]')) return 'payment_option';
      const lbl = el.closest('label, li, [role="radio"], [role="radiogroup"] > *');
      if (lbl && (lbl.querySelector('input[type="radio"]') || (lbl.getAttribute('role') || '') === 'radio')) {
        return 'payment_option';
      }
    } catch (e) { /* ignore */ }

    if (tag === 'button' || role === 'button' || (tag === 'input' && (type === 'submit' || type === 'button'))) {
      return 'express_button';
    }
    if (tag === 'a' && el.getAttribute('href')) return 'express_button';
    if (tag.indexOf('-') > 0) return 'express_button'; // <apple-pay-button> etc
    try {
      if (el.closest('button, [role="button"]')) return 'express_button';
    } catch (e) { /* ignore */ }

    const txt = squash(el.textContent);
    if (/in \d+ (interest[- ]free )?(payments|installments)|as low as|starting at|learn more|from \$?\d/i.test(txt)) {
      return 'messaging';
    }
    return 'other';
  }

  // Walk the light DOM plus every open shadow root.
  function allElements() {
    const out = [];
    const roots = [document];
    let guard = 0;
    while (roots.length && guard++ < 2000) {
      const root = roots.shift();
      let els;
      try {
        els = root.querySelectorAll('*');
      } catch (e) {
        continue;
      }
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        out.push(el);
        if (el.shadowRoot) roots.push(el.shadowRoot);
      }
      if (out.length > 40000) break; // pathological page guard
    }
    return out;
  }

  const els = allElements();
  const raw = Object.create(null); // walletId -> [{el, ...}]

  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (SKIP.has(el.tagName)) continue;
    const tag = el.tagName.toLowerCase();

    const shallow = signatureOf(el, false);
    const tagIsCustomWallet = pats.some(function (p) { return p.tags.indexOf(tag) >= 0; });
    if (!tagIsCustomWallet && quickRe && !quickRe.test(shallow)) continue;

    const sig = signatureOf(el, true);

    for (let j = 0; j < pats.length; j++) {
      const p = pats[j];
      const byTag = p.tags.indexOf(tag) >= 0;
      const byRe = p.re && p.re.test(sig);
      if (!byTag && !byRe) continue;
      if (p.exclude && p.exclude.test(sig)) continue;

      const list = raw[p.id] || (raw[p.id] = []);
      if (list.length >= 60) continue; // pathological page guard
      list.push({
        el: el,
        p: p,
        kind: classify(el),
        visible: visible(el),
        tag: tag,
        text: ownText(el).slice(0, 90),
        ariaLabel: (el.getAttribute('aria-label') || '').slice(0, 90),
        selector: selectorFor(el),
        rect: rectOf(el),
        matchedBy: byTag ? 'custom-element' : 'signature',
        evidence: (sig.match(p.re || /$^/) || [''])[0].slice(0, 60),
      });
    }
  }

  // A wallet button is typically a stack of nested elements that all carry the
  // brand -- a wrapper <div>, the <button>, a <span>, an <img>. Reporting all of
  // them is noise, and reporting the *outermost* mislabels a real button as a
  // generic container. So drop any match that merely wraps another match of the
  // same wallet that is at least as actionable, and keep what is left.
  const hits = [];
  for (const id of Object.keys(raw)) {
    const list = raw[id];
    const kept = list.filter(function (m) {
      for (let k = 0; k < list.length; k++) {
        const other = list[k];
        if (other === m) continue;
        if (m.el.contains(other.el) && KIND_RANK[other.kind] <= KIND_RANK[m.kind]) return false;
      }
      return true;
    });
    kept.sort(function (a, b) {
      const d = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      if (d !== 0) return d;
      return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
    });
    for (let k = 0; k < kept.length && k < cfg.maxPerWallet + 2; k++) {
      const m = kept[k];
      hits.push({
        id: m.p.id, label: m.p.label, group: m.p.group,
        kind: m.kind, visible: m.visible, tag: m.tag, text: m.text,
        ariaLabel: m.ariaLabel, selector: m.selector, rect: m.rect,
        matchedBy: m.matchedBy, evidence: m.evidence,
      });
    }
  }

  // Region + page-type signals, from visible text only.
  const bodyText = squash(document.body ? document.body.innerText : '');
  const regions = [];
  if (regionRe) {
    const m = bodyText.match(new RegExp(cfg.regionPatterns.join('|'), 'ig'));
    if (m) {
      const seen = {};
      for (let i = 0; i < m.length && regions.length < 5; i++) {
        const k = m[i].toLowerCase();
        if (!seen[k]) { seen[k] = 1; regions.push(m[i]); }
      }
    }
  }
  const signals = [];
  if (signalRe) {
    const m = bodyText.match(new RegExp(cfg.signalPatterns.join('|'), 'ig'));
    if (m) {
      const seen = {};
      for (let i = 0; i < m.length; i++) {
        const k = m[i].toLowerCase();
        if (!seen[k]) { seen[k] = 1; signals.push(m[i]); }
      }
    }
  }

  return {
    url: location.href,
    title: document.title,
    hits: hits,
    regions: regions,
    signals: signals,
    elementCount: els.length,
    textLength: bodyText.length,
  };
}

/** List visible interactive elements so the agent can decide what to click. */
function scanInteractive(cfg) {
  function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function visible(el) {
    try {
      if (typeof el.checkVisibility === 'function' &&
          !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2;
    } catch (e) { return false; }
  }

  function selectorFor(el) {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + el.id;
    for (const attr of ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'name']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) return el.tagName.toLowerCase() + '[' + attr + '="' + v.replace(/"/g, '\\"') + '"]';
    }
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      let part = node.tagName.toLowerCase();
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift('#' + node.id); break; }
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  const sel = 'button, a[href], input[type="submit"], input[type="button"], input[type="radio"], ' +
              'input[type="checkbox"], select, [role="button"], [role="link"], [onclick], summary, form';
  const out = [];
  const roots = [document];
  let guard = 0;
  while (roots.length && guard++ < 1000) {
    const root = roots.shift();
    let els;
    try { els = root.querySelectorAll('*'); } catch (e) { continue; }
    for (let i = 0; i < els.length; i++) {
      if (els[i].shadowRoot) roots.push(els[i].shadowRoot);
    }
    let matches;
    try { matches = root.querySelectorAll(sel); } catch (e) { continue; }
    for (let i = 0; i < matches.length; i++) {
      const el = matches[i];
      if (!visible(el)) continue;
      const label = squash(el.getAttribute('aria-label') || el.value || el.textContent || el.getAttribute('title') || '');
      if (cfg.grep && !new RegExp(cfg.grep, 'i').test(label + ' ' + selectorFor(el))) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        label: label.slice(0, 100),
        href: (el.getAttribute('href') || '').slice(0, 160),
        selector: selectorFor(el),
      });
      if (out.length >= cfg.limit) return out;
    }
  }
  return out;
}

/**
 * Find product links with prices, cheapest first. Used to satisfy "add a
 * low-value item": buying the cheapest thing keeps the audit cheap and avoids
 * tripping fraud heuristics that fire on high-value carts.
 */
function scanPrices(cfg) {
  function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  const PRICE = /(?:[$£€¥₹]|\bUSD|\bEUR|\bGBP|\bCAD|\bAUD)\s?([0-9][0-9.,]*)|([0-9]+[.,][0-9]{2})\s?(?:USD|EUR|GBP|CAD|AUD|kr|zł)/i;
  // Prices that are not the price of a thing you can buy.
  const NOISE = /free ship|shipping over|orders over|save |you save|off\b|was |compare at|rrp|gift card|per month|\/mo\b|from \$?0(\.00)?\b/i;

  const out = [];
  const seen = Object.create(null);
  const els = document.querySelectorAll('*');
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.children.length !== 0) continue; // leaf text nodes only
    const txt = squash(el.textContent);
    if (!txt || txt.length > 40) continue;
    const m = txt.match(PRICE);
    if (!m) continue;
    if (NOISE.test(txt)) continue;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
    } catch (e) { continue; }

    const raw = (m[1] || m[2] || '').replace(/[,\s]/g, '');
    const value = parseFloat(raw.indexOf('.') < 0 && raw.length > 2 ? raw : raw);
    if (!isFinite(value) || value <= 0) continue;

    // Walk up for the enclosing product link and its title.
    let node = el;
    let link = null;
    let depth = 0;
    while (node && depth < 8) {
      if (node.tagName === 'A' && node.getAttribute('href')) { link = node; break; }
      const a = node.querySelector ? node.querySelector('a[href]') : null;
      if (a) { link = a; break; }
      node = node.parentElement;
      depth++;
    }
    if (!link) continue;
    let href;
    try { href = new URL(link.getAttribute('href'), location.href).href; } catch (e) { continue; }
    if (seen[href]) continue;
    if (/\/(cart|checkout|account|login|policies|pages\/)/i.test(href)) continue;
    seen[href] = 1;

    const title = squash(link.getAttribute('aria-label') || link.getAttribute('title') || link.textContent).slice(0, 100);
    out.push({ price: value, priceText: txt, title: title, url: href });
  }
  out.sort(function (a, b) { return a.price - b.price; });
  return out.slice(0, cfg.limit);
}

module.exports = { scanFrame, scanInteractive, scanPrices };
