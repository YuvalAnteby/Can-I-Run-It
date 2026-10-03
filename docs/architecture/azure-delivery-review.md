# Azure delivery review

Reviewed 2026-10-03 against staging commit
`4ef01411a987c4c9d9d8a73ced7124a5683524c9`.

This change installs the supplied architecture, implementation contract, database
runbook, SQL bootstrap design and Terraform README, and applies the supplied
README/operations documentation patch. Terraform, workflows, application code and
local Compose configuration are unchanged. Implementation waits for user review.

## Local verification

- The five installed package files match the source SHA-256 hashes.
- The documentation patch passed forward checking before application and reverse
  checking afterward against the documented staging baseline.
- All 23 relative Markdown links across the seven delivered/updated documents
  resolve; their code fences are balanced.
- `git diff --check` passes. A read-only independent review found no integration
  mistakes and identified the two supplied-SQL issues below.
- Microsoft's [Jobs REST contract](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/get?view=rest-resource-manager-containerapps-2026-07-01)
  documents `properties.outboundIpAddresses`; the documented
  [Entra mapping functions](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users)
  support the principal types and mapping fields used by the design.

The bootstrap script remains unchanged and unexecuted. No SQL parsing/execution,
Azure integration, entitlement, regional price or deployment verification is
claimed by this review. The original package's verification results are historical
handoff evidence, not checks rerun here.

## Bootstrap blockers to resolve before execution

1. **Validation must return a failing exit status.** The six validation branches
   in `infra/database/azure/bootstrap-roles.sql` use `\quit 2`. PostgreSQL 16's
   [psql command contract](https://www.postgresql.org/docs/16/app-psql.html)
   defines no exit-status argument for `\quit`; normal termination returns zero.
   Missing inputs, the wrong starting database or an invalid application database
   can therefore look successful to the caller. Replace those exits with SQL
   exceptions under `ON_ERROR_STOP`, and verify every rejected input returns a
   nonzero process status before either bootstrap phase mutates roles or grants.

2. **Reruns must reject or reconcile conflicting default privileges.** Existing
   table/sequence revocations do not remove prior default ACLs. For example, a
   prior `ALTER DEFAULT PRIVILEGES FOR ROLE "ciri-migrator" IN SCHEMA public
   GRANT INSERT ON TABLES TO "ciri-exporter"` survives this script's default SELECT
   grants and permits writes on the next migration-created table. Audit/reject
   conflicting defaults or explicitly reconcile both global and public-schema
   defaults for runtime, exporter and PUBLIC before granting the intended reads.
   [PostgreSQL 16 default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html)
   are additive across those scopes. Verify drifted defaults, future objects and
   repeated bootstrap runs, including denied runtime DELETE and exporter writes.

These are issues in the supplied bootstrap design, not copy/patch errors. They do
not change the approved services, networking, budget or identity choices. Resolve
them and validate the script under an authorized human Entra session before use.

## Remaining implementation gates

After user review, follow the complete acceptance checklist in the
[implementation contract](azure-terraform-handoff.md), including:

- Actual subscription entitlements, credit dates/currency, regional SKUs/quotas,
  costs and existing Azure resource/state ownership before provisioning.
- Reviewed Terraform plans and OIDC permissions; native Key Vault references;
  immutable public image pulls; verified API/SPA release and rollback behavior.
- Real PostgreSQL 16/Azure bootstrap, grants, token-refresh/TLS, migrations/seed
  and each executor's firewall connectivity and reconciliation checks.
- Export scheduling, thresholds, failure retention, checksums and an isolated
  restore; scale-to-zero/cold-start measurements and observed telemetry/billing.

No infrastructure deployment or one-year budget guarantee is established by this
documentation handoff. Issue #82 continues to own admin endpoint implementation.
