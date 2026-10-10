# Protected Azure platform delivery

The [Terraform platform README](../../infra/terraform/README.md) is the source
of truth for resource ownership, fixed sizes, imports, Key Vault URI references,
and the human bootstrap boundary. This runbook covers the protected workflow
that delivers that root after the platform Terraform change is stacked onto
this feature branch. It records local implementation only; no Azure account,
OIDC, state, or live plan was accessed here.

## Before dispatch

The GitHub environment must be named `azure-platform`, require human reviewers,
prevent self-review where the repository supports it, and allow deployments
from `main` only. Its variables provide the tenant, subscription, platform
client, West Europe location, production state account/container/key, state
resource group, and identifier-only `AZURE_TERRAFORM_VARS_JSON`. The variables
must not contain passwords, tokens, storage keys, SAS values, or provider secret
values; provider inputs are Key Vault URIs only.

The protected identity subject is fixed to
`repo:YuvalAnteby/Can-I-Run-It:environment:azure-platform`. The platform role
and production state-container Blob Data Contributor assignment are human
bootstrap gates. The workflow does not register providers, create role
assignments, configure PostgreSQL administrators, create secrets, or alter the
bootstrap state container.

## Plan

Dispatch `.github/workflows/azure-platform.yml` from the exact current `main`
commit. `plan` is the default operation. Enter the 40-character commit and
explicitly acknowledge the dated subscription/cost proof, provider/grant/quota
proof, and production backend/state import inventory. The workflow rejects a
different repository, event, ref, or commit before Azure login.

After OIDC login, Terraform 1.9.8 initializes the approved production backend
with Entra/OIDC auth and the read-only provider lock. It saves one binary plan,
derives its text and JSON from that binary, and rejects malformed plans,
diagnostics, deletes, and replacements. The files are uploaded with Entra-authenticated
Azure CLI to the existing private state container under exactly:

```text
plans/<full-main-sha>/<github-run-id>-<run-attempt>/
```

The binary, review text, review JSON, and private diagnostics are uploaded with
`--overwrite false`; `manifest.json` is uploaded last as the complete-plan
marker. The manifest binds the repository/workflow, main commit, original run
and attempt, 24-hour expiry, Terraform version, provider-lock digest, tenant,
subscription, backend coordinates, binary digest, filenames, and safe change
counts. The workflow prints only the commit prefix, plan identifier, expiry, and
generic status. It never publishes a plan, state, tfvars, JSON, diagnostic, or
signed URL as a workflow artifact, cache, summary, comment, or public blob.

## Human review

An authorized reviewer signs into the approved tenant and subscription and
downloads the manifest first, then the exact `tfplan`, into encrypted
human-only storage. Validate the manifest's commit, backend, tenant,
subscription, Terraform/provider lock, plan identifier, and expiry. Hash the
downloaded binary and compare it to `original_plan_sha256`; regenerate the text
and JSON locally from those same bytes with Terraform 1.9.8. Review every
change, zero deletes or replacements, existing-state/import ownership, fixed
SKU/network/cost choices, native URI references, and readiness gates. Keep the
plan identifier and original digest in the private approval record.

The reviewer may use this command shape after filling identifiers from the
protected environment result. Check the native exit status after every command:

```powershell
az storage blob download --auth-mode login --account-name <state-account> --container-name terraform-state --name plans/<commit>/<run-id>-<attempt>/manifest.json --file manifest.json --no-progress --only-show-errors --output none
az storage blob download --auth-mode login --account-name <state-account> --container-name terraform-state --name plans/<commit>/<run-id>-<attempt>/tfplan --file tfplan --no-progress --only-show-errors --output none
Get-FileHash -Algorithm SHA256 -LiteralPath .\tfplan
terraform show -no-color .\tfplan > .\review.txt
terraform show -json .\tfplan > .\review.json
```

## Apply

Dispatch `apply` on the same `main` commit with the exact `<run-id>-<attempt>`
`plan_id`, the original `reviewed_plan_sha256`, all three deployment
acknowledgements, and `apply_ack=true`. The protected environment reviewer
checks those identifiers against the private approval record. If `main` has
advanced, create and review a new plan.

The workflow downloads only the validated prefix, requires the complete
manifest, checks the original binary digest and expiry, regenerates JSON from
the downloaded binary, and repeats the no-delete check. It initializes the
same backend and runs `terraform apply -input=false -lock-timeout=5m` with that
downloaded filename. It never runs `terraform plan`, `-refresh-only`,
`-target`, variable overrides, or an implicit replan. Terraform state leases
and stale-plan errors therefore stop the run; recover by making a new reviewed
plan. A failed apply can have partially changed Azure resources, so inspect
state and live inventory before the next plan.

## Human bootstrap and recovery

The first state-account and production-resource handoff remains human-operated.
Follow the [bootstrap README human procedure](../../infra/terraform/bootstrap/README.md#foundation-creation-and-state-handoff),
including the temporary local-backend phase, encrypted state backup and hash,
backend restoration in a `finally` path, and the separate
`terraform init -migrate-state` production/bootstrap keys. Do not initialize
the production state key for bootstrap recovery. The canonical README carries
the state migration command because this feature branch deliberately does not
copy the predecessor Terraform root.

Human role assignments, PostgreSQL Entra administrator setup, SQL extension and
grant bootstrap, Key Vault secret provisioning, and temporary exact-IP firewall
cleanup remain outside the workflow. The platform workflow must never acquire
RBAC administration, SQL-admin, provider-registration, storage-key, or SAS
authority.

## Retention and housekeeping

Plans live in the existing production state account's private `terraform-state`
container under the `plans/` prefix. The account's existing service-side
encryption, versioning, and 30-day soft-delete protections also cover these
files. An authorized human may remove expired plan prefixes after checking
version retention and cost; never remove state keys, bootstrap state, export
blobs, or control metadata. A deleted plan can remain recoverable as a protected
version or soft-deleted blob during that retention window.

The PR validation path is credential-free: once the stacked Terraform source is
present, it formats, initializes with `-backend=false -lockfile=readonly`,
validates, and runs the mocked Terraform roots plus the offline bootstrap
fixture. The feature branch intentionally fails with a clear prerequisite
message until that source is stacked; it never silently skips the checks. It
never requests OIDC, logs into Azure, or mutates cloud state.
