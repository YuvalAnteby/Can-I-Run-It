#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'usage: %s <public-ghcr-sha-tag> <expected-ghcr-digest-ref>\n' "$0" >&2
  exit 2
fi

image_tag=$1
expected_ref=$2
if [[ "$image_tag" == *latest* || ! "$image_tag" =~ ^ghcr\.io/[^:]+:sha-[0-9a-fA-F]{40}$ ]]; then
  printf 'refusing non-immutable production image tag: %s\n' "$image_tag" >&2
  exit 1
fi
if [[ ! "$expected_ref" =~ ^ghcr\.io/[^@]+@sha256:[0-9a-fA-F]{64}$ ]]; then
  printf 'expected image digest is not an immutable GHCR digest: %s\n' "$expected_ref" >&2
  exit 1
fi

repository=${image_tag%%:*}
expected_repository=${expected_ref%%@*}
if [[ "$repository" != "$expected_repository" ]]; then
  printf 'expected digest repository does not match image tag\n' >&2
  exit 1
fi

# The tag pull is intentionally anonymous: the caller must log out of GHCR
# before invoking this helper. The expected digest came from the authenticated
# push response for the image that was scanned locally.
docker pull --quiet "$image_tag" >/dev/null
digest_ref=$(docker image inspect "$image_tag" --format '{{range .RepoDigests}}{{println .}}{{end}}' | awk -v prefix="${repository}@sha256:" 'index($0, prefix) == 1 { print; exit }')

if [[ "$digest_ref" != "$expected_ref" ]]; then
  printf 'anonymous tag pull resolved to %s, expected %s\n' "${digest_ref:-<missing>}" "$expected_ref" >&2
  exit 1
fi

docker pull --quiet "$expected_ref" >/dev/null
printf '%s\n' "$expected_ref"
