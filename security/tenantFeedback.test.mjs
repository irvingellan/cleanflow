import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

assert.equal(process.env.GCLOUD_PROJECT, "demo-cleanflow");
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/, `Feedback tests require local ${name}`);
}
const { db } = await import("../functions/src/runtime/firebase.js");
const { defaultOrganizationId } = await import("../functions/src/runtime/organization.js");
const { githubFeedbackToken } = await import("../functions/src/runtime/params.js");
const { submitFeedback } = await import("../functions/src/index.js");

const organizations = [defaultOrganizationId, "test-" + randomUUID(), "test-" + randomUUID()];
const managers = new Map(organizations.map(org => [org, randomUUID()]));
const member = (org) => db.doc(`organizations/${org}/members/${managers.get(org)}`);
const reports = (org) => db.collection(`organizations/${org}/feedbackReports`);
const originalReport = reports(defaultOrganizationId).doc("test-" + randomUUID());
const input = { type: "bug", message: "  Synthetic note  ", screen: "Services", appVersion: "v1.0",
  viewport: { width: 375, height: 812 } };

before(async () => {
  const batch = db.batch();
  for (const org of organizations) batch.set(member(org), { role: "MANAGER", active: true });
  batch.set(originalReport, { status: "NEW", message: "Existing example" });
  await batch.commit();
});

after(async () => {
  await Promise.all([originalReport.delete(), member(defaultOrganizationId).delete(),
    ...organizations.slice(1).map(org => db.recursiveDelete(db.doc(`organizations/${org}`)))]);
});

function request(org, data = input) {
  const token = { email: "fixture-owner@example.invalid", firebase: { sign_in_provider: "password" } };
  if (org !== defaultOrganizationId) token.organizationId = org;
  return { auth: { uid: managers.get(org), token }, data };
}

// Detect changes to existing reports as well as writes to unexpected company paths.
async function versions(except) {
  const snapshot = await db.collectionGroup("feedbackReports").get();
  return snapshot.docs.filter(doc => doc.ref.parent.parent.id !== except)
    .map(doc => [doc.ref.path, doc.updateTime.toDate().toISOString(), doc.updateTime.nanoseconds]).sort();
}

test("additional companies keep feedback private and never contact the existing tracker", async t => {
  const secret = t.mock.method(githubFeedbackToken, "value", () => { throw Error("Unexpected tracker secret read"); });
  const network = t.mock.method(globalThis, "fetch", () => { throw Error("Unexpected feedback transport"); });
  for (const org of organizations.slice(1)) {
    const before = await versions(org);
    assert.deepEqual(await submitFeedback.run(request(org, { ...input, organizationId: defaultOrganizationId })), { submitted: true });
    const saved = await reports(org).get();
    assert.equal(saved.size, 1);
    const { createdAt, ...fields } = saved.docs[0].data();
    assert.ok(createdAt.isEqual(saved.docs[0].createTime));
    assert.deepEqual(fields, { message: "Synthetic note", screen: "Services", appVersion: "v1.0", viewport: "375 × 812",
      createdByUid: managers.get(org), status: "NEW" });
    assert.deepEqual(await versions(org), before);
  }
  assert.equal(secret.mock.callCount(), 0);
  assert.equal(network.mock.callCount(), 0);
});

test("feedback requires active manager membership before using either destination", async t => {
  const network = t.mock.method(globalThis, "fetch", () => { throw Error("Unexpected feedback transport"); });
  const secret = t.mock.method(githubFeedbackToken, "value", () => { throw Error("Unexpected tracker secret read"); });
  const before = await versions();
  for (const org of organizations) {
    const unassigned = request(org);
    unassigned.auth.uid = randomUUID();
    await assert.rejects(submitFeedback.run(unassigned), { code: "permission-denied" });
  }
  assert.deepEqual(await versions(), before);
  assert.equal(secret.mock.callCount(), 0);
  assert.equal(network.mock.callCount(), 0);
});

test("default feedback preserves the tracker payload, response and error codes", async t => {
  const before = await versions();
  const secret = t.mock.method(githubFeedbackToken, "value", () => "synthetic-test-value");
  const network = t.mock.method(globalThis, "fetch", async () => Response.json({ number: 1 }));
  const submit = (data = input) => submitFeedback.run(request(defaultOrganizationId, data));
  assert.deepEqual(await submit(), { submitted: true });
  assert.equal(network.mock.callCount(), 1);
  const [url, options] = network.mock.calls[0].arguments;
  assert.equal(url, "https://api.github.com/repos/irvingellan/cleanflow/issues");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer synthetic-test-value");
  const payload = JSON.parse(options.body);
  const submittedAt = payload.body.match(/Submitted at:\*\* (.+)/)?.[1];
  assert.equal(new Date(submittedAt).toISOString(), submittedAt);
  assert.deepEqual(payload, {
    title: "[Feedback] Problem / Bug · Services",
    body: [
      "## Feedback", "", "Synthetic note", "", "## Context", "", "- **Type:** Problem / Bug",
      "- **App version:** v1.0", "- **Screen:** Services", `- **Submitted at:** ${submittedAt}`,
      "- **Reporter:** fixture-owner@example.invalid", "- **Viewport:** 375 × 812", "- **Source:** CleanFlow in-app feedback",
    ].join("\n"),
  });
  await assert.rejects(submit({ ...input, type: "invalid" }), { code: "invalid-argument", message: "Feedback type is invalid." });
  await assert.rejects(submit({ ...input, message: " " }), { code: "invalid-argument", message: "Feedback message is invalid." });
  secret.mock.mockImplementation(() => "");
  await assert.rejects(submit(), { code: "failed-precondition", message: "Feedback submission is not configured." });
  assert.equal(network.mock.callCount(), 1);
  secret.mock.mockImplementation(() => "synthetic-test-value");
  network.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(submit(), { code: "internal", message: "Unable to submit feedback." });
  assert.equal(network.mock.callCount(), 2);
  assert.deepEqual(await versions(), before);
});
