# Azure production delivery

This runbook describes the reviewed Azure delivery boundary. The repository has
no Azure credentials and this document records no live resource, role, cost, or
secret values. A local workflow check is evidence of configuration only; the
acceptance ledger below must stay Azure-unverified until a human runs the gates
in the target subscription.

## Fixed deployment boundary

The platform root owns the production resource group, default-network
Consumption Container Apps environment, single-revision API, Static Web Apps
Free site, PostgreSQL Flexible Server 16 B1ms with 32 GiB storage, private
control/export storage, Key Vault URI references, and finite maintenance Jobs.
The API listens on external HTTPS port 4000 with scale min 0/max 1. No VNet,
private endpoint, NAT, ACR, gateway, extra database, queue, Redis, dedicated
profile, or silent paid fallback is part of this release.

The platform outputs consumed by release are resource IDs and public HTTPS
origins: `BACKEND_RESOURCE_ID`, `BACKEND_URL`, `STATIC_WEB_APP_ORIGIN`,
`FIREWALL_JOB_RESOURCE_ID`, and `MIGRATION_JOB_RESOURCE_ID`. The maintenance
contract also supplies `TOOLS_IMAGE_DIGEST`. Output values contain no deployment
token, provider key, password, Terraform state, or secret value.

The GitHub subjects are separate and exact:

| Workflow | Protected environment | Federated subject |
| --- | --- | --- |
| platform plan/apply | `azure-platform` | `repo:YuvalAnteby/Can-I-Run-It:environment:azure-platform` |
| production release | `production` | `repo:YuvalAnteby/Can-I-Run-It:environment:production` |

The release workflow is triggered only by `main`. Pull requests and forks run
checks without deployment permissions. The platform workflow is dispatch-only,
defaults to plan, and requires reviewed-input, cost, state, and explicit apply
authorization gates plus the protected environment reviewer.

## Human bootstrap and state boundary

Before creating anything, the operator records the subscription, tenant,
approved region, available entitlement, quota, current credit period and
currency, alert address, resource names, and the two immutable image digests.
The $80/$90 credit thresholds remain in the verified credit currency. A budget
notification warns; it cannot stop Azure spending. Do not substitute a paid SKU
or region when a gate is unknown.

