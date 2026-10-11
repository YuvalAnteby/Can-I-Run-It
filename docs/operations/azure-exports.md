# Azure portable exports

This runbook covers the private PostgreSQL export container and the daily
export checker. The tools image contains PostgreSQL 16 `pg_dump`,
`pg_restore`, and the compiled maintenance entrypoints. The export and control
containers use Entra-authenticated Blob access; anonymous blobs, shared keys,
and public SAS URLs are outside this workflow.

## Inputs and image

Use the platform outputs for the exact resource IDs, storage account, and
container names. The checker needs `AZURE_CLIENT_ID`,
`FIREWALL_JOB_RESOURCE_ID`, `EXPORT_JOB_RESOURCE_ID`, and an immutable
`TOOLS_IMAGE_DIGEST`. An operator-triggered run also needs the
`EXPORT_CHECK_JOB_RESOURCE_ID` output. The checker also needs
`AZURE_STORAGE_ACCOUNT`,
`AZURE_CONTROL_CONTAINER`, and `AZURE_EXPORTS_CONTAINER`. Cost thresholds use
`AZURE_SUBSCRIPTION_ID`, `CREDIT_PERIOD_START`, `CREDIT_PERIOD_END`, and
`CREDIT_CURRENCY` when those values are supplied. Date values must be UTC ISO
instants and the currency must be the verified credit currency.

The exporter additionally needs the shared PostgreSQL settings and does not
read the control container. In Entra mode set
`POSTGRES_AUTH_MODE=entra`, `POSTGRES_SSL_MODE=verify-full`,
`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, and
`AZURE_CLIENT_ID`; omit `POSTGRES_PASSWORD`. The shared database configuration
validates the host, port, pool limit, auth mode, and TLS mode. The PostgreSQL
utilities use `PGSSLROOTCERT=system` unless `POSTGRES_SSL_CA_FILE` names the
configured CA file. A new Entra token is obtained for each `pg_dump`,
`pg_restore`, or `psql` process.

Build the tools image from the repository root and keep the resulting digest
with the protected deployment evidence:

```text
docker build -f infra/Dockerfile.tools .
```

Production Jobs use their attached user-assigned managed identity. An
operator's Windows host normally has no attached identity, so the supported
manual path is to start the export-check Job shown below. The Docker command
is for an MI-enabled maintenance runner or a test fixture only. Keep its
protected environment file outside the repository and mount a configured CA
file only when `POSTGRES_SSL_CA_FILE` is used:

```text
docker run --rm --env-file C:\secure\ciri-exports.env \
  ghcr.io/<owner>/ciri-tools@sha256:<64-hex-digest> \
  node /app/dist/maintenance/export-check.js
```

## Checker and manual runs

The checker is the normal entrypoint. It acquires the lease on
`exports/schedule.json`, records the pending marker before starting any Job,
confirms the firewall Job, and starts the export Job only after firewall
success. The checker has a 55-second operation budget and does not wait for
the long export. `Running` and `Processing` remain pending; only `Succeeded`
completes the request. `Stopped`, `Degraded`, and `Failed` leave the request
due and record a failure. `Unknown` or a missing status remains pending until
the execution can be correlated safely.

For a production manual run, fetch the actual export-check Job template and
start that Job with `EXPORT_MANUAL=true`. This PowerShell example preserves the
full template and sends the direct REST body; replace the resource ID and
digest with protected platform outputs:

```powershell
$jobId = '/subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.App/jobs/<export-check-job>'
$digest = 'ghcr.io/<owner>/ciri-tools@sha256:<64-hex-digest>'
$api = '?api-version=2026-07-01'
$job = az rest --method get --url "https://management.azure.com$jobId$api" | ConvertFrom-Json
$template = $job.properties.template | ConvertTo-Json -Depth 100 | ConvertFrom-Json
$containers = @($template.containers) + @($template.initContainers)
$tools = @($containers | Where-Object {
  @($_.env) | Where-Object { $_.name -eq 'TOOLS_IMAGE_DIGEST' }
})
if ($tools.Count -ne 1) { throw 'The Job template must identify exactly one tools container' }
$tools = $tools[0]

function Set-EnvValue($container, $name, $value) {
  $entries = @(@($container.env) | Where-Object { $_.name -eq $name })
  if ($entries.Count -gt 1) { throw "Duplicate $name in Job template" }
  if ($entries.Count -eq 1) {
    $entries[0].value = $value
    if ($entries[0].PSObject.Properties['secretRef']) {
      $entries[0].PSObject.Properties.Remove('secretRef')
    }
  } else {
    $container.env = @(@($container.env) + [pscustomobject]@{ name = $name; value = $value })
  }
}

$tools.image = $digest
Set-EnvValue $tools 'TOOLS_IMAGE_DIGEST' $digest
Set-EnvValue $tools 'EXPORT_MANUAL' 'true'
$body = $template | ConvertTo-Json -Depth 100 -Compress
az rest --method post --url "https://management.azure.com$jobId/start$api" `
  --headers Content-Type=application/json --body $body
```

