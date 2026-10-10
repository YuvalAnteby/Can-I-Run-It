import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MANAGEMENT_ENDPOINT =
  process.env.AZURE_MANAGEMENT_ENDPOINT ?? "https://management.azure.com";
const API_VERSION = process.env.AZURE_CONTAINER_APP_JOB_API_VERSION ?? "2026-07-01";
const REQUEST_TIMEOUT_MS = 15_000;
const RUNNING_STATES = new Set([
  "",
  "Accepted",
  "InProgress",
  "Pending",
  "Queued",
  "Running",
  "Processing",
  "Starting",
]);

function assertResourceId(resourceId) {
  if (
    !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.App\/jobs\/[^/]+$/i.test(
      resourceId,
    )
  ) {
    throw new Error(`invalid Container Apps Job resource ID: ${resourceId}`);
  }
}

function assertDigest(toolsImageDigest) {
  if (toolsImageDigest && !/^ghcr\.io\/[^@]+@sha256:[a-f0-9]{64}$/i.test(toolsImageDigest)) {
    throw new Error("tools image must be an immutable public GHCR digest");
  }
}

function endpoint(resourceId, suffix = "") {
  return `${MANAGEMENT_ENDPOINT}${resourceId}${suffix}${suffix.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function executionTemplate(jobPayload) {
  const template = jobPayload?.properties?.template ?? jobPayload?.template;
  if (!template || !Array.isArray(template.containers)) {
    throw new Error("Container Apps Job response has no execution template");
  }
  return {
    containers: cloneJson(template.containers),
    initContainers: cloneJson(template.initContainers ?? []),
  };
}

function allContainers(template) {
  return [
    ...template.containers.map((container) => ({ container })),
    ...template.initContainers.map((container) => ({ container })),
  ];
}

function selectOverrideContainer(template, containerName) {
  const candidates = allContainers(template);
  if (containerName) {
    const matches = candidates.filter(({ container }) => container.name === containerName);
    if (matches.length !== 1) {
      throw new Error(`expected exactly one Job container named ${containerName}`);
    }
    return matches[0];
  }

  const digestEnvMatches = candidates.filter(({ container }) =>
    Array.isArray(container.env) &&
    container.env.some((entry) => entry?.name === "TOOLS_IMAGE_DIGEST"),
  );
  if (digestEnvMatches.length === 1) return digestEnvMatches[0];
  if (candidates.length === 1) return candidates[0];
  throw new Error("tools image override needs an exact Job container name");
}

function overrideToolsDigest(template, containerName, toolsImageDigest) {
  assertDigest(toolsImageDigest);
  if (!toolsImageDigest) return template;

  const { container } = selectOverrideContainer(template, containerName);
  container.image = toolsImageDigest;
  const environment = Array.isArray(container.env) ? container.env : [];
  const digestEntries = environment.filter((entry) => entry?.name === "TOOLS_IMAGE_DIGEST");
  if (digestEntries.length > 1) throw new Error("Job has duplicate TOOLS_IMAGE_DIGEST variables");
  const digestEntry = digestEntries[0];
  if (digestEntry) {
    digestEntry.value = toolsImageDigest;
    delete digestEntry.secretRef;
  } else {
    environment.push({ name: "TOOLS_IMAGE_DIGEST", value: toolsImageDigest });
    container.env = environment;
  }
  return template;
}

export function buildStartBody(jobPayload, { containerName = "", toolsImageDigest = "" } = {}) {
  const template = executionTemplate(jobPayload);
  return overrideToolsDigest(template, containerName, toolsImageDigest);
}

async function readJson(response, operation) {
  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(`${operation} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  if (response.status === 204) return {};
  if (typeof response.text === "function") {
    const raw = await response.text();
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  }
  if (typeof response.json === "function") return response.json();
  return {};
}

function header(response, name) {
  if (!response.headers) return "";
  if (typeof response.headers.get === "function") return response.headers.get(name) ?? "";
  return response.headers[name] ?? response.headers[name.toLowerCase()] ?? "";
}

