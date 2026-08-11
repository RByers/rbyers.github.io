# How button detection works

Read this when a result looks wrong, when you need to add a wallet the skill
doesn't know, or when deciding whether a detection is trustworthy enough to
record.

## The two-stage idea

Wallet buttons are rendered every imaginable way: a `<button>` with text, a bare
`<img>` logo with no text at all, a custom element like `<apple-pay-button>`, a
cross-origin `<iframe>` the provider's SDK injects, or markup inside a shadow
root. So the scanner looks in a deliberately wide net of places and then narrows
with deliberately strict patterns.

**Stage 1 — build a wide signature.** For each element the scanner concatenates
its tag name, id, class, every `data-*` and `aria-*` attribute, `name`/`title`/
`alt`/`src`/`href`/`role`, the `alt` and `src` of any `<img>` inside it, inline
`<svg><title>` text, the CSS `background-image` URL, and its text. Text is only
taken from clickable elements and small containers (≤6 descendants) — reading the
text of a large container would match every brand mentioned anywhere on the page.
`<script>` and `<style>` subtrees are never read: an inline script that mentions
`ApplePaySession` is the most common way to "detect" an Apple Pay button on a page
that has none.

**Stage 2 — match narrow, brand-specific regexes.** See
`scripts/wallet-patterns.js`. Patterns use word boundaries and brand tokens
(`\bvenmo\b`, `pay[ _-]?pal`) rather than generic words like "pay", "wallet" or
"express", because the expensive mistake is a false positive: a row claiming a
store offers Google Pay when the string came from a footer link is worse than a
missing row.

Two patterns are deliberately conservative:

- **Stripe Link** — "link" is hopeless on its own, so only Stripe's actual
  spellings match (`stripe-link`, `pay with link`, `link-authentication`,
  `linkbutton`) plus the `link.com` frame host.
- **PayPal Pay Later** — a bare `/pay ?later/` would match every BNPL banner on
  the page, so it requires PayPal's own `paylater` funding-source token or "pay
  later" appearing next to "paypal".

## Classification, and why it matters

Every match is classified, and only the first three count as buttons:

| kind | meaning |
| --- | --- |
| `express_button` | a real clickable control — `<button>`, `<a href>`, `role=button`, or a `<*-pay-button>` custom element |
| `iframe` | a provider-hosted button frame (PayPal, Amazon Pay and Google Pay often render this way) |
| `payment_option` | the brand as a radio choice in the payment-method list, not an express button — counted, but reported distinctly because it is a different shopper experience |
| `messaging` | promo copy like "pay in 4 interest-free instalments · Learn more" — **not counted** |
| `other` | the brand name appears in visible text that is neither a control nor recognisable promo copy — **not counted** |

The `messaging`/`other` split is what keeps prose out of the data. A page reading
"this mug is ideal for travel" matches the iDEAL pattern; it is reported under
"branding/promo text only" and never lands in a wallet column.

## Visibility, and hidden SDK plumbing

A match only counts if it is actually on screen: non-zero size, not
`display:none`/`visibility:hidden`, not fully transparent, and — crucially — not
inside an iframe that is itself hidden. PayPal's SDK injects invisible
zero-size iframes on pages that show no PayPal button at all, and without the
frame-chain check every such store would be recorded as offering PayPal.

Anything that matched but is invisible appears under "In the DOM but not visible"
so you can see it was considered and rejected, rather than silently dropped.

## Nested matches

A wallet button is usually a stack of nested elements that all carry the brand: a
wrapper `<div>`, the `<button>`, a `<span>`, an `<img>`. Reporting all of them is
noise, and reporting the outermost mislabels a real button as a generic
container. So a match is dropped when it merely wraps another match of the same
wallet that is at least as actionable — the `<button>` wins over its wrapper, and
the wrapper is kept only when there is no button inside it.

## Apple Pay and Google Pay are browser-gated

Apple Pay only renders where `window.ApplePaySession` exists — Safari on Apple
hardware. Chromium has no such API, so an unmodified Chromium audit reports "no
Apple Pay" for every store on earth.

`start` therefore installs a shim by default that presents `ApplePaySession` with
`canMakePayments() === true`, which is what stores gate on. Its constructor
throws, so a click cannot open a real payment sheet.

What the shim proves: **the store has Apple Pay configured and would render the
button to an eligible shopper**. What it does not prove: that any particular
visitor sees it (that still depends on their browser, device and provisioned
cards). If you need the stricter reading, run with `--no-apple-pay-spoof`; Apple
Pay is then recorded as `unknown` rather than `no`, with a note explaining why.

Google Pay is gated more loosely — Chromium supports the Payment Request API, so
it generally renders without help — but some stores additionally check for a
signed-in Google account and will not show it. Treat a Google Pay absence as
weaker evidence than a Google Pay presence.

Mobile changes results too: `start --mobile` uses an iPhone user agent, and some
stores show Apple Pay only there while others hide wallets behind a collapsed
"more payment options" control.

## Adding wallets the skill doesn't know

Regional wallets (iDEAL variants, Blik, PIX, Paytm, MobilePay, Twint...) can be
added without editing the skill. Write a JSON array in the same shape as
`scripts/wallet-patterns.js`:

```json
[
  { "id": "blik", "label": "BLIK", "group": "apm", "match": "\\bblik\\b" },
  { "id": "mobilepay", "label": "MobilePay", "group": "wallet",
    "match": "mobile ?pay", "hosts": ["(^|\\.)mobilepay\\.dk$"] }
]
```

Then pass it to either command:

```bash
node $SHOP detect --patterns my-wallets.json
node $SHOP record --csv results.csv --patterns my-wallets.json
```

An entry reusing an existing `id` overrides that built-in pattern, which is the
way to tighten one that is producing false positives on a particular store.

Fields: `id` (column name), `label` (display name), `group`
(`wallet`/`bnpl`/`apm`/`accelerated`), `match` (case-insensitive regex source),
optional `exclude` (regex that vetoes a match), `hosts` (regex sources matched
against iframe hostnames), `tags` (custom element names to match directly).

## Platform-specific hints

- **Shopify** — wallets live in `.shopify-payment-button` on the product page and
  in a "dynamic checkout" block on the cart. Shop Pay is Shopify's own; its
  presence usually means the rest are one toggle away.
- **WooCommerce** — express buttons usually appear only on the cart/checkout page,
  not the product page, and often only after the shipping country is known.
- **BigCommerce / Magento / Salesforce Commerce** — wallets are frequently
  rendered in a provider iframe, so expect `iframe` rather than `express_button`
  as the kind. That is not a lesser result.
- **Headless / custom stacks** — anything goes; rely on `snapshot` and `detect
  --json`.
