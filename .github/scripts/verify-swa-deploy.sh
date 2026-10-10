#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'usage: %s <https-static-origin>\n' "$0" >&2
  exit 2
fi

static_origin=${1%/}
if [[ ! "$static_origin" =~ ^https://[^/]+$ ]]; then
  printf 'Static Web Apps origin must be an HTTPS origin\n' >&2
  exit 1
fi

index_body=$(mktemp)
deep_link_body=$(mktemp)
asset_body=$(mktemp)
api_body=$(mktemp)
cleanup() {
  rm -f "$index_body" "$deep_link_body" "$asset_body" "$api_body"
}
trap cleanup EXIT

curl --fail --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  "$static_origin/" >"$index_body"
curl --fail --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  "$static_origin/about" >"$deep_link_body"

grep -q '<div id="root"></div>' "$index_body" || {
  printf 'SWA root did not return the built application shell\n' >&2
  exit 1
}
grep -q '<div id="root"></div>' "$deep_link_body" || {
  printf 'SWA deep-link fallback did not return the application shell\n' >&2
  exit 1
}

asset_path=$(grep -oE '/assets/[^" ]+\.(js|css)' "$index_body" | head -n 1 || true)
if [[ -z "$asset_path" ]]; then
  printf 'SWA root did not expose a built asset\n' >&2
  exit 1
fi
curl --fail --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  "$static_origin$asset_path" >"$asset_body"

api_status=$(curl --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  --output "$api_body" --write-out '%{http_code}' "$static_origin/api/health/live")
if [[ "$api_status" == "200" ]] || grep -q '<div id="root"></div>' "$api_body"; then
  printf 'SWA /api/* was served by the SPA fallback\n' >&2
  exit 1
fi

printf 'verified SWA root, /about deep-link, asset delivery, and /api/* exclusion\n'