function trustedManagementLocation(location) {
  if (!location) return "";
  const parsed = new URL(location, MANAGEMENT_ENDPOINT);
  const management = new URL(MANAGEMENT_ENDPOINT);
  if (
    parsed.origin !== management.origin ||
    !parsed.pathname.toLowerCase().startsWith("/subscriptions/")
  ) {
    throw new Error("Container Apps Job returned an untrusted management Location");
  }
  if (!parsed.searchParams.has("api-version")) parsed.searchParams.set("api-version", API_VERSION);
  return parsed.toString();
}

function trustedExecutionLocation(location, resourceId) {
  const trusted = trustedManagementLocation(location);
  const parsed = new URL(trusted);
  const expectedPrefix = `${resourceId}/executions/`.toLowerCase();
  if (!parsed.pathname.toLowerCase().startsWith(expectedPrefix)) {
    throw new Error("Container Apps Job returned an untrusted execution Location");
  }
  return trusted;
}

function executionLocationFromId(id, resourceId) {
  if (!id || !String(id).toLowerCase().includes("/executions/")) return "";
  return trustedExecutionLocation(id, resourceId);
}

function executionLocationFromOperationPayload(payload, resourceId) {
  const locationCandidates = [
    payload?.executionId,
    payload?.executionResourceId,
    payload?.resourceId,
    payload?.resourceLocation,
    payload?.properties?.executionId,
    payload?.properties?.executionResourceId,
    payload?.properties?.resourceId,
    payload?.properties?.resourceLocation,
  ];
  for (const candidate of locationCandidates) {
    const location = executionLocationFromId(candidate, resourceId);
    if (location) return location;
  }
  const nameCandidates = [payload?.executionName, payload?.properties?.executionName];
  for (const name of nameCandidates) {
    if (typeof name === "string" && name && !name.includes("/")) {
      return endpoint(resourceId, `/executions/${encodeURIComponent(name)}`);
    }
  }
  return "";
}

function executionNameFromUrl(url) {
  const path = new URL(url).pathname;
  const marker = "/executions/";
  const markerIndex = path.toLowerCase().indexOf(marker);
  if (markerIndex < 0) throw new Error("execution URL has no execution name");
  return decodeURIComponent(path.slice(markerIndex + marker.length).split("/")[0]);
}

function operationStatus(payload) {
  return String(
    payload?.status ?? payload?.properties?.status ?? payload?.properties?.provisioningState ?? "",
  );
}

