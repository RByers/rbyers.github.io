'use strict';

/**
 * Signatures for express-checkout / wallet buttons.
 *
 * Every pattern is matched against a "signature string" built from an element's
 * tag name, id, class, aria-*, data-*, name/title/alt/src/href, its inline SVG
 * titles and <img> alt text, its CSS background-image URL, and (for clickable
 * elements) its text. That is deliberately broad: wallet buttons are rendered
 * every imaginable way -- a <button> with text, a bare <img> logo, a custom
 * element, or a cross-origin <iframe> the provider's SDK injects.
 *
 * `match` is intentionally narrow even though the signature is broad, because
 * the expensive mistake here is a false positive: reporting that a store offers
 * Google Pay when the string came from a footer link. Prefer word boundaries and
 * brand-specific tokens over generic words like "pay", "wallet" or "express".
 *
 * Regexes are stored as strings so this table can be serialized into the page.
 * All are matched case-insensitively.
 */

/** @type {Array<{id:string,label:string,group:string,match?:string,exclude?:string,hosts?:string[],tags?:string[]}>} */
const WALLETS = [
  {
    id: 'apple_pay',
    label: 'Apple Pay',
    group: 'wallet',
    match: 'apple[ _-]?pay',
    tags: ['apple-pay-button'],
    hosts: ['(^|\\.)apple\\.com$'],
  },
  {
    id: 'google_pay',
    label: 'Google Pay',
    group: 'wallet',
    // "gpay" as a whole token; "g-pay"/"googlepay" also appear in the wild.
    match: 'google[ _-]?pay|\\bg[ _-]?pay\\b',
    tags: ['google-pay-button'],
    hosts: ['(^|\\.)pay\\.google\\.com$', '(^|\\.)payments\\.google\\.com$'],
  },
  {
    id: 'shop_pay',
    label: 'Shop Pay',
    group: 'wallet',
    // Shopify's own accelerated wallet. Distinct from the generic
    // "shopify-payment-button" wrapper, which hosts *all* the wallet buttons.
    match: 'shop[ _-]?pay|shopify[ _-]?pay\\b',
    hosts: ['(^|\\.)shop\\.app$'],
  },
  {
    id: 'paypal',
    label: 'PayPal',
    group: 'wallet',
    match: 'pay[ _-]?pal',
    hosts: ['(^|\\.)paypal\\.com$', '(^|\\.)paypalobjects\\.com$'],
  },
  {
    id: 'paypal_pay_later',
    label: 'PayPal Pay Later',
    group: 'bnpl',
    // Only the PayPal SDK's own token, or "pay later" adjacent to "paypal".
    // A bare /pay ?later/ would match every BNPL banner on the page.
    match: 'paylater|funding[ _-]?source["\'=: ]*paylater|pay[ _-]?pal[^a-z]{0,16}pay[ _-]?later',
  },
  {
    id: 'venmo',
    label: 'Venmo',
    group: 'wallet',
    match: '\\bvenmo\\b',
    hosts: ['(^|\\.)venmo\\.com$'],
  },
  {
    id: 'amazon_pay',
    label: 'Amazon Pay',
    group: 'wallet',
    match: 'amazon[ _-]?pay|pay[ _-]?with[ _-]?amazon',
    hosts: ['(^|\\.)payments\\.amazon\\.com$', '(^|\\.)payments-amazon\\.com$', '(^|\\.)static-na\\.payments-amazon\\.com$'],
  },
  {
    id: 'meta_pay',
    label: 'Meta Pay',
    group: 'wallet',
    match: 'meta[ _-]?pay|facebook[ _-]?pay',
    hosts: ['(^|\\.)facebook\\.com$', '(^|\\.)meta\\.com$'],
  },
  {
    id: 'stripe_link',
    label: 'Link (Stripe)',
    group: 'wallet',
    // "link" alone is hopeless -- every page is full of links. Require the
    // brand-specific spellings Stripe's Elements actually emit.
    match: 'stripe[ _-]?link|pay[ _-]?with[ _-]?link|link[ _-]?authentication|linkbutton|link[ _-]?express',
    hosts: ['(^|\\.)link\\.com$'],
  },
  {
    id: 'cash_app_pay',
    label: 'Cash App Pay',
    group: 'wallet',
    match: 'cash[ _-]?app',
    hosts: ['(^|\\.)cash\\.app$'],
  },
  {
    id: 'klarna',
    label: 'Klarna',
    group: 'bnpl',
    match: '\\bklarna\\b',
    hosts: ['(^|\\.)klarna\\.com$', '(^|\\.)klarnaservices\\.com$'],
  },
  {
    id: 'afterpay',
    label: 'Afterpay / Clearpay',
    group: 'bnpl',
    match: 'after[ _-]?pay|clear[ _-]?pay',
    hosts: ['(^|\\.)afterpay\\.com$', '(^|\\.)clearpay\\.co\\.uk$'],
  },
  {
    id: 'affirm',
    label: 'Affirm',
    group: 'bnpl',
    match: '\\baffirm\\b',
    hosts: ['(^|\\.)affirm\\.com$'],
  },
  {
    id: 'sezzle',
    label: 'Sezzle',
    group: 'bnpl',
    match: '\\bsezzle\\b',
    hosts: ['(^|\\.)sezzle\\.com$'],
  },
  {
    id: 'zip',
    label: 'Zip / Quadpay',
    group: 'bnpl',
    match: 'quadpay|\\bzip[ _-]?pay\\b|zippay',
    hosts: ['(^|\\.)zip\\.co$', '(^|\\.)quadpay\\.com$'],
  },
  {
    id: 'bolt',
    label: 'Bolt',
    group: 'accelerated',
    match: 'bolt[ _-]?checkout|boltcheckout|\\bbolt[ _-]?pay\\b',
    hosts: ['(^|\\.)bolt\\.com$'],
  },
  {
    id: 'revolut_pay',
    label: 'Revolut Pay',
    group: 'wallet',
    match: 'revolut',
    hosts: ['(^|\\.)revolut\\.com$'],
  },
  {
    id: 'alipay',
    label: 'Alipay',
    group: 'wallet',
    match: '\\balipay\\b',
    hosts: ['(^|\\.)alipay\\.com$'],
  },
  {
    id: 'wechat_pay',
    label: 'WeChat Pay',
    group: 'wallet',
    match: 'wechat[ _-]?pay|weixin',
  },
  {
    id: 'ideal',
    label: 'iDEAL',
    group: 'apm',
    // Whole-token only: "ideal" is a substring of nothing useful but a common
    // English adjective, so this one leans on classification to stay honest.
    match: '\\bideal\\b',
  },
  {
    id: 'amazon_one_click',
    label: 'Amazon 1-Click / Buy with Prime',
    group: 'accelerated',
    match: 'buy[ _-]?with[ _-]?prime',
  },
];

