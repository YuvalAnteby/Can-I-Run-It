import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "../..");
const productionWorkflow = readFileSync(
  join(repoRoot, ".github/workflows/backend-cd-prod.yml"),
  "utf8",
);
const backendCi = readFileSync(
  join(repoRoot, ".github/workflows/backend-ci.yml"),
  "utf8",
);
const frontendCi = readFileSync(
  join(repoRoot, ".github/workflows/frontend-ci.yml"),
  "utf8",
);

function withTempDir(callback) {
  const directory = mkdtempSync(join(tmpdir(), "ciri-release-test-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeBashEnv(directory, content) {
  const path = join(directory, "bash-env.sh");
  writeFileSync(path, content);
  return path;
}

function bashPath(path) {
  if (process.platform !== "win32") return path;
  return `/mnt/${path[0].toLowerCase()}${path.slice(2).replaceAll("\\", "/")}`;
}

function bashQuote(value) {
  return `'${String(value).replaceAll("'", "'\\\"'\\\"'")}'`;
}

function runBash(script, args = [], env = {}) {
  const { BASH_ENV: bashEnv, ...processEnv } = env;
  const command = bashEnv
    ? [
        `. ${bashQuote(bashEnv)};`,
        `set -- ${args.map(bashQuote).join(" ")};`,
        `. ${bashQuote(script)}`,
      ].join(" ")
    : `exec ${[script, ...args].map(bashQuote).join(" ")}`;
  return spawnSync("bash", ["-c", command], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...processEnv },
  });
}

function withMockPath(directory, extra = {}) {
  return {
    ...extra,
    PATH: `${bashPath(directory)}:${process.env.PATH ?? ""}`,
  };
}

test("production workflow is main-only, protected, and release-OIDC scoped", () => {
  assert.match(
    productionWorkflow,
    /on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/,
  );
  assert.match(productionWorkflow, /environment:\s*\n\s+name:\s*production/);
  assert.match(productionWorkflow, /id-token:\s*write/);
  assert.doesNotMatch(productionWorkflow, /pull_request:/);
  assert.doesNotMatch(productionWorkflow, /az\s+(role|ad)\b/i);
  assert.doesNotMatch(
    productionWorkflow,
    /\b(psql|sql-admin|Contributor|Owner)\b/i,
  );
  assert.doesNotMatch(
    productionWorkflow,
    /(?:tag|image|push|pull)[^\n]*\blatest\b/i,
  );
});

test("fork and pull-request CI paths have no deployment credentials", () => {
  for (const workflow of [backendCi, frontendCi]) {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
    assert.doesNotMatch(workflow, /id-token:\s*write/);
    assert.doesNotMatch(workflow, /azure\/login|secrets\./i);
  }
});

