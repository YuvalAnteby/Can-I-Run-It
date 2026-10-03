# Azure database and portable export operations

This is the approved implementation runbook, not evidence of a deployed service.
Read the [architecture](../architecture/azure-production.md) and
[implementation contract](../architecture/azure-terraform-handoff.md) first.

## Roles and tracked bootstrap script

Script: `infra/database/azure/bootstrap-roles.sql`. This is a psql script with
meta-commands, not a TypeORM SQL string. It runs as the configured human Entra
administrator, initially connected to the server's `postgres` database. It then
connects to the selected application database, normally `ciri`.

| SQL role | Identity mapping | Permissions granted |
| --- | --- | --- |
| ciri-runtime | Backend UAMI principal/object ID | CONNECT; public schema USAGE; SELECT on current/future migrator tables; INSERT/UPDATE on cpus, gpus, games, game_requirements, performance_records; USAGE on their ID sequences; enum/domain USAGE |
| ciri-migrator | Migration UAMI principal/object ID | CONNECT; owns public schema and application objects created by migrations; schema DDL/seed; no CREATEDB, CREATEROLE, replication or bypass-RLS |
| ciri-exporter | Export UAMI principal/object ID | CONNECT; public schema USAGE; SELECT on current/future tables and sequences; enum/domain USAGE; no writes/DDL |
| Human Entra administrator | Explicit server Entra admin | Role mapping, initial ownership/grants, extension setup and exceptional repair |

Runtime has no DELETE, TRUNCATE, schema CREATE, role membership or DDL rights.
It can read `game_engines` but cannot maintain that table. Runtime read grants can
include the migration ledger; runtime write grants cannot. Future tables receive
read grants only; a migration must explicitly grant any approved new write access
and sequence USAGE. No automatically inherited future-table write access.

The script rejects a role name mapped to a different object ID, an unmapped
existing role, an elevated Entra mapping/role or unexpected role membership.
It validates UUIDs, checks distinct principal IDs, quotes values/identifiers and
reconciles grants. It does not silently remap users or transfer existing objects.
Mapping and application grants are separate transactions because PostgreSQL roles
are cluster-wide and Azure's mapping functions run in `postgres`.
After a second-phase failure, correct the cause and rerun; existing mappings remain.

Azure RBAC cannot substitute for SQL grants. `AZURE_CLIENT_ID` selects a UAMI for
token acquisition; the script needs its `principalId`/Entra service-principal object
ID, not that client ID. Use the fixed SQL role name as POSTGRES_USER.

Bootstrap prerequisites:
1. Entra enabled, human administrator configured, dedicated application database
   created, and human administrator authorized as its owner/grant administrator.
   Check this explicitly after Terraform database creation; ARM RBAC alone is
   insufficient. Do not make ordinary migration/release identities Entra admins.
2. Add a temporary exact operator IPv4 rule; verify TLS and wait for propagation.
3. Execute the script on an empty application schema. Existing public tables/
   sequences/views must already belong to ciri-migrator; otherwise it fails.
4. Allowlist `pg_trgm` in Flexible Server parameters and install it as the human
   admin before running schema migrations. Migration role has no database CREATE
   privilege for installing extensions; schema SQL can retain IF NOT EXISTS.
5. Run the initial TypeORM schema migration and explicit seed under ciri-migrator.
6. Rerun this script as the human admin to apply explicit existing-table write
   grants. Remove the temporary operator rule in all success/failure paths.

The script temporarily grants migrator membership to the bootstrap session when
needed for ownership/default privileges, then removes only that temporary grant.
The second transaction rolls back its temporary grant on failure. The human admin
must have authority to grant/set this role and change schema ownership; fail and
repair that authority explicitly rather than elevate routine CI.

Example invocation (IDs/names are nonsecret; use a fresh token securely in
PGPASSWORD or a mode-0600 temporary password file, never command-line arguments):

