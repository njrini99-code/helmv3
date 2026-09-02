#!/usr/bin/env bash
# Fake curl for scripts/__tests__/deploy-prod-verify.test.ts. Placed first on
# PATH so the deploy script's verification never reaches a network.
#
# Understands the flags the script uses — -s, -f, --max-time N, -o FILE,
# -w FMT — and exactly one URL. Logs each URL to $FAKE_CURL_LOG.
#
# Bodies: the site root is a page whose HTML references two JS chunks; any
# chunk URL returns a body carrying $FAKE_STAMP_SHA, so a test controls
# whether the "release stamp reached the bundle" check passes by choosing
# that value. The HTTP status written for -w is $FAKE_HTTP (default 200).

out=""
fmt=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) fmt="$2"; shift 2 ;;
    --max-time) shift 2 ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done

printf '%s\n' "$url" >> "${FAKE_CURL_LOG:?FAKE_CURL_LOG must be set}"

case "$url" in
  */_next/static/chunks/*)
    body="/* chunk */ var release=\"${FAKE_STAMP_SHA:-}\";"
    ;;
  *)
    body='<html><head><script src="/_next/static/chunks/main-a1b2c3.js"></script><script src="/_next/static/chunks/app/page-d4e5f6.js"></script></head><body>ok</body></html>'
    ;;
esac

if [ -n "$out" ]; then
  if [ "$out" != /dev/null ]; then
    printf '%s' "$body" > "$out"
  fi
else
  printf '%s' "$body"
fi

if [ -n "$fmt" ]; then
  printf '%s' "${FAKE_HTTP:-200}"
fi
exit 0
