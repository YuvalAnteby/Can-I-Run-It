# Azure production runbook

Production runs on an Azure for Students subscription in `polandcentral`,
fully described by Terraform in `infra/terraform/`. The frontend is hosted for
free on Cloudflare Pages at <https://can-i-run-it.pages.dev>. Pushes to `main`
deploy the API image (GitHub Actions) and the frontend (Cloudflare's Git
integration) automatically; infrastructure changes are applied
from an operator machine with `terraform apply`. Target spend is about
$1/month with an $8/month budget alert. The design and its decisions are in
[the lean Azure infrastructure spec](../superpowers/specs/2026-10-15-azure-lean-infra-design.md).

| Resource | Name |
|---|---|
| Resource group | `rg-ciri-prod` |
| API Container App (scale 0–1) | `ca-ciri-api` in environment `cae-ciri-prod` |
| PostgreSQL Flexible Server (B1ms, PG16, private) | `psql-ciri-prod-<suffix>`, database `ciri` |
| Frontend (outside Azure) | Cloudflare Pages project `can-i-run-it` |
| Key Vault | `kv-ciri-<suffix>` |
| Identities | `id-ciri-api` (API runtime), `id-ciri-deploy` (GitHub Actions) |
| Terraform state | resource group `rg-ciri-tfstate`, container `tfstate` |

The database schema and seed data are applied automatically by the API's
baseline migration on first start; there is no manual SQL step. Later schema
changes ship as new TypeORM migrations with the API image.

There is no database password: the API signs in to PostgreSQL with an Entra
token for `id-ciri-api`, and the operator is the second Entra administrator.

## Prerequisites

- Azure CLI, Terraform `>= 1.9`, GitHub CLI (`gh`), PowerShell.
- `az login`, then select the Azure for Students subscription:
  `az account set --subscription "<subscription-id>"`.
- Resource providers registered once per subscription (done 2026-10-15):

  ```powershell
  foreach ($ns in 'Microsoft.App','Microsoft.OperationalInsights','Microsoft.Insights',
                  'Microsoft.DBforPostgreSQL','Microsoft.KeyVault','Microsoft.Storage',
                  'Microsoft.Network','Microsoft.ManagedIdentity','Microsoft.Consumption') {
    az provider register --namespace $ns
  }
  ```

## Bootstrap the state backend (once)

Run `infra/terraform/bootstrap.ps1` with a globally unique storage account name
for the state (3–24 lowercase letters and digits). `Get-Help
infra/terraform/bootstrap.ps1 -Detailed` lists its parameters. It is idempotent
and creates `rg-ciri-tfstate`, the Entra-only state account with versioning and
soft delete, the `tfstate` container, and your `Storage Blob Data Contributor`
role assignment, then prints the backend values.

Copy `infra/terraform/backend.hcl.example` to `backend.hcl` and paste the printed
values. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill it:

- `api_image`: the first published image (see the next section).
- `gemini_api_key`, `rawg_api_key`: provider keys (stored in Key Vault).
- `operator_object_id`, `operator_upn`: from
  `az ad signed-in-user show --query "{id:id, upn:userPrincipalName}"`.
- `alert_email`: where budget and 5xx alerts go.

Both files are gitignored. `terraform.tfvars` and the state contain secrets;
never commit or share them.

## First deploy, in order

`terraform apply` needs an existing API image, and the release workflow needs
Terraform's outputs, so the first deploy is a short loop:

1. **Merge to `main`.** The `CD - Production Release` workflow runs checks,
   builds, scans and pushes `ghcr.io/yuvalanteby/can-i-run-it-backend:sha-<commit>`.
   The two deploy jobs are skipped because `AZURE_CLIENT_ID` is not set yet.
2. **Make the GHCR package public.** On GitHub: your profile → Packages →
   `can-i-run-it-backend` → Package settings → Change visibility → Public. The
   Container App pulls it anonymously.