```sh
# PGHOST, PGPORT=5432, PGUSER=<human Entra login>, and current token already set.
# Use current trusted roots; keep verify-full and hostname verification enabled.
PGSSLMODE=verify-full psql -X --dbname=postgres \
  --set=ON_ERROR_STOP=1 \
  --set=app_db=ciri \
  --set=runtime_oid=<backend-principal-id> \
  --set=migrator_oid=<migration-principal-id> \
  --set=exporter_oid=<export-principal-id> \
  --file=infra/database/azure/bootstrap-roles.sql
```

Replace angle-bracket placeholders before running; do not paste them literally
into a shell. Unset the token and remove its file afterward. Do not use psql -a/-e
or shell tracing while handling tokens.

For an imported database, inventory object owners/ACLs first. Use a reviewed,
database-scoped ownership migration to ciri-migrator; do not run indiscriminate
cluster-wide REASSIGN OWNED. Resolve conflicting Entra mappings manually without
destroying dependencies. Then rerun bootstrap and permission checks. A replacement
UAMI has a new principal ID and requires a deliberate mapping transition.

## Migrations and seed

Keep one TypeORM migration ledger and synchronize=false. The current fresh
`infra/init-scripts/` schema already includes changes from legacy migration 001;
it is unsafe to apply that migration blindly afterward. Codex must build/test a
consistent fresh baseline and an existing-database upgrade path, preserving IDs,
lifecycle/provenance, indexes, enums and all data.

The finite migration Job uses the matching release tools digest and migrator MI.
It acquires a database advisory lock and terminates successfully before API
deployment. No implicit migrations/seed in HTTP startup. Normal migrations apply
approved object privileges themselves; they do not require a human bootstrap on
every release. Default privileges apply only to objects created by the actual
ciri-migrator role, not by an unrelated admin/role.