test("existing CI gates remain required before production release", () => {
  for (const gate of [
    "npm audit",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "npm run build",
  ]) {
    assert.match(
      backendCi,
      new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.match(
      frontendCi,
      new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(backendCi, /aquasec\/trivy:0\.74\.0/);
});

test("workflow step output references resolve within their owning jobs", () => {
  const jobsStart = productionWorkflow.indexOf("\njobs:");
  assert.ok(jobsStart >= 0, "production workflow must define jobs");
  const jobs = productionWorkflow.slice(jobsStart);
  const jobHeaders = [...jobs.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];
  assert.ok(
    jobHeaders.length > 0,
    "production workflow must define named jobs",
  );

  for (let index = 0; index < jobHeaders.length; index += 1) {
    const start = jobHeaders[index].index + jobHeaders[index][0].length;
    const end = jobHeaders[index + 1]?.index ?? jobs.length;
    const block = jobs.slice(start, end);
    const stepIds = new Set(
      [...block.matchAll(/^\s{8}id:\s*([A-Za-z0-9_-]+)\s*$/gm)].map(
        (match) => match[1],
      ),
    );
    const references = [
      ...block.matchAll(/\bsteps\.([A-Za-z0-9_-]+)\.outputs\./g),
    ].map((match) => match[1]);
    for (const reference of references) {
      assert.ok(
        stepIds.has(reference),
        `job ${jobHeaders[index][1]} references undefined step id ${reference}`,
      );
    }
  }
});

test("both images are scanned before publication and exact digests feed deployment", () => {
  const apiScan = productionWorkflow.indexOf(
    "Scan API image before publication",
  );
  const toolsScan = productionWorkflow.indexOf(
    "Scan maintenance tools image before publication",
  );
  const publish = productionWorkflow.indexOf("Publish scanned full-SHA images");
  const resolve = productionWorkflow.indexOf(
    "Require public anonymous GHCR pulls and resolve digests",
  );
  const release = productionWorkflow.indexOf("  release:");

  assert.ok(apiScan >= 0 && apiScan < publish);
  assert.ok(toolsScan >= 0 && toolsScan < publish);
  assert.ok(publish < resolve && resolve < release);
  assert.match(productionWorkflow, /verify-ghcr-digest\.sh.*api_tag/);
  assert.match(productionWorkflow, /verify-ghcr-digest\.sh.*tools_tag/);
  assert.match(productionWorkflow, /API_IMAGE_DIGEST:/);
  assert.match(productionWorkflow, /TOOLS_IMAGE_DIGEST:/);
  assert.match(
    productionWorkflow,
    /az containerapp update --ids "\$BACKEND_RESOURCE_ID" --image "\$API_IMAGE_DIGEST"/,
  );
});

test("migration terminal success gates the image update and uses the Terraform container name", () => {
  const migration = productionWorkflow.indexOf(
    "Run matching tools-digest migration",
  );
  const update = productionWorkflow.indexOf("Update only the API image");
  assert.ok(migration >= 0 && migration < update);
  assert.match(
    productionWorkflow,
    /container-app-job\.mjs "\$MIGRATION_JOB_RESOURCE_ID" migration "\$TOOLS_IMAGE_DIGEST"/,
  );
  assert.match(
    productionWorkflow,
    /Reconcile executor firewall and require terminal success/,
  );
});

test("GHCR verification rejects latest and a public pull digest from another repository", () => {
  withTempDir((directory) => {
    const ghcrBashEnv = (digest) =>
      writeBashEnv(
        directory,
        `
docker() {
if [[ "$1" == "pull" ]]; then return 0; fi
if [[ "$1" == "image" && "$2" == "inspect" ]]; then printf '%s\\n' '${digest}'; return 0; fi
return 1
}
`,
      );
    const script = join(scriptsDir, "verify-ghcr-digest.sh");
    const tag = `ghcr.io/example/ciri-backend:sha-${"b".repeat(40)}`;
    const validDigest = `ghcr.io/example/ciri-backend@sha256:${"c".repeat(64)}`;
    const valid = runBash(
      bashPath(script),
      [tag, validDigest],
      withMockPath(directory, { BASH_ENV: bashPath(ghcrBashEnv(validDigest)) }),
    );
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout.trim(), validDigest);

    const mismatched = runBash(
      bashPath(script),
      [tag, validDigest],
      withMockPath(directory, {
        BASH_ENV: bashPath(
          ghcrBashEnv(`ghcr.io/other/repo@sha256:${"d".repeat(64)}`),
        ),
      }),
    );
    assert.notEqual(mismatched.status, 0);

    const latest = runBash(
      bashPath(script),
      ["ghcr.io/example/ciri-backend:latest", validDigest],
      withMockPath(directory, { BASH_ENV: bashPath(ghcrBashEnv(validDigest)) }),
    );
    assert.notEqual(latest.status, 0);
  });
});

test("Container App smoke helper propagates mocked az/curl failures and validates exact CORS", () => {
  withTempDir((directory) => {
    const digest = `ghcr.io/example/ciri-backend@sha256:${"e".repeat(64)}`;
    const payload = JSON.stringify({
      properties: {
        configuration: {
          activeRevisionsMode: "Single",
          ingress: { traffic: [] },
        },
        template: {
          scale: { minReplicas: 0, maxReplicas: 1 },
          containers: [{ image: digest, env: [] }],
        },
      },
    });
    const smokeBashEnv = (curlFailure = false) =>
      writeBashEnv(
        directory,
        `
az() {
if [[ "$1" == "rest" ]]; then
  cat <<'JSON'
${payload}
JSON
  return 0
fi
return 1
}
curl() {
${curlFailure ? "return 22;" : ""}
previous=''
for arg in "$@"; do
  if [[ "$previous" == "-D" ]]; then
    printf 'Access-Control-Allow-Origin: %s\\r\\n' 'https://swa.example' > "$arg"
  fi
  previous="$arg"
done
printf '{}'
}
`,
      );
    const script = join(scriptsDir, "verify-container-app.sh");
    const args = [
      "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/containerApps/ciri-api",
      "https://api.example",
      "https://swa.example",
      digest,
    ];
    const success = runBash(
      bashPath(script),
      args,
      withMockPath(directory, { BASH_ENV: bashPath(smokeBashEnv()) }),
    );
    assert.equal(success.status, 0, success.stderr);

    const smokeFailure = runBash(
      bashPath(script),
      args,
      withMockPath(directory, {
        BASH_ENV: bashPath(smokeBashEnv(true)),
      }),
    );
    assert.notEqual(smokeFailure.status, 0);
  });
});

test("SWA helper enforces HTTPS /api, fallback exclusions, and bundle secret markers", () => {
  withTempDir((directory) => {
    const dist = join(directory, "dist");
    const bundle = join(dist, "assets");
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, "index.js"), 'console.log("safe");');
    const script = join(scriptsDir, "verify-swa-build.mjs");
    const success = spawnSync(
      process.execPath,
      [script, dist, "https://api.example/api"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    assert.equal(success.status, 0, success.stderr);

    const badUrl = spawnSync(
      process.execPath,
      [script, dist, "http://api.example/api"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    assert.notEqual(badUrl.status, 0);

    writeFileSync(
      join(bundle, "secret.js"),
      'const GEMINI_API_KEY = "forbidden";',
    );
    const secret = spawnSync(
      process.execPath,
      [script, dist, "https://api.example/api"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    assert.notEqual(secret.status, 0);
  });
});
