---
name: ecommerce-checkout-buttons
description: Audit which express checkout / wallet buttons (PayPal, Apple Pay, Google Pay, Shop Pay, Amazon Pay, Klarna, Affirm, Venmo, Link, Afterpay...) a store offers, by driving a real browser through the store, adding a low-value item to the cart, opening checkout, detecting the buttons, and appending a row to a CSV. Use this whenever someone wants to know what payment or wallet buttons a shop shows at checkout, wants to compare checkout options across retailers, mentions auditing/surveying/benchmarking checkout or payment methods on e-commerce sites, or hands over a list of store URLs plus a spreadsheet to fill in - even if they don't say "browser" or "automation".
---

# Auditing express checkout buttons on e-commerce sites

The goal of one run: get a real browser to the point a shopper reaches just before
paying, look at what wallet buttons are actually on screen, and append one honest
row to the user's CSV.

The hard part is not the detection, it is getting there. Every storefront is laid
out differently, so this skill gives you a browser you drive step by step rather
than a single script that guesses. You look at the page, decide what to click,
and click it.

## Ground rules

**Never complete a purchase.** Stop at the checkout page. Do not click a wallet
button (that opens a real payment sheet), do not enter card details, do not press
"Place order". Detection is read-only, and it is enough — the buttons are visible
without touching them.

**Only audit stores the user is entitled to test.** This is normal competitive
and UX research on public storefronts, but it does put load on someone else's
site. Keep it to one cheap item per store, and if a site presents a bot wall or a
"are you human" check, record that fact and move on rather than trying to defeat
it. A row that says "blocked" is useful; a row invented from a blocked page is
worse than no row.

**Pick the cheapest thing you can find.** A low-value item keeps carts under
free-shipping and fraud-review thresholds that can change which wallets a store
shows, and it avoids interstitials that only fire on expensive baskets.

## Setup

Requires Node and Playwright's Chromium. Check with:

```bash
node -e "require('playwright').chromium.executablePath()" 2>/dev/null || npm install -g playwright
```

All commands below are `node <skill>/scripts/shop.js <command>`. Set `SHOP` once
so the rest reads cleanly:

```bash
SHOP=".claude/skills/ecommerce-checkout-buttons/scripts/shop.js"   # adjust to the skill's actual path
node $SHOP help
```

## The workflow

### 1. Start a browser and land on the store

```bash
node $SHOP start --url https://example-store.com
```

This launches a Chromium that stays alive between commands, so the cart and
session cookies survive. Everything after this attaches to the same browser until
you `stop`.

By default it also installs an Apple Pay shim. Chromium has no `ApplePaySession`
API, and stores only render the Apple Pay button when that API exists — so
without the shim every audit would report "no Apple Pay" no matter what the store
offers. The shim makes the button render; its constructor throws, so an
accidental click cannot open a payment sheet. Pass `--no-apple-pay-spoof` if you
specifically want to see what a plain Chromium user sees; the CSV then records
`unknown` for Apple Pay rather than a misleading `no`.

Useful variants: `--mobile` (iPhone UA and viewport — mobile checkouts often
expose different wallets), `--headed` if a display is available, `--window W,H`.

### 2. Find a cheap product

```bash
node $SHOP prices                 # priced product links on this page, cheapest first
```

If the landing page has no products, navigate to a category, sale, or accessories
page first (`node $SHOP goto <url>`) and run `prices` there. Small accessories —
stickers, socks, keychains, samples — are ideal. If `prices` finds nothing, fall
back to `snapshot` and read the page yourself.

### 3. Add it to the cart

```bash
node $SHOP goto https://example-store.com/products/sticker
node $SHOP snapshot --grep "add to|bag|cart"
node $SHOP click "text=Add to cart"
```

`snapshot` lists visible clickable elements with ready-to-use selectors, which is
usually faster than guessing. Selectors accept CSS or Playwright syntax:
`text=Add to bag`, `role=button[name=/add to cart/i]`, `#AddToCart`, `//xpath`.

Things that commonly block this step, and what to do:

- **Cookie / privacy banner** — `snapshot --grep "accept|agree|consent"` then
  click it. Some live in an iframe; use `click "text=Accept" --frame consent`.