Initial seed is explicit and repeatable. Use stable keys and insert-missing behavior;
do not overwrite operator changes or duplicate performance records when rerun.
Do not run seed on every deployment. Manual maintenance POST/PATCH, API-key guard,
fail-closed activation, environment example and DTO validation are covered by
[issue #82](https://github.com/YuvalAnteby/Can-I-Run-It/issues/82).

## Azure backups and a portable copy

Azure automatic backups retain seven days. PITR creates a new Azure server,
which adds resources/cost until removed. Reconfigure/verify its identities,
firewall, parameters and application connection before using it. Azure physical
backup files are not downloadable cross-cloud seeds.

Use PostgreSQL 16 pg_dump in custom format for a portable database snapshot:

```sh
# Export Job has fresh exporter-MI token and PGHOST/PGUSER/PGDATABASE configured.
PGSSLMODE=verify-full pg_dump --format=custom --no-owner --no-acl \
  --file=ciri.dump
pg_restore --list ciri.dump > ciri.contents.txt
sha256sum ciri.dump > ciri.dump.sha256
```

Export the complete application database, including schema, data, indexes,
constraints, sequence state and the migration ledger. Roles/server settings are
not part of pg_dump; provision destination roles/grants/extensions separately.
There are currently no large objects or row-level-security tables. Adding either
requires an explicit exporter-permission review; do not silently emit partial data.

## Export policy and durable metadata

Create a first portable export after initial schema/seed verification. Thereafter
run a short check daily at 02:00 UTC, but perform a DB dump only when:
- Four calendar months have elapsed since the last successful export, or
- Verified credit-period consumption reaches $80 or $90, once per threshold, or
- The operator explicitly starts a manual export.

The daily checker uses Blob control metadata and Cost Management; it does not
query/dump the database on every run. Reconcile firewall rules before a requested
export. API/provider cost permissions belong to the checker/control identity,
not the exporter or backend.

Persist last_success_at, next_due_at, fired_thresholds, credit_period_start/end,
currency and last verified cost snapshot in a separate private control container.
Use ETags/leases to prevent competing triggers and exports. Compute four calendar
months with month-end clamping in UTC; do not replace it with a daily/monthly dump.
Mark success and consume thresholds only after the export completes. If both
thresholds are crossed before one check, one successful export may satisfy both.
Failed triggers/uploads remain due and retry with bounded backoff and visible status.

Validate Cost Management Query against the actual Azure for Students subscription.
Cost data can be delayed and may not equal education credit balance. Query from
the actual credit-period start, preserve that period across calendar years and
validate currency. Do not enable a claimed automatic credit threshold on mismatched
or unavailable data. Fallback: working budget email plus manual export, visibly
documented as fallback. The four-month/manual paths remain available.

There is no guaranteed last-minute export after a subscription is suspended or
credits expire. Threshold exports are an early warning mechanism, not a hard
real-time monitor. Monitor burn rate and take a final manual export before moving.

## Upload verification and retention

Use a private export container and unique UTC/run-ID prefixes. A completed dump
set includes ciri.dump, SHA-256, table-of-contents and a manifest with PostgreSQL
version, schema/migration version, timestamp, file size and image digest. No tokens,
provider keys or database connection strings belong in the manifest.

1. Obtain a fresh exporter token; run pg_dump and validate its exit code/list.
2. Hash locally, upload with Entra auth, verify remote size and downloaded/hash
   content (small demo permits read-back), then publish the completion manifest.
3. Only completed verified manifests count as successful exports.
4. Retain the newest two successful sets; prune only older completed sets after
   verifying the new one. A failure preserves the previous valid copies.
5. Clean abandoned incomplete prefixes separately after a bounded retention window.
   Never delete the control container or Terraform state. Account soft deletion/
   versioning must not retain all historical dump versions indefinitely.

A valid archive listing/checksum is not a restore test. Restore a sample dump to
an isolated disposable database before accepting the export implementation and
after schema/tooling changes. Record results; delete any temporary paid resources.

## Download and restore to AWS/GCP

Download via the Azure portal with Blob data permissions, or Azure CLI using
Entra authorization. This requires access to Blob, not an opened database firewall:

```sh
az storage blob download --auth-mode login \
  --account-name <export-account> --container-name <exports-container> \
  --name <completed-prefix>/ciri.dump --file ciri.dump
```

Download its matching SHA-256/manifest too and verify the checksum. Create an empty
destination PostgreSQL database, preferably 16 initially. Check provider extension
support (`pg_trgm`) and configure destination users, TLS and ownership separately.
Install trusted extensions with destination admin authority if restore owner lacks
database CREATE; create the schema/object owner before restoring.

```sh
# Destination TLS/auth settings and owner PGUSER are configured securely.
pg_restore --no-owner --no-acl --exit-on-error \
  --dbname=<empty-destination-database> ciri.dump
```

Restore under the destination migration/object-owner role, then apply destination
runtime/export grants and verify row counts, representative data, indexes,
sequences, migrations and real API queries. Run ANALYZE. Do not reapply the initial
schema/seed to a complete restored DB. Upgrade tooling/schema deliberately if the
destination major version differs.

For final cutover, stop application/admin writes, take/download a final dump,
restore and verify, update the backend settings, test, then retire old resources.
A periodic dump is a point-in-time snapshot; changes made afterward need a new dump.

## Required verification

Check allowed operations and denied DELETE/DDL under the actual runtime token;
read/dump and denied writes under exporter; schema ownership under migrator;
rerun bootstrap, conflicting-OID rejection, future defaults and pool reconnect
after token expiry. Verify each executor's firewall source and correct TLS roots.
Only an Azure integration run verifies pgaadauth, MI, RBAC and Flexible Server behavior.

## References

- [Entra role mapping functions](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users)
- [Managed identity and postgres bootstrap database](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity)
- [PostgreSQL 16 default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html)
- [Azure PostgreSQL backups](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore)
- [pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html)
- [pg_restore 16](https://www.postgresql.org/docs/16/app-pgrestore.html)
- [Blob authorization with Entra](https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-access-azure-active-directory)
- [Budget evaluation/data lag](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
