# Azure PostgreSQL firewall reconciliation

**node dist/maintenance/firewall.js** is the single firewall reconciliation
entrypoint for the scheduled control Job and trusted release execution. It
requires these inputs:

- **FIREWALL_SOURCE_RESOURCE_IDS**: a JSON array containing the exact API,
  migration Job, and export Job resource IDs.
- **POSTGRES_SERVER_RESOURCE_ID**: the exact Flexible Server resource ID.
- **AZURE_STORAGE_ACCOUNT** and **AZURE_CONTROL_CONTAINER**: the private control
  metadata destination.
- **AZURE_CLIENT_ID**: the attached control user assigned managed identity
  client ID.

The routine reads each Container App and Job **properties.outboundIpAddresses**
independently. Container Apps Jobs use ARM REST API version **2026-07-01**.
Every discovery must contain public, individual IPv4 addresses before any
firewall mutation is attempted. Empty, malformed, private, reserved, range,
zero, and oversized results fail closed and retain the current rules.

Automatic rules use the **ciri-auto-** prefix and exact start/end addresses.
Separately named operator rules are left untouched. New automatic rules are
written before replaced addresses are retired. Retirement metadata and the
reconciliation lease both use the **firewall/state.json** metadata blob in the
control container. Replaced rules remain for one
hour and a later successful discovery; failed deletions remain recorded and
are retried on the next run. The control lease lasts 60 seconds while the
reconciliation deadline is 45 seconds.

Exit status is zero only when discovery and all required reconciliation work
complete without a deletion failure. Azure subscription inventory, scoped
managed identity permissions, firewall propagation, and denied-source
connectivity remain deployment acceptance checks.