- **Country or currency interstitial** — pick the user's market, or the store's
  default if they didn't say. Note the choice in `--notes`, because available
  wallets are region-specific.
- **Required variant (size/colour)** — click a variant before add-to-cart;
  `snapshot` shows them.
- **A drawer/mini-cart opens instead of navigating** — that is fine, continue to
  step 4 from there.
- **Newsletter or discount modal** — `node $SHOP press Escape`, or click its close
  control.

Confirm it worked before moving on: `node $SHOP status` shows cart-related text
on the page.

### 4. Go to checkout

```bash
node $SHOP goto https://example-store.com/cart      # or click the cart icon
node $SHOP click "text=Checkout"
node $SHOP status
```

Most wallet buttons appear either on the cart page or on the first checkout step,
so if `click "text=Checkout"` leads to a login wall, stop there and audit the cart
page instead — note that in `--notes`. Do not create accounts.

Guest checkout is the right path when offered.

### 5. Detect

```bash
node $SHOP detect
```

Read the output before recording it. It tells you three separate things:

- **Visible wallet buttons** — what a shopper can actually click, each labelled
  `express_button` (a real button), `iframe` (a provider-hosted button frame), or
  `payment_option` (a choice in the payment-method list rather than an express
  button). These are what get counted.
- **Branding/promo text only** — the brand appears but not as a control, e.g. an
  Affirm "as low as $12/mo" banner. Not counted, and correctly so.
- **In the DOM but not visible** — provider SDKs (PayPal especially) inject hidden
  iframes on pages that show no button. Not counted.

Also check `looks like a cart/checkout page`. If that says NO, you are probably on
an interstitial, a bot wall, or an error page, and the result is meaningless.

If a store's buttons load slowly, `detect --settle 12000` waits longer. `detect
--json` gives full evidence including selectors and screen positions.

### 6. Record

```bash
node $SHOP record --csv path/to/results.csv \
  --site "Example Store" --product "Vinyl Sticker" --price 3.50 \
  --product-url https://example-store.com/products/sticker \
  --notes "guest checkout, US market"
```

This re-runs detection, saves a screenshot next to the CSV under `evidence/`, and
appends one row.

**The user's CSV shape wins.** If the file already has a header, its columns and
order are preserved exactly and filled in where they match — `Apple Pay`,
`apple_pay`, `ApplePay` all resolve to the same value, and columns the skill knows
nothing about (say `Reviewer`) are left blank for the user to fill. Only when the
file doesn't exist is a default header created. `--dry-run` shows the row it would
write without touching the file, which is worth doing on the first store when the
user supplied their own CSV so you can confirm the mapping landed correctly.

`record` refuses to write if the page doesn't look like a cart or checkout page.
That guard exists because a plausible-looking row from the wrong page is the one
failure mode that quietly corrupts the whole dataset. If you are deliberately
auditing some other page, pass `--allow-any-page`.

### 7. Next store, or stop

For another store, `goto` its homepage and repeat from step 2 — or `stop` and
`start` fresh, which is better between stores because it clears cookies and cart
state that can leak between merchants on shared platforms.

```bash
node $SHOP stop
```

Always stop when finished; the browser otherwise keeps running.

## Reporting back

Tell the user what was found per store, and be explicit about anything you could
not check — a login wall, a bot block, a region you had to pick, a store where
only the cart page was reachable. Those caveats are the difference between a
survey they can trust and one they can't. The `notes` column carries them into the
CSV automatically for the cases the tool can detect on its own.

If a store was blocked entirely, still add a row with `--allow-any-page` and a
note saying so, so the CSV shows coverage rather than a silent gap.

## Going deeper

- `references/detection.md` — how matching and classification work, the full
  wallet list, adding regional wallets via `--patterns`, and the false-positive
  traps the classifier is designed around.
- `references/troubleshooting.md` — bot walls, proxies and TLS, slow-loading
  wallet SDKs, iframes, popups, and what to do when a click won't land.
- `assets/checkout-buttons-template.csv` — a starter CSV if the user hasn't
  provided one.
- `tests/selftest.sh` — drives the whole flow against a bundled mock storefront
  on localhost and asserts the result, no internet needed. Run it
  (`bash tests/selftest.sh`) if detection starts behaving oddly, or after
  changing the patterns, to confirm the machinery still works before blaming a
  store.