function defaultClock() {
  return {
    now: () => Date.now(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

async function requestWithinDeadline(fetchImpl, url, options, deadline, clock) {
  const remaining = deadline - clock.now();
  if (remaining <= 0) throw new Error("timed out waiting for Container Apps Job");

  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  const timeout = setTimeout(
    () => controller?.abort(),
    Math.min(REQUEST_TIMEOUT_MS, remaining),
  );
  try {
    return await fetchImpl(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveOperationLocation({
  fetchImpl,
  operationUrl,
  resourceId,
  deadline,
  clock,
  headers,
}) {
  while (clock.now() <= deadline) {
    const operationResponse = await requestWithinDeadline(
      fetchImpl,
      operationUrl,
      { method: "GET", headers },
      deadline,
      clock,
    );
    const operation = await readJson(operationResponse, "reading Container Apps Job start operation");
    const executionUrl = executionLocationFromOperationPayload(operation, resourceId);
    if (executionUrl) return executionUrl;

    const status = operationStatus(operation);
    if (status === "Succeeded" || status === "Completed") {
      throw new Error("Container Apps Job start operation succeeded without an execution reference");
    }
    if (status && !RUNNING_STATES.has(status)) {
      throw new Error(`Container Apps Job start operation ended with status ${status}`);
    }

    const remaining = deadline - clock.now();
    if (remaining <= 0) break;
    await clock.sleep(Math.min(5_000, remaining));
  }
  throw new Error("timed out waiting for the Container Apps Job start operation");
}

export async function waitForJob({
  resourceId,
  containerName = "",
  toolsImageDigest = "",
  timeoutMs = 300_000,
  fetchImpl = globalThis.fetch,
  clock = defaultClock(),
  headers = {},
}) {
  if (typeof fetchImpl !== "function") throw new Error("a fetch implementation is required");
  if (!clock || typeof clock.now !== "function" || typeof clock.sleep !== "function") {
    throw new Error("clock must provide now() and sleep(milliseconds)");
  }
  assertResourceId(resourceId);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive");

  const deadline = clock.now() + timeoutMs;
  const jobResponse = await requestWithinDeadline(
    fetchImpl,
    endpoint(resourceId),
    { method: "GET", headers },
    deadline,
    clock,
  );
  const jobPayload = await readJson(jobResponse, "reading Container Apps Job");
  const body = buildStartBody(jobPayload, { containerName, toolsImageDigest });
  const startResponse = await requestWithinDeadline(
    fetchImpl,
    endpoint(resourceId, "/start"),
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    deadline,
    clock,
  );
  const rawStartLocation = header(startResponse, "location");
  const trustedStartLocation = trustedManagementLocation(rawStartLocation);
  const startPayload = await readJson(startResponse, "starting Container Apps Job");
  let executionUrl = executionLocationFromId(startPayload?.id, resourceId);
  if (!executionUrl && startPayload?.name) {
    executionUrl = endpoint(resourceId, `/executions/${encodeURIComponent(startPayload.name)}`);
  }
  if (!executionUrl && trustedStartLocation) {
    const locationPath = new URL(trustedStartLocation).pathname.toLowerCase();
    if (locationPath.startsWith(`${resourceId.toLowerCase()}/executions/`)) {
      executionUrl = trustedStartLocation;
    } else {
      executionUrl = await resolveOperationLocation({
        fetchImpl,
        operationUrl: trustedStartLocation,
        resourceId,
        deadline,
        clock,
        headers,
      });
    }
  }
  if (!executionUrl) {
    throw new Error("Container Apps Job start returned no execution name or trusted Location");
  }
  const executionName = executionNameFromUrl(executionUrl);

  while (clock.now() <= deadline) {
    const executionResponse = await requestWithinDeadline(
      fetchImpl,
      executionUrl,
      { method: "GET", headers },
      deadline,
      clock,
    );
    const execution = await readJson(executionResponse, "reading Container Apps Job execution");
    const status = String(execution?.properties?.status ?? "");
    if (status === "Succeeded") return executionName;
    if (!RUNNING_STATES.has(status)) {
      throw new Error(`Container Apps Job ${executionName} ended with status ${status || "unknown"}`);
    }

    const remaining = deadline - clock.now();
    if (remaining <= 0) break;
    await clock.sleep(Math.min(5_000, remaining));
  }

  throw new Error(`timed out waiting for Container Apps Job after ${timeoutMs}ms`);
}

function managementToken() {
  const token = execFileSync(
    "az",
    [
      "account",
      "get-access-token",
      "--resource",
      "https://management.azure.com/",
      "--query",
      "accessToken",
      "--output",
      "tsv",
    ],
    { encoding: "utf8" },
  ).trim();
  if (!token) throw new Error("Azure CLI returned no management access token");
  return token;
}

async function main() {
  const [resourceId, containerName = "", toolsImageDigest = "", timeoutSeconds = "300"] = process.argv.slice(2);
  if (!resourceId) {
    throw new Error(
      "usage: node container-app-job.mjs <job-resource-id> [container-name] [tools-image-digest] [timeout-seconds]",
    );
  }
  const timeoutMs = Number(timeoutSeconds) * 1_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeout-seconds must be positive");
  const token = managementToken();
  const executionName = await waitForJob({
    resourceId,
    containerName,
    toolsImageDigest,
    timeoutMs,
    headers: { authorization: `Bearer ${token}` },
  });
  process.stdout.write(`${executionName}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