The Job then invokes `node /app/dist/maintenance/export-check.js`; its attached
identity performs the Blob, ARM, and optional Cost Management calls.

An MI-enabled maintenance runner may run the exporter directly after
preparing the firewall:

```text
docker run --rm --env-file C:\secure\ciri-exports.env \
  ghcr.io/<owner>/ciri-tools@sha256:<64-hex-digest> \
  node /app/dist/maintenance/export.js
```

This direct command takes the separate `exports/lease` Blob lease, exports the
database, and publishes a verified manifest. It does not advance
`exports/schedule.json`; use the checker Job to start a scheduled/manual
request so the schedule records the completion. `CIRI_EXPORT_REQUEST_MARKER`
may be set for a controlled manual run, but never reuse a marker for two
concurrent requests.

## Recovery and completion correlation

The pending schedule stores the request marker, phase, Job execution identity
when known, and tools image digest. Azure Job start can return `200` with an
execution identity or `202` with an empty body and a `Location` header. Both
responses are accepted. If the checker stops before saving the identity, the
next run lists executions and accepts exactly one execution whose injected
`CIRI_EXPORT_REQUEST_MARKER` and tools image digest match the pending request.
An ambiguous match, missing marker, conflicting digest, or untrusted execution
reference fails closed and keeps the request due; it must not start a duplicate
export.

A known terminal Job failure or a definite client-side start rejection clears
only that failed pending attempt, records the failure, and leaves the schedule
due for a new marker on the next checker run. A request timeout (`408`), rate
limit (`429`), client disconnect (`499`), transport error, server error (`5xx`),
accepted `202` without a persisted execution identity, or any ambiguous
correlation keeps the pending marker so recovery cannot start a duplicate
export.

The start request is built from the current Job template and sends the direct
REST body containing `containers` and `initContainers`. Existing image,
command, args, environment, resources, and other template fields are
preserved. Only the selected tools container image, `TOOLS_IMAGE_DIGEST`, and
request marker are overridden. The completion manifest must contain the same
marker and digest, valid member paths under one `exports/<run>/` prefix, and a
valid `sha256.txt`/contents readback before the checker clears pending state.
The exporter performs the full dump readback checksum before publishing that
manifest; the checker reads only the bounded completion metadata so it stays
within its 55-second budget.

## Credit thresholds and fallback

Cost Management is advisory automation. A snapshot is usable only when its
period, currency, and non-negative cost match the configured credit period.
The checker records each reached fixed `$80` and `$90` threshold in the verified
currency and does not refire a recorded threshold. A threshold remains owed
until a successful export records it, so a failed attempt can be retried from
the same verified cost snapshot without creating a duplicate crossing later.
If Cost Management is unavailable, returns an empty or malformed result, or
returns another currency/period, the checker reports
`threshold_unavailable`, does not consume a threshold, and keeps the four-month
date path and `EXPORT_MANUAL` path available. An independently configured Azure
budget email is the notification fallback; it is not treated as a verified
threshold trigger and cannot stop Azure spending.

## Storage layout and retention

Each completed run is stored below a private prefix such as
`exports/1772323200000-ciri-export-.../`:

```text
database.dump     # PG16 custom format
contents.txt      # pg_restore --list output
sha256.txt        # SHA-256 of database.dump
manifest.json     # published last, after readback verification
```

The exporter writes `database.dump` with `--format=custom --no-owner --no-acl`,
checks that `pg_restore --list` is non-empty, hashes the dump as a stream, and
reads the dump, contents, and hash back from Blob before writing
`manifest.json`. It uses a renewable 60-second lease on `exports/lease` for the
whole long-running operation. The schedule/control lease is a different Blob
in the control metadata namespace and is never reused for export data.

Retention keeps the newest two completed sets whose manifests and members
still verify. A failed or partial upload cannot delete either prior set. An
incomplete prefix is eligible for cleanup only after 24 hours; interrupted
member deletion is reported for a later retry. The checker never enumerates or
deletes control/state blobs.

## Download, hash, and restore

Before opening an archive, use Entra login and download a named completed set
and its manifest from the private exports container. Do not use a public URL or
shared account key. Compare all three values before restore:

1. Read `manifest.json`, record `dump_blob`, `hash_blob`, `contents_blob`,
   `size_bytes`, and `sha256`.
2. Download the named dump, hash file, and contents file. Require the local
   dump size to equal `size_bytes`; compare `Get-FileHash -Algorithm SHA256`
   (or `sha256sum`) with both `manifest.sha256` and the single value in
   `sha256.txt`.
3. Run PostgreSQL 16 `pg_restore --list database.dump` and review the object
   list before restoring.
4. Restore only into an isolated PostgreSQL 16 target with
   `pg_restore --no-owner --no-acl --dbname <isolated-target> database.dump`.
   Keep the target separate from production until row counts, IDs, provenance,
   indexes, sequences, the migration ledger, and representative API reads
   have been checked.

Do not reverse migrations or overwrite the production database as an automatic
response to a failed release. A production restore is a human-reviewed,
isolated-target recovery procedure. No Azure restore or live PostgreSQL 16
restore is implied by local build checks; record that evidence separately.
