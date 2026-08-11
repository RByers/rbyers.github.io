# Troubleshooting

## The browser won't start

`Chromium binary not found` — install it: `npx playwright install chromium`, or
point at an existing one with `start --chrome-path /path/to/chrome`.

`Playwright not found` — `npm install -g playwright`. The script also looks in the
global module root and `NODE_PATH`, so a global install is enough; no local
`package.json` is needed.

`Chromium did not expose a debugging port within 30s` — read `chrome.log` in the
session directory (printed as `stateFile`'s folder). In containers the usual
causes are a missing `--no-sandbox` (already passed) or exhausted `/dev/shm`
(`--disable-dev-shm-usage`, also already passed).

A stale session after a crash: `node $SHOP stop` then start again, or
`start --force`.

## Every page fails with a TLS or tunnel error

If the environment routes outbound HTTPS through a proxy, `start` picks up
`HTTPS_PROXY` automatically and passes `--proxy-server` plus `--proxy-bypass-list`
from `NO_PROXY`.

Such proxies re-terminate TLS, and Chromium reads its own NSS store rather than
the system trust store, so certificates are rejected. `start` handles this by
pinning the proxy CA's public key hash via
`--ignore-certificate-errors-spki-list`, which trusts exactly that one key and
nothing else. If it can't find the CA automatically, compute the pin yourself and
pass it:

```bash
openssl x509 -in /path/to/proxy-ca.crt -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
node $SHOP start --ca-spki "<the base64 value>" --url https://store.example
```

Never disable certificate verification wholesale.

`ERR_TUNNEL_CONNECTION_FAILED` with a 403 from the proxy is not a TLS problem at
all — it means the environment's egress policy forbids that host. Report the
blocked host rather than trying to route around it; the audit simply cannot run
against that store from that environment.

## A click doesn't land

1. `node $SHOP snapshot --grep "<something from the label>"` — get the real
   selector rather than guessing.
2. If the element is in an iframe (consent banners often are):
   `node $SHOP click "text=Accept" --frame consent` — `--frame` matches any part
   of the frame's URL.
3. If several elements match, `--nth 1`.
4. If something invisible overlaps it, `--force`.
5. If a modal is in the way, `node $SHOP press Escape`.
6. If clicking opened a new tab, `node $SHOP pages` lists them; commands default
   to the newest real page, and `--page N` targets a specific one.

## The store shows a bot wall / CAPTCHA / "access denied"

Record it and move on. `detect` will report `looks like a cart/checkout page: NO`,
which is the signal. Add the row explicitly so the CSV shows coverage rather than
a silent gap:

```bash
node $SHOP record --csv results.csv --site "Example" \
  --allow-any-page --notes "blocked by bot protection, not audited"
```

Do not try to defeat the protection. `start` already avoids the most obvious
automation tells (`--disable-blink-features=AutomationControlled`); going further
is both fragile and not what the user asked for.

Worth trying once before giving up: `start --headed` (if a display exists) or
`start --mobile`, since some walls only fire on headless desktop signatures.

## Wallet buttons load after the scan

Provider SDKs mount late. `detect` already settles the page, scans, waits, and
scans again, taking the union — so a slow PayPal button is not recorded as absent.
If a store is slower still:

```bash
node $SHOP detect --settle 15000
```

If a button is visible in a screenshot but missing from `detect`, capture the
evidence and check whether its brand string appears anywhere the scanner reads:
`node $SHOP detect --json` shows exactly what matched and where. A genuinely new
rendering style may need a custom pattern — see `detection.md`.

## Results look wrong

- **A brand is reported that clearly isn't a button** — check which bucket it is
  in. "Branding/promo text only" and "In the DOM but not visible" are not counted
  in the CSV; only the "Visible wallet buttons" list is.
- **A brand is missing that you can see** — it may be inside a closed shadow root
  (unreadable by design) or a cross-origin frame that blocks scripting. The frame
  URL check catches most of these; `detect --json` shows what was reachable.
- **Everything is missing and the page looks empty** — you are probably on a page
  that requires an address or login before revealing payment options. Audit the
  cart page instead and note it.

## The CSV came out wrong

Run `record --dry-run` first: it prints the header it found and the row it would
write, without touching the file. If a column stayed blank, its name didn't match
any known field — rename it in the CSV, or accept the blank and fill it manually.
The skill never reorders or adds columns to a file that already has a header,
because silently reshaping a file someone has been collecting for weeks is worse
than a blank cell.

`columnsNotInYourCsv` in the output lists values that were detected but had
nowhere to go — if something important is in there, add that column to the CSV.
