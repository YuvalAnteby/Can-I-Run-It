# Azure delivery review

Reviewed against staging baseline `4ef01411a987c4c9d9d8a73ced7124a5683524c9`.
The original supplied documents were installed and their patch checked on2026-10-03.
The user subsequently clarified that `CODEX-PROMPT.md` requires full implementation;
the branch now contains that locally verifiable implementation, not a docs-only handoff.

The complete scope covers Terraform, protected OIDC workflows, native Key Vault
references, Entra PostgreSQL connections, migrations/seed, finite maintenance Jobs,
exact-IP firewall reconciliation and verified portable exports. Local Compose stays
password-based. Issue82's admin HTTP endpoints/environment examples are excluded.

The two bootstrap defects found in the original delivery are resolved: rejected
inputs now fail under PostgreSQL16 ON_ERROR_STOP, and reruns reconcile global/schema
runtime/exporter/PUBLIC defaults before restoring the approved grants. Real isolated
PostgreSQL tests cover these regressions, future objects and denied SQL operations.
Azure pgaadauth mapping is still unobserved; local mapping stubs are clearly identified.

Independent review also identified and corrected secret-listing provider reads,
short migration Job waits, missing live traffic checks, incomplete application smoke,
new integration suites skipped by ordinary CI, and the manual export caller's missing
Blob permissions. Metadata-only AzAPI resources, scoped Job execution, actual PG16
CI coverage and protected manual operations address those findings.

See the [acceptance record](../operations/azure-acceptance.md) for commands/results and
exact remaining integration evidence. A genuinely generated mocked Terraform plan
passes the production guard; no actual account plan, inventory/import, entitlement,
regional cost, Azure SQL/identity/network test or deployment has been observed. A mock
plan is not approval to provision. The draft PR remains for user review before deployment.
