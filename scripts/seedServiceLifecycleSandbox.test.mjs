import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildServiceLifecycleFixtures, buildServiceLifecycleSeedDocuments,
  getServiceLifecycleFixture, serviceLifecycleScenarios, serviceLifecycleSandboxProjectId,
} from "./serviceLifecycleFixtures.mjs";
import { firestoreValue, seedServiceLifecycleSandbox, serviceLifecycleSeedPlan } from "./seedServiceLifecycleSandbox.mjs";

const projectId = serviceLifecycleSandboxProjectId;
const snapshot = expected => ({ ...structuredClone(expected), createTime: "2026-10-03T23:00:00.123456789Z", updateTime: "2026-10-03T23:00:00.123456789Z" });

test("nine synthetic scenario projections use current independent Job/Checklist fields", () => {
  const fixtures = buildServiceLifecycleFixtures();
  assert.deepEqual(fixtures.map(item => item.id), ["unassigned", "offered", "assigned", "assigned-draft", "in-progress", "ready", "completed", "stale", "open-issue"]);
  assert.equal(serviceLifecycleScenarios.length, 9);
  for (const fixture of fixtures) {
    assert.equal(fixture.syntheticPreview, true);
    assert.equal(fixture.job.schemaVersion, 2);
    assert.equal(fixture.job.demoSeed, true);
    assert.equal(fixture.job.dataProvenance, "DEMO");
    assert.equal(Object.hasOwn(fixture.job, "checklistRun"), false);
    assert.equal(Object.hasOwn(fixture.job, "checklistCapability"), false);
    assert.equal(fixture.assignments.length, fixture.job.assignedCleanerIds.length);
    if (fixture.checklistRun) {
      assert.equal(fixture.checklistRun.syntheticPreview, true);
      assert.equal(fixture.checklistRun.status === "DRAFT" || fixture.checklistRun.status === "READY_FOR_REVIEW", true);
      assert.equal(fixture.checklistRun.checklistItemCount, 28);
      assert.equal(fixture.checklistRun.evidence, null);
    }
  }
  assert.equal(getServiceLifecycleFixture("assigned-draft").checklistRun.draft.progress.checklist.done, 7);
  assert.equal(getServiceLifecycleFixture("in-progress").job.operationalStatus, "IN_PROGRESS");
  assert.equal(getServiceLifecycleFixture("in-progress").checklistRun.status, "DRAFT");
  assert.equal(getServiceLifecycleFixture("ready").checklistRun.status, "READY_FOR_REVIEW");
  assert.equal(getServiceLifecycleFixture("completed").checklistCapability.state, "UNAVAILABLE");
  assert.equal(getServiceLifecycleFixture("stale").checklistCapability.state, "STALE");
  assert.equal(getServiceLifecycleFixture("open-issue").issues[0].status, "OPEN");
  assert.throws(() => getServiceLifecycleFixture("unknown"));
});

test("seed documents exclude Runs/capabilities/progress and contain no private contact/access data", () => {
  const documents = buildServiceLifecycleSeedDocuments();
  assert.equal(documents.length, 30);
  const forbidden = /token|capability|checklistRun|draft|evidence|photo|email|phone|whatsapp|keyCodeInfo|accessInstructions|storagePath/i;
  for (const { path, data } of documents) {
    assert.match(path, /lifecycle-v0/);
    assert.equal(data.demoSeed, true);
    assert.equal(data.demoSeedBatch, "dev-center-lifecycle-v0");
    // Case IDs may say "assigned-draft"; only collection segments are persisted authorities.
    for (const collection of path.split("/").filter((_, index) => index % 2 === 0)) {
      assert.equal(forbidden.test(collection), false, collection);
    }
    for (const key of Object.keys(data)) assert.equal(forbidden.test(key), false, key);
  }
  for (const { checklistCapability } of buildServiceLifecycleFixtures()) {
    for (const key of Object.keys(checklistCapability)) assert.equal(/token|hash|url/i.test(key), false);
  }
});

test("fixture consumers receive fresh objects without mutating later fixtures/seeds", () => {
  const fixture = getServiceLifecycleFixture("assigned-draft");
  fixture.job.operationalStatus = "COMPLETED";
  fixture.checklistRun.draft.progress.checklist.done = 100;
  assert.equal(getServiceLifecycleFixture("assigned-draft").job.operationalStatus, "ASSIGNED");
  assert.equal(getServiceLifecycleFixture("assigned-draft").checklistRun.draft.progress.checklist.done, 7);
});

test("serializer preserves zero, blanks, arrays, maps and ISO timestamps; rejects invalid values", () => {
  assert.deepEqual(firestoreValue({ zero: 0, blank: "", optional: null, when: new Date("2026-10-03T00:00:00Z"), list: [true, 1.25] }), {
    mapValue: { fields: { zero: { integerValue: "0" }, blank: { stringValue: "" }, optional: { nullValue: null }, when: { timestampValue: "2026-10-03T00:00:00.000Z" }, list: { arrayValue: { values: [{ booleanValue: true }, { doubleValue: 1.25 }] } } } },
  });
  for (const value of [undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, new Date("invalid"), () => {}]) assert.throws(() => firestoreValue(value));
});

