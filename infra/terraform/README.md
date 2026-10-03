# Azure Terraform handoff

The approved production design is documented in:
- [Architecture](../../docs/architecture/azure-production.md)
- [Terraform and CI/CD implementation contract](../../docs/architecture/azure-terraform-handoff.md)
- [Database identities, migrations and portable exports](../../docs/operations/azure-database.md)

These documents specify the implementation target. Current Terraform is app-only
and does not yet implement the complete platform. In particular, its min=1,
inline secret values and low-replica alert are not the approved production defaults.

Implement the handoff before applying this root as the new platform. Inspect the
actual branch, existing resource ownership and remote state first. Do not apply
old app-only examples as a complete Azure deployment. Never commit state, plans,
tfvars, infra/.env, deployment tokens or provider keys.

Initial target: SWA Free, default-network Container Apps Consumption (min0/max1),
public-firewalled PostgreSQL 16 B1ms/32 GiB, native Key Vault references and Entra
user-assigned identities. No customer VNet or separately provisioned load balancer.
