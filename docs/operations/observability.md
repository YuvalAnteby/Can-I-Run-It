# Observability

Azure production defines dedicated workspace-based Application Insights and Log
Analytics,30-day retention and0.1GB/day caps, with SDK trace sampling10%. This is
implemented locally; actual ingestion, redaction, cold-starts and billing remain
[Azure acceptance gates](azure-acceptance.md). There are no paid metric/log alert
rules by default; intentional replica0 must not raise a low-replica alert.
The backend is quiet and local by default. `TELEMETRY_ENABLED=false` keeps Azure
Monitor exporting disabled, while Nest logs remain readable in development. The
default `LOG_LEVEL=info` records structured startup, request, stage, provider,
quota, and persistence events without request bodies, provider payloads, SQL,
credentials, cookies, authorization headers, IP addresses, or raw URLs.

Every request receives an `X-Request-ID` response header. A caller supplied ID is
accepted only when it is one to 64 ASCII letters, digits, dots, underscores, or
hyphens; unsafe or repeated-line values are replaced with a UUID. The ID is
available in the backend log envelope and trace attributes, and is safe to echo
to a support operator. It does not affect authorization or quota identity.

## Terraform ownership and routing

The production root owns the default-network Consumption environment, dedicated
`PerGB2018` workspace and workspace-based Application Insights. Workspace ARM metadata
is managed without listing shared keys, local authentication is disabled, and Insights
server sampling100% avoids sampling already sampled SDK traces twice. Terraform sets
`TELEMETRY_ENABLED=true`, `LOG_LEVEL=info`, `OTEL_SERVICE_NAME=ciri-backend` and
`OTEL_TRACES_SAMPLER_ARG=0.1`. Generated Insights connection metadata is an API secret
reference; provider keys stay in native Key Vault references outside Terraform values.

The environment sends console/system logs to Azure Monitor through exactly one
Terraform diagnostic setting to the dedicated workspace. No AllMetrics or ingress
HTTP diagnostic logs are exported. Before import, reconcile existing environment,
workspace, Insights and diagnostic ownership; do not duplicate another owner's routes.
Use the [Terraform bootstrap/import runbook](../../infra/terraform/README.md) and the
protected reviewed-plan workflow. Local Compose keeps telemetry disabled by default.
## What is collected

The SDK initializes before Nest, PostgreSQL, or provider modules load. It traces
inbound HTTP and PostgreSQL calls, excludes the three successful health probes,
and requires a parent span for PostgreSQL so an excluded probe cannot create a
root database span. Outbound HTTP auto-instrumentation is disabled because the
RAWG key is embedded in its request URL; the application creates safe named
`gemini` and `rawg` client spans only after provider admission. SQL text,
parameters, URLs, headers, exception events, and status messages are removed by
the export processor.

Trace sampling defaults to 10%. Logs are written once to Container Apps stdout;
the OpenTelemetry console, Bunyan, and Winston log instrumentations are disabled.
Live Metrics, performance counters, offline retry files, and automatic HTTP
instrumentation metrics are disabled. PostgreSQL instrumentation remains enabled
with enhanced reporting off and a parent span required, so its bounded
configuration-derived metrics may remain. Unsampled traces may have no Application Insights
trace row, while their unsampled stdout completion record still contains the
request ID. Azure ingestion or exporter outages do not make the API unavailable.

Successful liveness, readiness, and PostgreSQL probes are suppressed from
completion logs, metrics, and inbound spans. A failed probe is retained for
operations. Normal provider availability is independent of liveness: missing or
failed Gemini/RAWG calls return the existing fallback behavior, while liveness
checks only whether the Nest process is serving.

Check requests emit bounded stages for input loading, performance lookup,
Gemini, fallback, and cache persistence. RAWG emits search, detail, and game
persistence stages. A database hit therefore has no provider call; a Gemini
timeout has one provider call and one timeout event; an unconfigured or
quota-skipped fallback has no provider call, while a fallback after an admitted
Gemini failure or timeout still has that one provider call; and a swallowed
persistence failure is recorded with only its error type.
Existing abuse event accounting supplies provider failure, timeout, budget,
concurrency, and rate-limit metrics exactly once.

## Alerts and cost limits