Create the dedicated state resource group, state storage account, private
`terraform-state` container, and separate private `bootstrap-state` container
with the human-only bootstrap root. Enable Azure AD/OIDC state access,
versioning, soft-delete retention, HTTPS/TLS 1.2, and disabled public blob and
shared-key access. Follow the canonical [bootstrap README human procedure](../../infra/terraform/bootstrap/README.md#foundation-creation-and-state-handoff),
including its temporary backend-file hold, encrypted state export and hash,
`finally` restoration, and separate [state-migration procedure](../../infra/terraform/bootstrap/README.md#foundation-creation-and-state-handoff).
Keep bootstrap and production keys distinct. The human reviews every plan and
retains the encrypted, access-controlled state export outside the repository;
it is recovery evidence only and never a public workflow artifact or commit.

After the bootstrap root creates the two OIDC identities, the human checks the
issuer, audience, repository, and protected environment subjects before assigning
the narrow roles. The platform identity receives only production resource and
production state-container permissions. The release identity receives only the
API resource image-update permission and the selected Job start/execution-read
permissions. Firewall, export, checker, cost, and SQL permissions stay on their
separate managed identities. Do not assign Owner, Contributor, User Access
Administrator, wildcard secret read, RBAC administration, or PostgreSQL Entra
administrator rights to either GitHub workflow.

If state recovery is needed, restore the checkout and initialize the same
protected backend coordinates, then inspect `terraform state pull` before any
plan. If resources remain but state is lost, import them under the documented
addresses and require a no-destroy plan. Never initialize the production state
key as the bootstrap key and never recover by deleting the resource group.

## Key Vault and PostgreSQL bootstrap

The API receives only native, versionless or explicitly versioned Key Vault
secret URIs. Provision provider values through the human secret-management
process, record only their URIs in the protected platform variables, and keep
the values out of Terraform variables, plans, state, logs, frontend variables,
and workflow artifacts. Apply in stages: create the platform without provider
references, grant the backend UAMI `Key Vault Secrets User`, verify the grant,
then apply URI metadata. Rotate a provider key by writing a new Key Vault
version, updating the protected URI when a pinned version is used, and restarting
the API revision after confirming the reference. Verify the new revision without
printing the value; native versionless references may refresh within Azure's
documented refresh window, so a deliberate restart is the deterministic option.

Only the authorized human configures the PostgreSQL Entra administrator and
runs `infra/database/azure/bootstrap-roles.sql`. The human supplies TLS,
hostname verification, the real tenant/object IDs, and the approved database
names. The script is repeatable only after its extension and principal checks
pass; it is never an ordinary CI step and never a Terraform secret input.

For a temporary operator connection, first discover one exact public IPv4 and
reject ranges, private/CGNAT addresses, `0.0.0.0`, and guessed ingress IPs. Use a
try/finally cleanup so the rule is removed even when SQL bootstrap or migration
fails:

```powershell
$ruleName = "human-bootstrap-$env:BUILD_BUILDID"
$publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org").Trim()
try {
  az postgres flexible-server firewall-rule create `
    --resource-group <production-resource-group> --name <postgres-server> `
    --rule-name $ruleName --start-ip-address $publicIp --end-ip-address $publicIp
  # Run the reviewed TLS/Entra SQL bootstrap or maintenance command here.
} finally {
  az postgres flexible-server firewall-rule delete `
    --resource-group <production-resource-group> --name <postgres-server> `
    --rule-name $ruleName --yes
}
```

The exact-IP rule is temporary human access. Job egress rules are reconciled by
the firewall Job from the API/migration/export resource IDs and must never be
broadened to an internet-wide rule.

## Release sequence

On `main`, reusable backend and frontend checks continue to run with audit,
lint, type-check, unit/E2E, build, and image-scan gates. The release builds the
API and tools images once, scans both before publication, publishes only
`sha-<full-commit>` tags, logs out, and anonymously pulls each public GHCR tag
to require the exact `@sha256:` digest returned by the authenticated push. If a
tag moves or a package is private, the release stops; a registry credential is
never added to the Azure deployment step.

The protected `production` job then performs this bounded sequence:

1. Start the firewall Job and require terminal `Succeeded` within the finite
   timeout. Empty, unknown, failed, cancelled, stopped, degraded, or timed-out
   executions fail the release and preserve the existing rules.
2. Start the migration Job with the exact scanned tools image digest and the
   matching `TOOLS_IMAGE_DIGEST` environment override on the Terraform
   `migration` container. The release reads the Job template first so command,
   args, resources, and other environment entries remain unchanged. Require
   terminal success before touching the API image. Migration never seeds and
   never reverses a schema automatically.
3. Update only the API Container App image to the scanned digest. The release
   principal does not edit Terraform-managed scale, ingress, identity, secrets,
   Job definitions, or RBAC assignments.
4. Build the SPA with `VITE_API_URL=https://<api-origin>/api`, reject provider
   and infrastructure secret tokens in the bundle, and upload static files with
   the externally provisioned protected SWA deployment token.
5. Smoke the SWA root, `/about` deep link, emitted asset, and `/api/*`
   exclusion. Verify the API image digest, Single revision mode, scale min 0/max 1, no
   public old-revision labels, `TRUST_PROXY` disabled, liveness, readiness, and
   the exact Static Web Apps CORS origin. Any smoke failure marks the release
   failed; it does not claim Azure acceptance.

The frontend's `staticwebapp.config.json` rewrites application deep links to
`/index.html` and excludes `/assets/*` and `/api/*` from that fallback. The
frontend calls the API's HTTPS origin directly; the SWA host is not an API proxy.
Provider keys and database credentials do not enter `VITE_*` variables.

## Rollback and database safety

An API-only rollback selects a previously verified full-SHA digest and repeats
the protected image update plus readiness/CORS checks. Never deploy `latest` and
never expose an old revision label. A failed release after a successful
migration is an application rollback only: do not run an automatic reverse
migration or automatic reverse migration job, delete rows, or infer that an
old image understands the new schema.
If compatibility cannot be restored, stop release traffic and use the latest
verified portable export and the human-reviewed restore procedure against an
isolated target. Validate row counts, IDs, provenance, indexes, sequences, and
the migration ledger before any controlled cutover.

Portable exports are private and read-back verified. Download a named completed
dump and its manifest through Entra-authenticated Blob access, compare the
recorded SHA-256 before opening it, inspect it with PostgreSQL 16 `pg_restore
--list`, and restore with `--no-owner --no-acl` only into the reviewed target.
Keep the newest two completed valid sets; failed or partial exports never prune
the prior completed copies. Terraform state exports follow the separate state
recovery procedure above and must never be mixed with database export blobs.

## Acceptance ledger

| Evidence class | Required evidence | Local status in this implementation |
| --- | --- | --- |
| Local | Workflow YAML/static config, shell syntax, frontend build guard, existing CI definitions, no secret/state artifacts | Must be rerun on the final integration tree |
| Azure-unverified | Subscription/region/credit worksheet, protected state lock, OIDC subjects/roles, Key Vault references, SQL extension/grants, firewall discovery, Job override/status, SWA token, CORS and forged-header proof | Intentionally deferred; no Azure calls were made |
| Observed deployment | Exact scanned digests, migration execution, API image read-back, readiness, no old labels, deep-link/assets/API smoke, export read-back/hash/restore | Must be recorded by the authorized release operator |