test("wrong project fails before authentication/request factory; dry run never authenticates", async () => {
  let calls = 0;
  const clientFactory = async () => { calls += 1; throw new Error("Must not authenticate"); };
  for (const unsafe of [undefined, "clean-flow-prototipo", "sandbox", "other-project", `${projectId}/../clean-flow-prototipo`]) {
    await assert.rejects(seedServiceLifecycleSandbox({ projectId: unsafe, apply: true, clientFactory }));
  }
  assert.deepEqual(await seedServiceLifecycleSandbox({ projectId, clientFactory }), { dryRun: true, projectId, planned: 30, created: 0, skipped: 0 });
  assert.equal(calls, 0);
});

test("create-only request paths stay within the allowlisted project/organization and known synthetic collections", async () => {
  const requests = [];
  const client = {
    async get(path, options) { requests.push({ method: "GET", path, options }); return { status: 404 }; },
    async post(path, body, options) { requests.push({ method: "POST", path, body, options }); return { status: 200 }; },
  };
  const result = await seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async target => { assert.equal(target, projectId); return client; } });
  assert.equal(result.created, 30);
  assert.equal(requests.length, 31);
  for (const request of requests) {
    assert.match(request.path, new RegExp(`^/v1/projects/${projectId}/databases/\\(default\\)/documents`));
    assert.equal(request.options.retries, 0);
    assert.equal(request.options.timeout, 20_000);
    assert.deepEqual(request.options.skipLog, { body: true, resBody: true });
  }
  for (const write of requests.at(-1).body.writes) {
    assert.deepEqual(write.currentDocument, { exists: false });
    assert.equal(Object.hasOwn(write, "delete"), false);
    assert.equal(Object.hasOwn(write, "updateMask"), false);
  }
});

test("unchanged repeat skips every record without a commit", async () => {
  const documents = new Map(serviceLifecycleSeedPlan(projectId).documents.map(document => [`/v1/${document.name}`, snapshot(document)]));
  let writes = 0;
  const result = await seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async () => ({
    async get(path) { return { status: 200, body: documents.get(path) }; },
    async post() { writes += 1; return { status: 200 }; },
  }) });
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 30);
  assert.equal(writes, 0);
});

test("Firestore timestamp/empty-array canonicalization does not break unchanged repeat", async () => {
  const documents = serviceLifecycleSeedPlan(projectId).documents;
  const existing = documents.map(document => {
    const value = snapshot(document);
    if (value.fields.createdAt) value.fields.createdAt.timestampValue = "2026-10-03T12:00:00Z";
    if (value.fields.assignedCleanerIds?.arrayValue.values?.length === 0) value.fields.assignedCleanerIds = { arrayValue: {} };
    return value;
  });
  const byPath = new Map(existing.map(document => [`/v1/${document.name}`, document]));
  const result = await seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async () => ({
    async get(path) { return { status: 200, body: byPath.get(path) }; }, async post() { throw new Error("No writes"); },
  }) });
  assert.equal(result.skipped, 30);
});

for (const mode of ["field-edit", "metadata-edit", "missing-metadata"]) {
  test(`existing ${mode} stops before any seed commit`, async () => {
    const documents = serviceLifecycleSeedPlan(projectId).documents;
    let writes = 0;
    const existing = snapshot(documents[1]);
    if (mode === "field-edit") existing.fields.name = { stringValue: "Synthetic manually edited name" };
    if (mode === "metadata-edit") existing.updateTime = "2026-10-03T23:00:00.123456790Z";
    if (mode === "missing-metadata") delete existing.createTime;
    await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async () => ({
      async get(path) { return path === `/v1/${existing.name}` ? { status: 200, body: existing } : { status: 404 }; },
      async post() { writes += 1; return { status: 200 }; },
    }) }));
    assert.equal(writes, 0);
  });
}

test("permission/read failure or concurrent create rejection never triggers overwrite/retry", async () => {
  let writes = 0;
  await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async () => ({
    async get() { return { status: 403 }; }, async post() { writes += 1; },
  }) }));
  assert.equal(writes, 0);
  await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, clientFactory: async () => ({
    async get() { return { status: 404 }; }, async post() { writes += 1; return { status: 409 }; },
  }) }));
  assert.equal(writes, 1);
});

test("pending read/JSON response deadline stops safely before commit", async () => {
  let reads = 0;
  let writes = 0;
  await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, requestDeadlineMs: 5, clientFactory: async () => ({
    async get() { reads += 1; return new Promise(() => {}); }, async post() { writes += 1; },
  }) }), /deadline exceeded/);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test("unknown commit outcome times out once without claiming success or retry", async () => {
  let writes = 0;
  await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, requestDeadlineMs: 5, clientFactory: async () => ({
    async get() { return { status: 404 }; }, async post() { writes += 1; return new Promise(() => {}); },
  }) }), /deadline exceeded/);
  assert.equal(writes, 1);
});

test("unbounded/invalid deadlines fail before authentication", async () => {
  let authenticated = false;
  for (const requestDeadlineMs of [0, 20_001, Infinity, NaN]) {
    await assert.rejects(seedServiceLifecycleSandbox({ projectId, apply: true, requestDeadlineMs, clientFactory: async () => { authenticated = true; } }));
  }
  assert.equal(authenticated, false);
});