No paid alert rules, action groups or low-replica alerts are created by default.
Use budget emails, native metrics and operator queries. Enabling an alert later
requires a reviewed real regional evaluation/notification price and budget allowance.
Native Requests, Replicas, RestartCount, CPU and memory metrics remain available.
A quiet demo intentionally reaches replica0. Monitor crash/backoff, readiness failure,
request errors, cold-start latency and unexpected jobs using bounded queries first.
Retention and daily caps are ingestion controls, not hard monthly spending
limits. A 0.1 GB/day setting is roughly 3 GB/month before Azure cap overshoot;
cap enforcement can lag and create telemetry gaps. Regional ingestion, alert
evaluation, and shared-environment volume affect cost, and no universal dollar
total or free student entitlement should be assumed. See [Azure Monitor pricing](https://azure.microsoft.com/pricing/details/monitor/)
and [daily cap limitations](https://learn.microsoft.com/azure/azure-monitor/logs/daily-cap).
Use the workspace usage view to check actual ingestion:

```kusto
Usage
| where TimeGenerated > ago(30d)
| summarize IngestedGB = sum(Quantity) / 1024 by DataType
| order by IngestedGB desc
```

## Correlating one request

For request ID `request-123`, this query extracts the unsampled completion JSON
from the native Container Apps console table. It uses the backend's template
route, so query strings and raw URLs are never needed:

```kusto
let rid = "request-123";
ContainerAppConsoleLogs
| where TimeGenerated > ago(1h)
| where ContainerAppName == "ciri-backend"
| extend Payload = parse_json(Log)
| where tostring(Payload.requestId) == rid
| project TimeGenerated,
          RequestId = tostring(Payload.requestId),
          TraceId = tostring(Payload.traceId),
          Event = tostring(Payload.event),
          Route = tostring(Payload.route),
          StatusCode = toint(Payload.statusCode),
          DurationMs = todouble(Payload.durationMs)
| order by TimeGenerated asc
```

Join the resulting `TraceId` to Application Insights request/dependency
operation IDs when the 10% trace sample retained that span:

```kusto
let traceId = "<trace-id-from-the-console-query>";
union isfuzzy=true
(
  AppRequests
  | where TimeGenerated > ago(1h)
  | where OperationId == traceId
  | project TimeGenerated, Kind = "request", Name, OperationId, Success, ResultCode
),
(
  AppDependencies
  | where TimeGenerated > ago(1h)
  | where OperationId == traceId
  | project TimeGenerated, Kind = "dependency", Name, OperationId, Success, ResultCode
)
| order by TimeGenerated asc
```

Existing direct Log Analytics destinations may expose the same records as
`ContainerAppConsoleLogs_CL` with columns such as `TimeGenerated`,
`ContainerAppName_s`, and `Log_s`. Use this equivalent extraction when the
native table is absent:

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where ContainerAppName_s == "ciri-backend"
| extend Payload = parse_json(Log_s)
| where tostring(Payload.requestId) == "request-123"
| project TimeGenerated, Payload
| order by TimeGenerated asc
```

RAWG appears only inside the request trace that admitted its provider call; it
is not a global metric dimension and does not create outbound HTTP spans. Data
and alert rows can arrive several minutes after the request.

## Verification and live evidence

Run the three Terraform schema/mock-test roots and contract tests as described in
[Terraform](../../infra/terraform/README.md). Review the protected actual plan and
resource/state ownership before applying. Local mocks do not establish ingestion or
price/free eligibility. State and private plan files remain protected even though
provider keys and deployment tokens are excluded from Terraform reads/inputs.

After a reviewed deployment, record the actual resource IDs, sole console/system
route, workspace retention/cap and SDK10% sampling. Exercise measured, provider
fallback, quota/timeout, failed persistence and outage paths with controlled requests;
verify X-Request-ID correlation and no bodies, URLs, SQL, credentials, client-IP or
provider payloads in any exported event. Successful health probes should produce no
completion/span volume. Check for duplicate console export, AllMetrics, Live Metrics
and offline files. Confirm Jobs are finite and normal maintenance does not wake API.

Measure idle-to-zero and repeated true cold starts: retain each sample, median and
p95, min0/max1 settings, latest-ready revision and no old public revision labels.
Observe usage/cost for24–48h and again over a billing interval. Reconcile every meter
and subscription-shared grant/expiry against the dated worksheet and student credit
balance. Caps/alerts can lag and cannot guarantee a one-year budget.
