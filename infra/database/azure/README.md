# Database maintenance

The API and tools share `backend/src/database/connection-options.ts`. Local
Compose defaults to password authentication without TLS. Azure supplies
`POSTGRES_AUTH_MODE=entra`, `POSTGRES_SSL_MODE=verify-full`, explicit
`POSTGRES_HOST`, `POSTGRES_DB`, the mapped SQL role in `POSTGRES_USER`, and the
executor's UAMI **client ID** in `AZURE_CLIENT_ID`. Do not supply a password in
Entra mode. `POSTGRES_POOL_MAX` accepts 1–5; default 5. Optional
`POSTGRES_SSL_CA_FILE` contains a trusted PEM bundle; otherwise Node's trusted
roots apply. Certificate trust and the configured hostname are both checked.

The asynchronous pg password callback requests a token for every new pool
connection, using only the explicit UAMI. Missing, expired or nearly expired
tokens fail. Initial startup tries five connections, with a five-second
connection limit and one second between failures. Queries have a 30-second
limit. API readiness remains its existing independent database check.
Maintenance connection establishment instead allows up to five minutes for
network timeouts/unreachable sources and verified-TLS pg_hba firewall denials,
using bounded exponential backoff. Each retry reserves its five-second driver
timeout inside that deadline. Invalid passwords, unmapped Entra roles, expired
tokens, certificate errors and other configuration failures stop immediately.

The release tools image exposes:

```sh
node /app/dist/database/maintenance.js migrate
node /app/dist/database/maintenance.js show
# Explicit operator action only:
node /app/dist/database/maintenance.js seed
```

Local compiled equivalents are `npm run migration:run`, `migration:show` and
`seed:initial` from `backend` after `npm run build`. The tools need the tracked
SQL under `/app/infra/init-scripts` and `/app/infra/migrations`. They do not boot
HTTP, run seed implicitly or enable schema synchronization. Maintenance uses
one session advisory lock and the same connection for migrations/seed/show.
Contending runs fail immediately. Jobs have a 540-second application deadline
inside the platform's 600-second limit.

`public.migrations` is the sole TypeORM ledger (`id`, `timestamp`, `name`). The
baseline creates an empty schema, adopts the current init schema without
replaying legacy 001, or upgrades a complete legacy schema through 001. Partial
schemas fail for operator review. The performance-source migration fills only
missing provenance. The grant migration explicitly permits runtime
INSERT/UPDATE on approved tables and sequence USAGE. Baselines have no automatic
down migration; use a reviewed restore/forward migration.

Explicit seed loads tracked fixtures into transaction-local staging tables,
maps foreign keys by slugs/name-version, and inserts missing stable keys only.
It preserves IDs, operator edits, existing performance measurements and
provenance, including NULL-version game engines. Only the migrator receives
database TEMPORARY privilege for staging; this does not grant database CREATE.

## Local verification

Use a dedicated disposable PostgreSQL 16 container, never a shared database:

```sh
docker run -d --name ciri-azure-db-check -p 127.0.0.1:55436:5432 \
  -e POSTGRES_PASSWORD=ciri-test -e POSTGRES_DB=ciri postgres:16-alpine
# Wait until pg_isready succeeds.
docker exec ciri-azure-db-check pg_isready -U postgres
```

From `backend`, build and run the lifecycle/bootstrap suites with
`AZURE_DB_TEST_HOST=127.0.0.1`, `AZURE_DB_TEST_PORT=55436` and
`AZURE_DB_TEST_CONTAINER=ciri-azure-db-check` in the shell environment:

```sh
npm run build
npm run test:e2e -- --cacheDirectory=../node_modules/.cache/jest-azure \
  azure-database.e2e-spec.ts bootstrap-postgres.e2e-spec.ts
```

The bootstrap suite installs deliberately named local `pgaadauth` stubs solely
to check PostgreSQL SQL control flow/ACLs. It does **not** verify Azure identity
mapping. It rejects missing inputs, conflicting IDs and elevated roles, and
checks global/schema default-ACL drift, real runtime/export denials and migration
execution under the schema-only migrator. The lifecycle suite creates and drops
its own databases, verifies one-connection operation/concurrent rejection,
fresh/legacy adoption, repeated seed, and a custom-format pg_dump/pg_restore
round trip including indexes, sequence state and the ledger.

For TLS tests, create a disposable localhost certificate with OpenSSL, copy its
certificate/key into `/tmp/pg-test.crt` and `/tmp/pg-test.key` in the same test
container, set their owner to `postgres` and key mode to 0600. Set PostgreSQL
`ssl=on`, `ssl_cert_file` and `ssl_key_file` with ALTER SYSTEM, then reload.
Example certificate generation from `backend`:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost' -keyout /tmp/pg-test.key \
  -out /tmp/pg-test.crt
```

Set `AZURE_DB_TEST_CA` to the absolute local certificate path and run
`database-tls.e2e-spec.ts`. It verifies trusted TLS, rejection of untrusted CA
and wrong hostname, actual TypeORM/pg pool reconnect callbacks, rejection of
expired credentials, and prompt termination on failed authentication. Its token
provider seam returns the local test password; it does not acquire an Azure
token. Remove the disposable container/certificate/key after verification.

Actual Flexible Server `pgaadauth`, UAMI token acquisition, Azure TLS chain,
firewall/RBAC, executor connectivity, denied SQL under real runtime/exporter
tokens and reconnect after a real token expires remain Azure acceptance gates.
