# Observability

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

## Opt in from Terraform

The Terraform module manages the existing Container App and references the
externally managed Container Apps environment. Monitoring resources are created
only when `observability_enabled` is true. A complete starting `release.tfvars`
looks like this (keep it ignored and out of source control):

```hcl
container_app_name           = "ciri-backend"
resource_group_name          = "<existing-resource-group>"
container_app_environment_id = "/subscriptions/<subscription>/resourceGroups/<resource-group>/providers/Microsoft.App/managedEnvironments/<environment>"
backend_image                = "ghcr.io/yuvalanteby/can-i-run-it-backend:sha-<full-commit>"

observability_enabled       = true
observability_location      = "<same-region-as-the-existing-app>"
observability_daily_cap_gb  = 0.1
observability_retention_days = 30
observability_sampling_ratio = 0.1
observability_action_group_ids = []
```

The module creates a dedicated `PerGB2018` Log Analytics workspace and a
workspace-based Application Insights resource, each with 30-day retention and a
0.1 GB/day cap. The backend receives `TELEMETRY_ENABLED=true`, `LOG_LEVEL=info`,
`OTEL_SERVICE_NAME=ciri-backend`,
`OTEL_TRACES_SAMPLER=microsoft.fixed_percentage`, and the configured sampler
ratio. The Application Insights connection string is stored as a Container App
secret and is never a frontend variable or a plain environment value. Existing
action group IDs are optional; an empty list leaves the rules visible in Azure
without sending external notifications.

Apply this module only through the existing state workflow after importing or
confirming ownership of the existing app. Do not create a second Container Apps
environment or import an environment already managed elsewhere.

## Existing Container Apps log destination

The externally managed environment must send Container Apps logs to Azure
Monitor before the optional diagnostic setting can be useful. Inspect the
environment first:

```sh
az containerapp env show -g <resource-group> -n <environment> \
  --query "properties.appLogsConfiguration"
az containerapp env update -g <resource-group> -n <environment> \
  --logs-destination azure-monitor
```

The update is an operator action outside this module. Check for existing
diagnostic settings before adding the Terraform-owned setting, and remove only a
duplicate setting owned by the same operator after reviewing its consumers.
Environment-level routing sends `ContainerAppConsoleLogs` and
`ContainerAppSystemLogs` for every app in that environment to the workspace;
the 0.1 GB/day cap is therefore shared by those apps. The module deliberately
does not export `AllMetrics` or ingress HTTP logs to Log Analytics. Azure keeps
the native Container Apps `Requests`, `Replicas`, `RestartCount`, CPU, and memory
metrics separately.

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

The optional rules are intentionally small in number. They alert on fewer than
one replica for five minutes, at least five non-health 5xx completions and a
20% error rate across two five-minute buckets, or at least three platform
unhealthy/crash/backoff events across two buckets, or failed readiness completions
across two buckets. There is no
traffic or inactivity alert, so a quiet demo does not page. Platform reason
strings can vary; after deployment, inspect `ContainerAppSystemLogs` and adjust
the documented query only after confirming the actual `Reason` and `Log` values.

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

## Verification

Run the Terraform checks before an authorized deployment:

```sh
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform test
terraform -chdir=infra/terraform plan -var-file=release.tfvars
```

Review the plan in both modes. Disabled mode must create no monitoring resources
and must preserve the existing Container App runtime maps. Enabled mode must
show only the dedicated workspace, Application Insights, one environment
diagnostic setting, and three app-scoped alert rules, plus the generated runtime
secret and settings. Keep Terraform state encrypted and access-controlled;
state, plan files, tfvars, and connection strings are sensitive.