/**
 * Text that marks the express-checkout region itself. Finding one of these is a
 * strong signal we are looking at the right part of the right page, even when no
 * individual wallet matched -- which is the difference between "this store has
 * no wallets" and "the scan ran too early / on the wrong page".
 */
const REGION_PATTERNS = [
  'express\\s*(checkout|pay(ment)?s?)',
  'faster\\s*(way\\s*to\\s*)?(check\\s*out|payment)',
  'quick\\s*(checkout|pay)',
  'or\\s+continue\\s+(with|below)',
  'pay\\s+with\\s+one\\s+click',
];

/**
 * Text that means "this really is a checkout/cart page". Used as a sanity check
 * before a result is worth recording -- a wallet scan of a product page or a
 * bot-block interstitial is worse than no data, because it looks like data.
 */
const CHECKOUT_SIGNAL_PATTERNS = [
  'place\\s+(your\\s+)?order',
  'complete\\s+(your\\s+)?(order|purchase)',
  'pay\\s+now',
  'continue\\s+to\\s+(payment|shipping|delivery)',
  'order\\s+summary',
  'shipping\\s+address',
  'billing\\s+address',
  'payment\\s+method',
  'promo\\s+code|discount\\s+code|gift\\s+card',
  'subtotal',
];

/**
 * Merge user-supplied patterns (a JSON file with the same shape as WALLETS) on
 * top of the built-ins. Same `id` replaces; new `id` appends. Regional wallets
 * (Ideal, Blik, PIX, Paytm, ...) are the expected use for this.
 */
function withExtraPatterns(extra) {
  if (!extra || !extra.length) return WALLETS.slice();
  const out = WALLETS.slice();
  for (const p of extra) {
    if (!p || !p.id) continue;
    const i = out.findIndex((w) => w.id === p.id);
    const merged = Object.assign({ group: 'custom', label: p.id }, i >= 0 ? out[i] : {}, p);
    if (i >= 0) out[i] = merged;
    else out.push(merged);
  }
  return out;
}

module.exports = { WALLETS, REGION_PATTERNS, CHECKOUT_SIGNAL_PATTERNS, withExtraPatterns };
