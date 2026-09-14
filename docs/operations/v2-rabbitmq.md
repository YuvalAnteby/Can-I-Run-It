# RabbitMQ foundation

RabbitMQ is the broker foundation for the v2 feature queues. Feature modules
own their queues, bindings, payloads, retries, dead letters, and acknowledgements;
this service only provides a reconnecting connection manager and confirm-channel
factory.

## Images and networks

The Compose files use the multi-architecture RabbitMQ 4.3.5 Alpine release,
pinned by tag and manifest digest:

- Dev: `rabbitmq:4.3.5-management-alpine@sha256:b3b8b7f95f5382a19f9ea33540e604f30aad081d37ad9aba72255135765373a1`
- Production and tests: `rabbitmq:4.3.5-alpine@sha256:3486d98205df3d6395ed70e7924baa13b561cbac54116c0ddae5b0b7382bbabd`

The selected manifests support the deployment architectures used by the
official image. Recheck the release and digest together when upgrading.

The backend connects to `rabbitmq:5672` over the existing Compose network.
Dev exposes only the management UI at `127.0.0.1:15672` by default; AMQP is
not published. Production publishes neither AMQP nor management ports. Tests
use a separate `ciri-net-tests` network and an in-memory broker data directory.

## Environment

Set these values in `infra/.env` for dev and production:

```dotenv
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_DEFAULT_USER=ciri-broker
RABBITMQ_DEFAULT_PASS=replace-with-a-strong-password
RABBITMQ_URL=amqp://ciri-broker:replace-with-a-strong-password@rabbitmq:5672
```

`RABBITMQ_URL` must use `amqp:` or `amqps:`, include a hostname, and include
nonempty credentials. Its decoded username and password must match
`RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`. Percent-encode URL
credentials when they contain URL-reserved characters.

The backend starts its HTTP server even when the broker is unavailable. The
connection manager retries every five seconds with a five-second heartbeat
and a bounded five-second connection timeout. `/api/health/rabbitmq` reports
the current connection only; it does not prove that a feature queue exists or
that a publication will succeed.

## Persistent volume and credential rotation

Changing `RABBITMQ_DEFAULT_USER` or `RABBITMQ_DEFAULT_PASS` does not rotate
credentials on an already initialized RabbitMQ volume. Do not delete the
volume to fix credentials.

For a user rotation in the dev stack, add the replacement user and grant it
the same permissions before changing the application URL:

```sh
docker compose --env-file infra/.env -f infra/docker-compose.yml exec rabbitmq \
  rabbitmqctl add_user <new-user> <new-password>
docker compose --env-file infra/.env -f infra/docker-compose.yml exec rabbitmq \
  rabbitmqctl set_permissions -p / <new-user> ".*" ".*" ".*"
```

Then update `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`, and the encoded
credentials in `RABBITMQ_URL`, recreate the backend, and verify
`/api/health/rabbitmq` is up. After all clients have moved, remove the old
user:

```sh
docker compose --env-file infra/.env -f infra/docker-compose.yml exec rabbitmq \
  rabbitmqctl delete_user <old-user>
```

For a password-only rotation, use `rabbitmqctl change_password <user>
<new-password>` inside the running broker, then update the URL and recreate the
backend. Keep the volume.

## Compose validation

These commands validate interpolation without printing the resolved secrets:

```sh
docker compose --env-file infra/.env.example \
  -f infra/docker-compose.yml config --quiet

env BACKEND_PORT=4000 REACT_PORT=3000 POSTGRES_PORT=5432 \
  POSTGRES_USER=produser POSTGRES_PASSWORD=prodpass POSTGRES_DB=prod_db \
  RABBITMQ_DEFAULT_USER=prod-broker RABBITMQ_DEFAULT_PASS=prodpass \
  RABBITMQ_URL=amqp://prod-broker:prodpass@rabbitmq:5672 \
  VITE_API_URL=https://backend.example/api \
  docker compose --env-file infra/.env.example \
  -f infra/docker-compose.prod.yml config --quiet
```

## Disposable broker smoke and restart probe

Run the foundation E2E checks only against the isolated test stack. The
backend container uses the service name `rabbitmq`; it does not need a host
AMQP port or a Docker socket:

```sh
docker compose -f infra/docker-compose.tests.yml up --build -d postgres rabbitmq
docker compose -f infra/docker-compose.tests.yml run --rm backend \
  npm run test:e2e -- --runInBand rabbitmq
```

For the restart probe, start the probe in one terminal. It prints a ready
marker after confirming a durable message with publisher confirms:

```sh
docker compose -f infra/docker-compose.tests.yml run --rm backend \
  npx ts-node test/rabbitmq-restart.integration.ts
```

While it waits for the marker, restart only the disposable test broker from a
second terminal:

```sh
docker compose -f infra/docker-compose.tests.yml restart rabbitmq
```

The probe has a 60-second deadline, waits for an observed disconnect and
reconnect, then reads and acknowledges the message. During the restart,
`/api/health/rabbitmq` should be 503 while PostgreSQL health and local catalog
requests remain available; after reconnect it should return 200 and the
channel setup should have recreated the test queue. Tear down only the
disposable stack after the probe:

```sh
docker compose -f infra/docker-compose.tests.yml down -v --remove-orphans
```

Persistent messages, durable queues, and publisher confirms are required
together. A future producer must persist its PostgreSQL job before sending,
retain it until confirmation, and safely retry uncertain deliveries. A future
consumer must acknowledge only after its database commit and tolerate duplicate
messages; this foundation does not claim exactly-once delivery.
