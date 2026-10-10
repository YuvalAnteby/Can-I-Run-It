import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStartBody, waitForJob } from "./container-app-job.mjs";

const resourceId =
  "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-migration";
const digest = `ghcr.io/example/ciri-tools@sha256:${"a".repeat(64)}`;
const managementEndpoint = "https://management.azure.com";

function response(status, payload, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => normalizedHeaders.get(name.toLowerCase()) ?? null,
    },
    async json() {
      if (payload === undefined) throw new Error("empty response body");
      return payload;
    },
    async text() {
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

function clockWithStep(step = 100) {
  let current = 0;
  return {
    clock: {
      now: () => current,
      sleep: async (milliseconds) => {
        current += Math.max(milliseconds, step);
      },
    },
    now: () => current,
  };
}

function executionResponse(status) {
  return response(200, { name: "execution-1", properties: { status } });
}

test("buildStartBody emits the direct REST template shape and immutable digest override", () => {
  const body = buildStartBody(
    { properties: { template: { containers: [{ name: "migration" }] } } },
    { containerName: "migration", toolsImageDigest: digest },
  );
  const container = body?.containers?.[0];

  assert.equal(body?.template, undefined);
  assert.equal(body?.properties, undefined);
  assert.equal(container?.name, "migration");
  assert.equal(container?.image, digest);
  assert.deepEqual(container?.env, [
    { name: "TOOLS_IMAGE_DIGEST", value: digest },
  ]);
});

test("preserves fetched Job template fields while overriding only image and digest env", async () => {
  const originalContainer = {
    name: "migration",
    image: "ghcr.io/example/ciri-tools@sha256:old",
    command: ["node", "dist/database/maintenance.js"],
    args: ["migrate"],
    env: [
      { name: "POSTGRES_HOST", secretRef: "postgres-host" },
      { name: "KEEP_ME", value: "yes" },
    ],
    resources: { cpu: 0.5, memory: "1Gi", ephemeralStorage: "2Gi" },
  };
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (
      options.method === "GET" &&
      url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
    ) {
      return response(200, {
        properties: { template: { containers: [originalContainer] } },
      });
    }
    if (options.method === "POST") {
      return response(200, { name: "execution-1" });
    }
    if (url.includes("/executions/execution-1"))
      return executionResponse("Succeeded");
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  const execution = await waitForJob({
    resourceId,
    containerName: "migration",
    toolsImageDigest: digest,
    fetchImpl,
    timeoutMs: 1_000,
    clock: clockWithStep().clock,
  });

  assert.equal(execution, "execution-1");
  const post = requests.find(({ options }) => options.method === "POST");
  assert.ok(post, "start POST was issued");
  const body = JSON.parse(post.options.body);
  assert.equal(body.template, undefined);
  const container = body.containers[0];
  assert.equal(container.image, digest);
  assert.deepEqual(container.command, originalContainer.command);
  assert.deepEqual(container.args, originalContainer.args);
  assert.deepEqual(container.resources, originalContainer.resources);
  assert.deepEqual(container.env, [
    ...originalContainer.env,
    { name: "TOOLS_IMAGE_DIGEST", value: digest },
  ]);
});

test("accepts the documented Processing state before Succeeded", async () => {
  let executionReads = 0;
  const fetchImpl = async (url, options = {}) => {
    if (
      options.method === "GET" &&
      url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
    ) {
      return response(200, {
        properties: { template: { containers: [{ name: "migration" }] } },
      });
    }
    if (options.method === "POST")
      return response(200, { name: "execution-1" });
    if (url.includes("/executions/execution-1")) {
      executionReads += 1;
      return executionResponse(
        executionReads === 1 ? "Processing" : "Succeeded",
      );
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  await assert.doesNotReject(
    waitForJob({
      resourceId,
      containerName: "migration",
      toolsImageDigest: digest,
      fetchImpl,
      timeoutMs: 10_000,
      clock: clockWithStep().clock,
    }),
  );
  assert.equal(executionReads, 2);
});

test("applies the timeout deadline to a hanging start POST", async () => {
  const fetchImpl = (_url, options = {}) =>
    options.method === "GET"
      ? Promise.resolve(
          response(200, {
            properties: { template: { containers: [{ name: "migration" }] } },
          }),
        )
      : new Promise((resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new Error("start request aborted")),
            { once: true },
          );
        });
  const operation = waitForJob({
    resourceId,
    toolsImageDigest: digest,
    timeoutMs: 25,
    fetchImpl,
  });
  const result = await Promise.race([
    operation.then(
      () => ({ kind: "resolved" }),
      (error) => ({ kind: "rejected", error }),
    ),
    new Promise((resolve) =>
      setTimeout(() => resolve({ kind: "test-timeout" }), 150),
    ),
  ]);

  assert.notEqual(
    result.kind,
    "test-timeout",
    "POST must be covered by the deadline",
  );
  assert.equal(result.kind, "rejected");
  assert.match(result.error.message, /abort|timed out|timeout|deadline/i);
});

test("correlates an empty 202 Location to its execution instead of newest unrelated execution", async () => {
  const executionUrl = `${managementEndpoint}${resourceId}/executions/execution-current?api-version=2026-07-01`;
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (
      options.method === "GET" &&
      url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
    ) {
      return response(200, {
        properties: { template: { containers: [{ name: "migration" }] } },
      });
    }
    if (options.method === "POST")
      return response(202, undefined, { Location: executionUrl });
    if (url === executionUrl) return executionResponse("Succeeded");
    if (url.includes("/executions")) {
      return response(200, {
        value: [
          {
            name: "execution-unrelated",
            properties: {
              startTime: "2026-10-10T00:02:00Z",
              status: "Succeeded",
            },
          },
          {
            name: "execution-current",
            properties: {
              startTime: "2026-10-10T00:01:00Z",
              status: "Succeeded",
            },
          },
        ],
      });
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };

  await assert.doesNotReject(
    waitForJob({
      resourceId,
      fetchImpl,
      timeoutMs: 1_000,
      clock: clockWithStep().clock,
    }),
  );
  assert.ok(requests.some(({ url }) => url === executionUrl));
  assert.equal(
    requests.some(({ url }) => url.includes("execution-unrelated")),
    false,
  );
});

test("rejects start HTTP failure", async () => {
  await assert.rejects(
    waitForJob({
      resourceId,
      fetchImpl: async (_url, options = {}) =>
        options.method === "GET"
          ? response(200, {
              properties: { template: { containers: [{ name: "migration" }] } },
            })
          : response(500, { error: "start failed" }),
      timeoutMs: 100,
      clock: clockWithStep().clock,
    }),
    /starting Container Apps Job failed|500/i,
  );
});

for (const status of ["Failed", "Cancelled", "Degraded"]) {
  test(`rejects terminal ${status} execution`, async () => {
    await assert.rejects(
      waitForJob({
        resourceId,
        fetchImpl: async (url, options = {}) => {
          if (
            options.method === "GET" &&
            url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
          ) {
            return response(200, {
              properties: { template: { containers: [{ name: "migration" }] } },
            });
          }
          return options.method === "POST"
            ? response(200, { name: "execution-1" })
            : executionResponse(status);
        },
        timeoutMs: 100,
        clock: clockWithStep().clock,
      }),
      new RegExp(`${status}|unknown|ended`, "i"),
    );
  });
}

test("rejects an unknown terminal execution status", async () => {
  await assert.rejects(
    waitForJob({
      resourceId,
      fetchImpl: async (url, options = {}) => {
        if (
          options.method === "GET" &&
          url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
        ) {
          return response(200, {
            properties: { template: { containers: [{ name: "migration" }] } },
          });
        }
        return options.method === "POST"
          ? response(200, { name: "execution-1" })
          : executionResponse("MysteryState");
      },
      timeoutMs: 100,
      clock: clockWithStep().clock,
    }),
    /unknown|MysteryState|ended/i,
  );
});

test("rejects when a running execution reaches the deadline", async () => {
  await assert.rejects(
    waitForJob({
      resourceId,
      fetchImpl: async (url, options = {}) => {
        if (
          options.method === "GET" &&
          url === `${managementEndpoint}${resourceId}?api-version=2026-07-01`
        ) {
          return response(200, {
            properties: { template: { containers: [{ name: "migration" }] } },
          });
        }
        return options.method === "POST"
          ? response(200, { name: "execution-1" })
          : executionResponse("Running");
      },
      timeoutMs: 100,
      clock: clockWithStep(100).clock,
    }),
    /timed out|timeout/i,
  );
});