3. **Apply Terraform** with that image in `terraform.tfvars`
   (`api_image = "ghcr.io/yuvalanteby/can-i-run-it-backend:sha-<full-commit>"`):

   ```powershell
   cd infra/terraform
   # Quoted: Windows PowerShell splits an unquoted -backend-config=backend.hcl at the dot.
   terraform init "-backend-config=backend.hcl"
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

   The first API start runs the baseline migration; allow a few minutes.
4. **Create the GitHub `production` environment.** Repository → Settings →
   Environments → New environment → `production`. Under Deployment branches and
   tags choose Selected branches and add `main`. The deploy identity only trusts
   tokens for this environment (`repo:YuvalAnteby/Can-I-Run-It:environment:production`),
   so the branch rule means only `main` can deploy. Do not add required
   reviewers unless you want to approve every release by hand.
5. **Create the repository variables** from the Terraform outputs. They must be
   repository variables (Settings → Secrets and variables → Actions →
   Variables → Repository), not environment variables: the deploy jobs are
   skipped by a job-level `if` that cannot read environment variables. None of
   them is secret.

   ```powershell
   cd infra/terraform
   gh variable set AZURE_CLIENT_ID                --body (terraform output -raw deploy_client_id)
   gh variable set AZURE_TENANT_ID                --body (terraform output -raw tenant_id)
   gh variable set AZURE_SUBSCRIPTION_ID          --body (terraform output -raw subscription_id)
   gh variable set AZURE_RESOURCE_GROUP           --body (terraform output -raw resource_group_name)
   gh variable set AZURE_API_APP_NAME             --body (terraform output -raw api_container_app_name)
   gh variable set API_URL                        --body (terraform output -raw api_url)
   ```

6. **Run the release.** Actions → `CD - Production Release` → Run workflow on
   `main` (or `gh workflow run backend-cd-prod.yml --ref main`). This time
   `deploy-api` runs.
7. **Connect Cloudflare Pages** (see [Frontend on Cloudflare Pages](#frontend-on-cloudflare-pages)).
8. Work through the acceptance checklist below.

## Frontend on Cloudflare Pages

The SPA is built and hosted by Cloudflare Pages' Git integration, so GitHub
Actions holds no Cloudflare credentials. Set up once in the Cloudflare
dashboard: Workers & Pages → Create → Pages → Connect to Git →
`YuvalAnteby/Can-I-Run-It`, with:

| Setting | Value |
|---|---|
| Project name | `can-i-run-it` (gives `can-i-run-it.pages.dev`) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |
| Variable `VITE_API_URL` | `<terraform output -raw api_url>/api` |
| Variable `NODE_VERSION` | `24` |

Then Settings → Builds → Branch control: disable preview deployments (previews
would call the production API from an origin that CORS rejects).

The API allows CORS only from `frontend_url` (default
`https://can-i-run-it.pages.dev`). If the Pages URL ever changes, set
`frontend_url` in `terraform.tfvars` and `terraform apply`. If the API URL
changes, update `VITE_API_URL` in Cloudflare and retry the latest deployment.

Pages serves `index.html` for unknown paths with status 200, so deep links such
as `/games/<slug>` work and preview correctly when shared.

## Routine releases

Every push to `main` runs `CD - Production Release`:

1. Backend and frontend CI, then build, Trivy scan and push of the API image
   tagged `latest` and `sha-<commit>`.
2. `deploy-api`: OIDC login as `id-ciri-deploy`, `az containerapp update` with the
   image **digest** just pushed, then up to 5 minutes waiting until the new
   revision is the latest ready revision and `${API_URL}/api/health/ready`
   returns 200 (covers scale-from-zero and migrations).

In parallel, Cloudflare Pages builds and publishes the frontend from the same
`main` commit.

To roll back, re-run the workflow for an older `main` commit, or run
`az containerapp update -g rg-ciri-prod -n ca-ciri-api --image <older image digest>`.
Terraform ignores the image after creation, so `terraform apply` never reverts a
release. Change infrastructure only with `terraform plan`/`apply`; the deploy
identity can update `ca-ciri-api` and nothing else. Roll the frontend back from
the Cloudflare dashboard (Deployments → an older deployment → Rollback).

## Acceptance checklist

Run from `infra/terraform` after the first release and after infrastructure
changes.

```powershell
$api = terraform output -raw api_url
$web = (terraform output -raw frontend_url).TrimEnd('/')
$pg  = terraform output -raw postgres_fqdn
```

- [ ] **API ready.** `curl.exe -fsS "$api/api/health/ready"` returns
  `{"status":"ok"}`. The first call after idle can take tens of seconds (scale
  from zero).
- [ ] **Postgres is private.** `Resolve-DnsName $pg` from your machine returns
  no public address (at most a CNAME into
  `ciri-prod.private.postgres.database.azure.com`, which only resolves inside
  the VNet), and
  `az postgres flexible-server show -g rg-ciri-prod -n <server> --query network.publicNetworkAccess`
  returns `Disabled`. Inside the VNet the name resolves to `10.20.1.x`: run
  `nslookup $PGHOST` with the ad-hoc job below.
- [ ] **API egress works.** Search the frontend for a game that is not in the
  catalog: RAWG results appear. Run a check that has no measured record: the
  result is labelled as a Gemini estimate rather than the fallback. Container
  App console logs show `rawg` and `gemini` stages without `failure` or
  `timeout`.
- [ ] **Frontend and deep links.** `$web/`, `$web/about` and
  `$web/games/<slug>` return 200 and the app renders and loads data from the API.
- [ ] **CORS allows only the frontend.**
  `curl.exe -si -H "Origin: $web" "$api/api/health/live"` includes
  `Access-Control-Allow-Origin: <frontend origin>`;
  `curl.exe -si -H "Origin: https://example.com" "$api/api/health/live"` has no
  `Access-Control-Allow-Origin` header.
- [ ] **Budget and alerts exist.**
  `az consumption budget list -g rg-ciri-prod -o table` shows the $8 budget;
  `az monitor metrics alert list -g rg-ciri-prod -o table` shows the API 5xx
  alert; `az monitor action-group list -g rg-ciri-prod -o table` shows the
  email action group.

