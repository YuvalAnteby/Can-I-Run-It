#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  printf 'usage: %s <backend-resource-id> <https-backend-origin> <https-static-origin> <expected-api-image-digest>\n' "$0" >&2
  exit 2
fi

backend_resource_id=$1
backend_url=${2%/}
static_origin=${3%/}
expected_image=$4
management_endpoint=${AZURE_MANAGEMENT_ENDPOINT:-https://management.azure.com}
api_version=${AZURE_CONTAINER_APP_API_VERSION:-2025-01-01}

if [[ ! "$backend_resource_id" =~ ^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft\.App/containerApps/[^/]+$ ]]; then
  printf 'invalid Container App resource ID\n' >&2
  exit 1
fi
if [[ ! "$backend_url" =~ ^https://[^/]+$ || ! "$static_origin" =~ ^https://[^/]+$ ]]; then
  printf 'backend and Static Web Apps origins must be HTTPS origins\n' >&2
  exit 1
fi
if [[ ! "$expected_image" =~ ^ghcr\.io/[^@]+@sha256:[0-9a-fA-F]{64}$ ]]; then
  printf 'expected API image must be an immutable digest\n' >&2
  exit 1
fi

app_json=$(az rest --method get --url "${management_endpoint}${backend_resource_id}?api-version=${api_version}" --output json)
export EXPECTED_IMAGE="$expected_image"
printf '%s' "$app_json" | python3 -c '
import json
import os
import sys

app = json.load(sys.stdin)
properties = app.get("properties", {})
configuration = properties.get("configuration", {})
template = properties.get("template", {})
containers = template.get("containers", [])
if not containers or containers[0].get("image") != os.environ["EXPECTED_IMAGE"]:
    raise SystemExit("active API image does not match the scanned digest")
if configuration.get("activeRevisionsMode") != "Single":
    raise SystemExit("Container App is not in Single revision mode")
scale = template.get("scale", {})
if scale.get("minReplicas") != 0 or scale.get("maxReplicas") != 1:
    raise SystemExit("Container App scale is not min0/max1")
traffic = configuration.get("ingress", {}).get("traffic", []) or []
labels = [entry.get("label") for entry in traffic if entry.get("label")]
if labels:
    raise SystemExit("public old revision labels are present: " + ",".join(labels))
trust_proxy = next(
    (item for item in (containers[0].get("env", []) if containers else [])
     if item.get("name") == "TRUST_PROXY"),
    None,
)
if trust_proxy is not None and (
    "secretRef" in trust_proxy
    or trust_proxy.get("value") not in ("", "0", "false", "False")
):
    raise SystemExit("TRUST_PROXY must remain explicitly disabled before ingress proof")
print("verified Single revision, min0/max1, no public old revision labels, and TRUST_PROXY disabled")
'

live_body=$(mktemp)
ready_body=$(mktemp)
headers=$(mktemp)
cleanup() {
  rm -f "$live_body" "$ready_body" "$headers"
}
trap cleanup EXIT

curl --fail --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  "$backend_url/api/health/live" >"$live_body"
curl --fail --silent --show-error --retry 2 --retry-delay 2 --max-time 15 \
  -H "Origin: $static_origin" -D "$headers" \
  "$backend_url/api/health/ready" >"$ready_body"

allow_origin=$(awk 'tolower($1) == "access-control-allow-origin:" { gsub("\r", "", $2); print $2; exit }' "$headers")
if [[ "$allow_origin" != "$static_origin" ]]; then
  printf 'CORS origin mismatch: expected %s, received %s\n' "$static_origin" "${allow_origin:-<missing>}" >&2
  exit 1
fi

printf 'verified live, readiness, and exact CORS origin %s\n' "$static_origin"
