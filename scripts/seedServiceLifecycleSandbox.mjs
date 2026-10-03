import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  buildServiceLifecycleSeedDocuments,
  serviceLifecycleOrganizationId,
  serviceLifecycleSandboxProjectId,
} from "./serviceLifecycleFixtures.mjs";

export function assertServiceLifecycleSandbox(projectId) {
  if (projectId !== serviceLifecycleSandboxProjectId) {
    throw new Error("Lifecycle seed is restricted to the exact dedicated Sandbox project.");
  }
  return projectId;
}

export function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid synthetic timestamp.");
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) throw new Error("Unsafe synthetic integer.");
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
  }
  throw new Error("Unsupported synthetic Firestore value.");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    // Firestore omits empty array/map payloads and canonicalizes ISO fractions.
    // Preserve nanoseconds: Date/millisecond rounding would hide later edits.
    if (Object.hasOwn(value, "timestampValue") && typeof value.timestampValue === "string") {
      const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value.timestampValue);
      if (match) return { ...value, timestampValue: `${match[1]}.${(match[2] || "").padEnd(9, "0")}Z` };
    }
    if (Object.hasOwn(value, "arrayValue")) {
      return { ...value, arrayValue: stable({ ...value.arrayValue, values: value.arrayValue?.values || [] }) };
    }
    if (Object.hasOwn(value, "mapValue")) {
      return { ...value, mapValue: stable({ ...value.mapValue, fields: value.mapValue?.fields || {} }) };
    }
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function serviceLifecycleSeedPlan(projectId) {
  assertServiceLifecycleSandbox(projectId);
  const root = `projects/${projectId}/databases/(default)/documents/organizations/${serviceLifecycleOrganizationId}`;
  const documents = buildServiceLifecycleSeedDocuments().map(({ path: recordPath, data }) => {
    const segments = recordPath.split("/");
    if (![2, 4].includes(segments.length) || segments.some((segment, index) => index % 2 === 1 && !/^lifecycle-v0[a-z0-9-]*$/.test(segment))) {
      throw new Error("Unsafe synthetic document path.");
    }
    if (!/^(clients|properties|cleaners|jobs)\//.test(recordPath)
      || (segments.length === 4 && (segments[0] !== "jobs" || !["offers", "assignments", "issues"].includes(segments[2])))) {
      throw new Error("Unsupported seed collection.");
    }
    return { name: `${root}/${recordPath}`, fields: firestoreValue(data).mapValue.fields };
  });
  return { projectId, documents };
}

async function firebaseCliClient(projectId) {
  // Reuse the CLI's authenticated transport; do not extract/export bearer tokens
  // or service-account credentials and do not fall back to production config.
  const require = createRequire(import.meta.url);
  const { getGlobalDefaultAccount, setActiveAccount } = require("firebase-tools/lib/auth");
  const { requireAuth } = require("firebase-tools/lib/requireAuth");
  const { Client } = require("firebase-tools/lib/apiv2");
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error("An existing signed-in Firebase CLI account is required.");
  const options = { project: projectId };
  setActiveAccount(options, account);
  await requireAuth(options, true);
  return new Client({ urlPrefix: "https://firestore.googleapis.com", auth: true });
}

async function boundedRequest(operation, deadlineMs) {
  let timer;
  try {
    // CLI transport timeout ends at response headers; also bound JSON/body parsing.
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Sandbox seed request deadline exceeded; no automatic retry.")), deadlineMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function seedServiceLifecycleSandbox({ projectId, apply = false, clientFactory = firebaseCliClient, requestDeadlineMs = 20_000 } = {}) {
  // Resolve and validate every path before even invoking authentication.
  const plan = serviceLifecycleSeedPlan(projectId);
  if (!Number.isInteger(requestDeadlineMs) || requestDeadlineMs < 1 || requestDeadlineMs > 20_000) throw new Error("Seed request deadline must be bounded.");
  if (!apply) return { dryRun: true, projectId, planned: plan.documents.length, created: 0, skipped: 0 };
  const client = await clientFactory(projectId);
  const requestOptions = { timeout: 20_000, retries: 0, resolveOnHTTPError: true, skipLog: { body: true, resBody: true } };
  const missing = [];
  let skipped = 0;
  for (const expected of plan.documents) {
    const response = await boundedRequest(() => client.get(`/v1/${expected.name}`, { ...requestOptions }), requestDeadlineMs);
    if (response.status === 404) { missing.push(expected); continue; }
    if (response.status !== 200) throw new Error(`Sandbox seed read failed: HTTP ${response.status}.`);
    const existing = response.body;
    if (existing.name !== expected.name || !existing.createTime || existing.createTime !== existing.updateTime
      || !isDeepStrictEqual(stable(existing.fields), stable(expected.fields))) {
      throw new Error("Existing lifecycle seed differs or has been edited; refusing all writes.");
    }
    skipped += 1;
  }
  if (missing.length) {
    const response = await boundedRequest(() => client.post(`/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      writes: missing.map(document => ({ update: document, currentDocument: { exists: false } })),
    }, { ...requestOptions }), requestDeadlineMs);
    if (response.status !== 200) throw new Error(`Sandbox create-only seed failed: HTTP ${response.status}; no overwrite/retry attempted.`);
  }
  return { dryRun: false, projectId, planned: plan.documents.length, created: missing.length, skipped };
}

export async function runServiceLifecycleSeedCli(args = process.argv.slice(2), seed = seedServiceLifecycleSandbox) {
  let projectId;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project") projectId = args[++index];
    else if (args[index] === "--apply") apply = true;
    else throw new Error("Supported arguments: --project <exact-sandbox-project> [--apply].");
  }
  const result = await seed({ projectId, apply });
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runServiceLifecycleSeedCli().catch(() => {
    // Deliberately do not print SDK errors/response bodies/account metadata.
    console.error("Lifecycle Sandbox seed stopped. Exact project, existing CLI auth and unchanged/create-only records are required.");
    process.exitCode = 1;
  });
}