## Ad-hoc database access

PostgreSQL has no public endpoint. For a one-off query, run a temporary
Container Apps job in the same environment, signed in with your own Entra token
(you are an Entra administrator). The token lasts about an hour and is stored
as a job secret, so delete the job afterwards.

```powershell
$rg  = 'rg-ciri-prod'
$pg  = terraform output -raw postgres_fqdn
$upn = az ad signed-in-user show --query userPrincipalName -o tsv
$token = az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv

az containerapp job create -g $rg -n job-ciri-psql --environment cae-ciri-prod `
  --trigger-type Manual --replica-timeout 900 --replica-retry-limit 0 `
  --image postgres:16-alpine --cpu 0.25 --memory 0.5Gi `
  --secrets "pg-token=$token" `
  --env-vars "PGHOST=$pg" "PGUSER=$upn" PGDATABASE=ciri PGSSLMODE=require PGPASSWORD=secretref:pg-token `
  --command sh --args "-c" "nslookup `$PGHOST; psql -c 'select count(*) from games;'"

az containerapp job start -g $rg -n job-ciri-psql
az containerapp job execution list -g $rg -n job-ciri-psql -o table
az containerapp job logs show -g $rg -n job-ciri-psql --container job-ciri-psql
az containerapp job delete -g $rg -n job-ciri-psql --yes
```

To change the query, `az containerapp job update ... --args "-c" "<new command>"`
and start the job again (refresh the token secret with
`az containerapp job secret set` if it has expired). Console output also
reaches Log Analytics after a few minutes (`ContainerAppConsoleLogs`).

## Backup before the credits end

Automated backups (7 days) live inside the server and disappear with it. Before
the subscription's credits or free services end, take a `pg_dump` and keep it
outside Azure. The job uploads the dump into a private `backups` container in
the state account, using your own Entra storage token (you have `Storage Blob
Data Contributor` there from the bootstrap). `$pg` and `$upn` are set as in the
previous section; both tokens last about an hour, which is plenty for this
database:

```powershell
$state = '<state storage account>'
$blob  = "ciri-$(Get-Date -Format yyyyMMdd).dump"
az storage container create --account-name $state -n backups --auth-mode login
$token        = az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv
$storageToken = az account get-access-token --resource https://storage.azure.com/ --query accessToken -o tsv

az containerapp job create -g rg-ciri-prod -n job-ciri-dump --environment cae-ciri-prod `
  --trigger-type Manual --replica-timeout 1800 --replica-retry-limit 0 `
  --image postgres:16-alpine --cpu 0.5 --memory 1Gi `
  --secrets "pg-token=$token" "storage-token=$storageToken" `
  --env-vars "PGHOST=$pg" "PGUSER=$upn" PGDATABASE=ciri PGSSLMODE=require `
    PGPASSWORD=secretref:pg-token STORAGE_TOKEN=secretref:storage-token `
    "DUMP_URL=https://$state.blob.core.windows.net/backups/$blob" `
  --command sh --args "-c" "set -e; apk add --no-cache curl >/dev/null; pg_dump -Fc --no-owner -f /tmp/ciri.dump; curl -fsS -X PUT -H 'x-ms-version: 2021-08-06' -H 'x-ms-blob-type: BlockBlob' --oauth2-bearer `$STORAGE_TOKEN --data-binary @/tmp/ciri.dump `$DUMP_URL"

az containerapp job start -g rg-ciri-prod -n job-ciri-dump
# wait for the execution to succeed, then:
az storage blob download --account-name $state -c backups -n $blob -f $blob --auth-mode login
az containerapp job delete -g rg-ciri-prod -n job-ciri-dump --yes
```

Restore into any PostgreSQL 16 with the `pg_trgm` extension using
`pg_restore --no-owner -d <database> <file>`.

## Teardown

```powershell
cd infra/terraform
terraform destroy
```

Key Vault is soft-deleted for 7 days and keeps its name reserved; purge
protection is off, so `az keyvault purge --name kv-ciri-<suffix>` frees it
immediately if you need to re-create it. Remove the GitHub repository variables
(or just `AZURE_CLIENT_ID`) so releases skip the deploy jobs again. Delete
`rg-ciri-tfstate` last, only when the state is no longer needed:
`az group delete -n rg-ciri-tfstate`.

## Cost guardrails

Do not add a NAT gateway, Front Door, private endpoints, dedicated workload
profiles or log-based alerts; each costs more than the whole demo. The API
(0.25 vCPU / 0.5 GiB) keeps one warm replica 07:30–23:00 Israel time via the
`warm-hours` cron scale rule in `app.tf` and scales to zero outside it, about
$2–3/month at idle billing. Keep `api_min_replicas = 0`; an always-on replica
costs roughly twice as much. The
[observability runbook](observability.md) covers telemetry volume and the
Log Analytics daily cap.
