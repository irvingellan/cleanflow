import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

// An independent disposable emulator instance, never the user's existing session.
assert.equal(process.env.GCLOUD_PROJECT, "demo-cleanflow");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, "/nonexistent/cleanflow-sandbox-test-no-credentials.json");

const { initializeApp } = await import("firebase-admin/app");
initializeApp({ projectId: "demo-cleanflow" });
const { getFirestore } = await import("firebase-admin/firestore");
const { generateDevCenterScenario, clearDevCenterData } = await import("../functions/src/index.js");
const db = getFirestore();
const organization = db.collection("organizations").doc("cleanflow-demo");
const baseline = { ...process.env };
function environment(project = "demo-cleanflow", emulator = true, sandbox = "") {
  process.env.GCLOUD_PROJECT = project;
  process.env.GCP_PROJECT = project;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: project });
  process.env.FUNCTIONS_EMULATOR = emulator ? "true" : "false";
  process.env.DEV_CENTER_SANDBOX_PROJECT_ID = sandbox;
  process.env.DEV_CENTER_DEVELOPER_UIDS = "synthetic-developer";
}
const request = (data = {}, uid = "synthetic-developer") => ({ auth: uid ? { uid } : undefined, data });
const count = async (kind = "jobs") => (await organization.collection(kind).get()).size;

beforeEach(async () => {
  environment();
  await db.recursiveDelete(organization);
});
after(async () => {
  await db.recursiveDelete(organization);
  for (const key of ["GCLOUD_PROJECT", "GCP_PROJECT", "FIREBASE_CONFIG", "FUNCTIONS_EMULATOR", "DEV_CENTER_SANDBOX_PROJECT_ID", "DEV_CENTER_DEVELOPER_UIDS"]) {
    if (baseline[key] === undefined) delete process.env[key]; else process.env[key] = baseline[key];
  }
});

test("anonymous and non-developer cannot generate, clear or reset", async () => {
  for (const uid of [null, "synthetic-manager-not-allowlisted"]) {
    await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true }, uid)));
    await assert.rejects(clearDevCenterData.run(request({}, uid)));
  }
  assert.equal(await count(), 0);
});

test("production and unknown runtimes fail before mutations even when misconfigured", async () => {
  for (const [project, emulator, sandbox] of [
    ["clean-flow-prototipo", true, "clean-flow-prototipo"],
    ["clean-flow-prototipo", false, "synthetic-sandbox"],
    ["unknown-synthetic-project", false, "synthetic-sandbox"],
  ]) {
    environment(project, emulator, sandbox);
    await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
    await assert.rejects(clearDevCenterData.run(request()), { code: "failed-precondition" });
  }
  assert.equal(await count(), 0);
});

test("emulator creates Weekly Close solely as marked synthetic records and clears them", async () => {
  await generateDevCenterScenario.run(request({ scenario: "weeklyClose" }));
  const jobs = await organization.collection("jobs").get();
  assert.equal(jobs.size, 12);
  assert.equal(await count("payouts"), 2);
  for (const job of jobs.docs) assert.equal(job.data().demoSeed, true);
  assert.ok(jobs.docs.some(job => job.data().clientPrice === 0));
  await clearDevCenterData.run(request());
  assert.equal(await count(), 0);
  assert.equal(await count("payouts"), 0);
});

test("reset preserves unmarked data and replaces only untouched seeds", async () => {
  await organization.collection("clients").doc("manual-synthetic").set({ name: "Synthetic preserved reference" });
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const oldIds = (await organization.collection("jobs").get()).docs.map(doc => doc.id);
  await generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true }));
  assert.equal(await count(), 10);
  const nextIds = (await organization.collection("jobs").get()).docs.map(doc => doc.id);
  assert.ok(nextIds.every(id => !oldIds.includes(id)));
  assert.equal((await organization.collection("clients").doc("manual-synthetic").get()).exists, true);
});

test("existing workflow history blocks reset and is preserved by clear", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const job = (await organization.collection("jobs").limit(1).get()).docs[0];
  await job.ref.collection("checklistRuns").doc("initial").set({ state: "DRAFT", synthetic: true });
  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  assert.equal(await count(), 10);
  const result = await clearDevCenterData.run(request());
  assert.equal(result.skippedBatches, 1);
  assert.equal((await job.ref.collection("checklistRuns").doc("initial").get()).exists, true);
  assert.equal(await count(), 10);
});

for (const [label, edit] of [
  ["prices", { clientPrice: 777, cleanerPayout: 123 }],
  ["notes", { notes: "Synthetic edited notes", guestName: "Synthetic guest" }],
]) {
  test(`editing seed ${label} without data.updatedAt protects the batch from reset and clear`, async () => {
    await generateDevCenterScenario.run(request({ scenario: "quick" }));
    const job = (await organization.collection("jobs").limit(1).get()).docs[0];
    assert.equal(Object.hasOwn(job.data(), "updatedAt"), false);
    await job.ref.update(edit);
    const edited = await job.ref.get();
    assert.equal(Object.hasOwn(edited.data(), "updatedAt"), false);
    assert.equal(edited.createTime.isEqual(edited.updateTime), false);

    await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
    assert.equal(await count(), 10);
    const result = await clearDevCenterData.run(request());
    assert.equal(result.skippedBatches, 1);
    assert.equal(result.deleted, 0);
    assert.equal(await count(), 10);
    assert.equal(await count("clients"), 1);
    assert.equal(await count("properties"), 3);
    assert.equal(await count("cleaners"), 3);
    const preserved = (await job.ref.get()).data();
    for (const [field, value] of Object.entries(edit)) assert.equal(preserved[field], value);
  });
}

