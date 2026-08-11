#!/usr/bin/env bash
#
# End-to-end self test: serves tests/mock-store on localhost, drives the whole
# add-to-cart -> checkout -> detect -> record flow against it, and asserts the
# result. No internet access needed.
#
# The fixture is built to exercise the cases that are easy to get wrong:
#   - Apple Pay rendered only when window.ApplePaySession exists (the shim)
#   - Google Pay as a custom element with no text of its own
#   - PayPal as a visible cross-document iframe
#   - a second, zero-size PayPal iframe that must not inflate the count
#   - Shop Pay inside a shadow root
#   - Klarna as a payment-method radio, not an express button
#   - an Amazon Pay button under display:none  (must NOT be counted)
#   - Affirm promo copy                        (must NOT be counted)
#   - the prose "ideal for travel"             (must NOT be counted as iDEAL)
#   - an inline <script> mentioning ApplePaySession (must not be read as a button)
#
# Usage: bash tests/selftest.sh [port]

set -uo pipefail

PORT="${1:-8899}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHOP="$HERE/../scripts/shop.js"
WORK="$(mktemp -d)"
BASE="http://127.0.0.1:$PORT"
fails=0

cleanup() {
  node "$SHOP" --state-dir "$WORK/session" stop >/dev/null 2>&1
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

check() { # check <description> <condition-result>
  if [ "$2" = "0" ]; then printf '  ok   %s\n' "$1"
  else printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); fi
}
has()  { grep -qF -- "$2" <<<"$1"; echo $?; }
hasnt() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }

echo "serving fixture on $BASE"
# Root path first: http-server's -s consumes the following argument, which
# silently leaves the root as the current directory.
npx --yes http-server "$HERE/mock-store" -p "$PORT" -c-1 --silent >/dev/null 2>&1 &
SRV_PID=$!
for _ in $(seq 1 20); do
  curl -sf "$BASE/" 2>/dev/null | grep -q 'Mock Store' && break
  sleep 0.5
done
curl -sf "$BASE/" 2>/dev/null | grep -q 'Mock Store' || {
  echo "fixture server did not serve tests/mock-store/index.html on port $PORT"; exit 1; }

S=(node "$SHOP" --state-dir "$WORK/session")

echo "driving the flow"
"${S[@]}" start --url "$BASE/" >/dev/null || { echo "start failed"; exit 1; }

PRICES="$("${S[@]}" prices)"
check "prices lists the cheapest item first" "$(has "$(head -1 <<<"$PRICES")" '$3.50')"

"${S[@]}" goto "$BASE/product-sticker.html" >/dev/null
"${S[@]}" click "text=Add to cart" >/dev/null
CART="$("${S[@]}" status)"
check "add to cart reaches the cart page" "$(has "$CART" '/cart.html')"

"${S[@]}" click "text=Checkout" >/dev/null
D="$("${S[@]}" detect)"
echo "$D" | sed 's/^/    | /'

check "recognises a checkout page"        "$(has "$D" 'looks like a cart/checkout page: yes')"
check "finds the express checkout region" "$(has "$D" 'express region: Express checkout')"
check "Apple Pay via the shim"            "$(has "$D" '- Apple Pay             express_button')"
check "Google Pay custom element"         "$(has "$D" '- Google Pay            express_button')"
check "PayPal iframe"                     "$(has "$D" '- PayPal                express_button')"
check "Shop Pay through shadow DOM"       "$(has "$D" '- Shop Pay              express_button')"
check "Klarna as a payment option"        "$(has "$D" '- Klarna                payment_option')"
check "counts exactly 5 wallets"          "$(has "$D" 'Visible wallet buttons (5)')"
check "hidden Amazon Pay not counted"     "$(has "$D" 'not visible (not counted): Amazon Pay')"
check "Affirm promo copy not counted"     "$(has "$D" 'not a button (not counted): Affirm')"
check "prose 'ideal' not a wallet"        "$(hasnt "$(sed -n '/Visible wallet/,/^$/p' <<<"$D")" 'iDEAL')"

echo "recording"
CSV="$WORK/results.csv"
"${S[@]}" record --csv "$CSV" --site mockstore --product "Vinyl Sticker" --price 3.50 --no-screenshot >/dev/null
ROW="$(tail -1 "$CSV")"
check "row written"                       "$(has "$ROW" 'mockstore')"
check "apple_pay=yes"                     "$(python3 -c "
import csv,sys
r=list(csv.reader(open('$CSV')));d=dict(zip(r[0],r[-1]))
sys.exit(0 if d['apple_pay']=='yes' and d['paypal']=='yes' and d['klarna']=='yes' else 1)"; echo $?)"
check "amazon_pay=no (hidden)"            "$(python3 -c "
import csv,sys
r=list(csv.reader(open('$CSV')));d=dict(zip(r[0],r[-1]))
sys.exit(0 if d['amazon_pay']=='no' and d['affirm']=='no' else 1)"; echo $?)"
check "wallet_count excludes the radio"   "$(python3 -c "
import csv,sys
r=list(csv.reader(open('$CSV')));d=dict(zip(r[0],r[-1]))
sys.exit(0 if d['wallet_count']=='4' else 1)"; echo $?)"

echo "user-supplied header is preserved"
CSV2="$WORK/custom.csv"
printf 'Date,Store,"Apple Pay",PayPal,Reviewer\n' > "$CSV2"
"${S[@]}" record --csv "$CSV2" --site mockstore --no-screenshot >/dev/null
check "columns matched by friendly name"  "$(python3 -c "
import csv,sys
r=list(csv.reader(open('$CSV2')))
sys.exit(0 if r[0]==['Date','Store','Apple Pay','PayPal','Reviewer']
         and r[1][2]=='yes' and r[1][3]=='yes' and r[1][4]=='' else 1)"; echo $?)"

echo "refuses to record a non-checkout page"
"${S[@]}" goto "$BASE/" >/dev/null
"${S[@]}" record --csv "$CSV" --site mockstore --no-screenshot >/dev/null 2>&1
check "guard blocked the bogus row"       "$([ "$(wc -l < "$CSV")" = "2" ] && echo 0 || echo 1)"

echo
if [ "$fails" = "0" ]; then echo "PASS - all checks green"; else echo "FAIL - $fails check(s) failed"; fi
exit "$fails"