for (const kind of ["offers", "assignments", "issues"]) {
  for (const spoofedMarker of [false, true]) {
    test(`manual Job ${kind} child protects its seeded Cleaner${spoofedMarker ? " even with spoofed seed markers" : ""}`, async () => {
      await generateDevCenterScenario.run(request({ scenario: "quick" }));
      const cleaner = (await organization.collection("cleaners").limit(1).get()).docs[0];
      const manual = organization.collection("jobs").doc("manual-synthetic-job");
      await manual.set({ operationalStatus: "OFFERED", name: "Synthetic surviving Job" });
      const child = manual.collection(kind).doc("synthetic-reference");
      const data = {
        jobId: manual.id,
        cleanerId: cleaner.id,
        ...(spoofedMarker ? {
          demoSeed: true,
          demoSeedBatch: cleaner.data().demoSeedBatch,
          demoSeedScenario: "quick",
          createdAt: cleaner.data().createdAt,
        } : {}),
      };
      await child.set(data);

      await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
      const result = await clearDevCenterData.run(request());
      assert.equal(result.skippedBatches, 1);
      assert.equal(result.deleted, 0);
      assert.equal(await count(), 11);
      assert.equal((await cleaner.ref.get()).exists, true);
      assert.equal((await manual.get()).exists, true);
      assert.deepEqual((await child.get()).data(), data);
    });
  }
}

test("surviving manual reference propagates protection across synthetic seed batches", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const client = (await organization.collection("clients").limit(1).get()).docs[0];
  const secondBatchProperty = organization.collection("properties").doc("synthetic-cross-batch-property");
  await secondBatchProperty.set({
    name: "Synthetic linked Property", clientId: client.id,
    demoSeed: true, demoSeedBatch: "dev-center-synthetic-reference-chain", demoSeedScenario: "quick",
    createdAt: client.data().createdAt,
  });
  const manual = organization.collection("jobs").doc("manual-synthetic-reference-chain");
  await manual.set({ propertyId: secondBatchProperty.id, operationalStatus: "UNASSIGNED" });

  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  const result = await clearDevCenterData.run(request());
  assert.equal(result.skippedBatches, 2);
  assert.equal(result.deleted, 0);
  assert.equal(await count(), 11);
  assert.equal((await secondBatchProperty.get()).exists, true);
  assert.equal((await client.ref.get()).exists, true);
  assert.equal((await manual.get()).exists, true);
});

test("unknown child collections with seed markers cannot be destructively cleared", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const job = (await organization.collection("jobs").limit(1).get()).docs[0];
  const child = job.ref.collection("syntheticUnknownHistory").doc("preserved");
  await child.set({
    demoSeed: true, demoSeedBatch: job.data().demoSeedBatch, demoSeedScenario: "quick",
    createdAt: job.data().createdAt, synthetic: true,
  });
  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  const result = await clearDevCenterData.run(request());
  assert.equal(result.skippedBatches, 1);
  assert.equal(result.deleted, 0);
  assert.equal((await child.get()).exists, true);
  assert.equal(await count(), 10);
});

test("manual unknown snapshot history preserves referenced seeds without guessing nested fields", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const property = (await organization.collection("properties").limit(1).get()).docs[0];
  const manual = organization.collection("jobs").doc("manual-synthetic-history");
  await manual.set({ operationalStatus: "ASSIGNED" });
  const run = manual.collection("checklistRuns").doc("initial");
  await run.set({ propertySnapshot: { propertyId: property.id }, state: "DRAFT", synthetic: true });
  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  const result = await clearDevCenterData.run(request());
  assert.equal(result.deleted, 0);
  assert.equal((await property.ref.get()).exists, true);
  assert.equal((await run.get()).exists, true);
});

test("missing Job parents with surviving children fail closed without recursive deletion", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const cleaner = (await organization.collection("cleaners").limit(1).get()).docs[0];
  const child = organization.collection("jobs").doc("missing-synthetic-parent").collection("offers").doc("surviving");
  await child.set({ cleanerId: cleaner.id, synthetic: true });
  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  const result = await clearDevCenterData.run(request());
  assert.equal(result.deleted, 0);
  assert.equal((await cleaner.ref.get()).exists, true);
  assert.equal((await child.get()).exists, true);
});

test("missing child documents with deeper history preserve the seed batch", async () => {
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  const job = (await organization.collection("jobs").limit(1).get()).docs[0];
  const evidence = job.ref.collection("offers").doc("missing-synthetic-child").collection("syntheticHistory").doc("preserved");
  await evidence.set({ synthetic: true });
  await assert.rejects(generateDevCenterScenario.run(request({ scenario: "quick", resetBaseline: true })), { code: "failed-precondition" });
  const result = await clearDevCenterData.run(request());
  assert.equal(result.deleted, 0);
  assert.equal((await job.ref.get()).exists, true);
  assert.equal((await evidence.get()).exists, true);
});

test("exact Sandbox guard is exercised with synthetic runtime identity over LOCAL emulator only", async () => {
  environment("synthetic-sandbox", false, "synthetic-sandbox");
  await generateDevCenterScenario.run(request({ scenario: "quick" }));
  assert.equal(await count(), 10);
  await clearDevCenterData.run(request());
  assert.equal(await count(), 0);
});
