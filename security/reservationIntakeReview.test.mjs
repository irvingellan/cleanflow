import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
assert.equal(process.env.GCLOUD_PROJECT, "demo-cleanflow");
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { reviewReservationIntake } = await import("../functions/src/reservationIntakeReviewService.js");
const { normalizeReservationObservation } = await import("../functions/src/reservationIntake/reservationNormalizer.js");
const app = initializeApp({ projectId: "demo-cleanflow" });
const database = getFirestore(app);
const org = "synthetic-review-gate";
let rules;
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  rules = await initializeTestEnvironment({ projectId: "demo-cleanflow", firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") } });
  await database.doc(`organizations/${org}/members/manager`).set({ active: true, role: "MANAGER" });
  await database.doc(`organizations/${org}/properties/house`).set({ active: true, name: "Synthetic house" });
});
after(async () => { await rules?.cleanup(); await database.terminate(); await deleteApp(app); });
test("real Firestore transaction makes concurrent approvals exactly one durable Reservation, no Job", async () => {
  const observation = { sourceProvider: "HOSPITABLE", sourceType: "ICAL", sourceId: "synthetic-feed", sourceListingExternalId: "listing", sourceEventUid: "event",
    observedAt: "2026-10-05T12:00:00Z", checkIn: "2026-10-10", checkOut: "2026-10-12" };
  const candidate = await normalizeReservationObservation(observation, { organizationId: org });
  const call = (operation, extra = {}) => reviewReservationIntake(database, { auth: { uid: "manager", token: {} }, data: {
    operation, observation, candidateId: candidate.id, signal: "NEW", ...extra,
  } }, org);
  const counts = async () => ({ reservations: (await database.collection(`organizations/${org}/reservations`).get()).size,
    jobs: (await database.collection(`organizations/${org}/jobs`).get()).size,
    assignments: (await database.collectionGroup("assignments").get()).size,
    offers: (await database.collectionGroup("offers").get()).size,
    payouts: (await database.collection(`organizations/${org}/payouts`).get()).size });
  assert.deepEqual(await counts(), { reservations: 0, jobs: 0, assignments: 0, offers: 0, payouts: 0 });
  await assert.rejects(call("PROMOTE", { confirmed: true, expectedRevision: 0 }), error => error.details.reason === "property-unresolved");
  await call("RESOLVE", { propertyId: "house", expectedRevision: 0 });
  await assert.rejects(call("PROMOTE", { confirmed: true, expectedRevision: 0 }), error => error.details.reason === "review-changed-reload");
  await assert.rejects(call("PROMOTE", { confirmed: true, expectedRevision: 1, signal: "CONFLICT" }), error => error.details.reason === "external-state-needs-review");
  const results = await Promise.all(Array.from({ length: 4 }, () => call("PROMOTE", { confirmed: true, expectedRevision: 1 })));
  assert.equal(new Set(results.map(r => r.reservationId)).size, 1);
  assert.equal((await database.collection(`organizations/${org}/reservations`).get()).size, 1);
  assert.equal((await database.collection(`organizations/${org}/jobs`).get()).size, 0);
  assert.equal((await call("READ")).state, "PROMOTED");
  const before = (await database.doc(`organizations/${org}/reservations/${results[0].reservationId}`).get()).data();
  await call("PROMOTE", { confirmed: true, expectedRevision: 1 });
  for (const [signal, update] of [["DATES_CHANGED", { checkOut: "2026-10-14" }], ["STATUS_CHANGED", { sourceReservationStatus: "CANCELLED" }], ["SOURCE_DISAPPEARED", {}]]) {
    assert.equal((await call("READ", { signal, observation: { ...observation, ...update } })).discrepancy.reviewRequired, true);
    assert.deepEqual((await database.doc(`organizations/${org}/reservations/${results[0].reservationId}`).get()).data(), before);
  }
  assert.deepEqual(await counts(), { reservations: 1, jobs: 0, assignments: 0, offers: 0, payouts: 0 });
  const ignoredObservation = { ...observation, sourceEventUid: "synthetic-ignored" };
  const ignored = await normalizeReservationObservation(ignoredObservation, { organizationId: org });
  const ignoredCall = operation => call(operation, { observation: ignoredObservation, candidateId: ignored.id, expectedRevision: 0 });
  await ignoredCall("IGNORE");
  assert.equal((await ignoredCall("READ")).state, "IGNORED");
  await assert.rejects(ignoredCall("PROMOTE"), error => error.details.reason === "ignored");
  console.log("SYNTHETIC_ACCEPTANCE: Reservation 0→1→1; Job/Assignment/Offer/Payout 0→0→0; changes/cancel/missing unchanged; ignore reload durable.");
  assert.equal((await database.collection(`organizations/${org}/reservationIntakeReviews/${candidate.id}/history`).get()).size, 2);
  const client = rules.authenticatedContext("manager").firestore();
  await assertFails(getDoc(doc(client, `organizations/${org}/reservations/${results[0].reservationId}`)));
  await assertFails(setDoc(doc(client, `organizations/${org}/reservations/forbidden`), { status: "ACTIVE" }));
  await assert.rejects(reviewReservationIntake(database, { auth: { uid: "unprivileged", token: {} }, data: {} }, org), error => error.code === "permission-denied");
});

test("actual demo cleanup preserves Reservation references while deleting an unrelated untouched batch", async () => {
  process.env.FUNCTIONS_EMULATOR = "true";
  process.env.DEV_CENTER_DEVELOPER_UIDS = "synthetic-developer";
  const { clearDevCenterData } = await import("../functions/src/index.js");
  const root = "organizations/cleanflow-demo";
  await database.doc(`${root}/properties/protected-house`).set({ demoSeed: true, demoSeedBatch: "dev-center-protected", clientId: "protected-client" });
  await database.doc(`${root}/clients/protected-client`).set({ demoSeed: true, demoSeedBatch: "dev-center-client" });
  await database.doc(`${root}/clients/untouched`).set({ demoSeed: true, demoSeedBatch: "dev-center-untouched" });
  await database.doc(`${root}/reservations/approved`).set({ propertyId: "protected-house", dataProvenance: "DEMO" });
  await clearDevCenterData.run({ auth: { uid: "synthetic-developer" } });
  assert.equal((await database.doc(`${root}/properties/protected-house`).get()).exists, true);
  assert.equal((await database.doc(`${root}/clients/protected-client`).get()).exists, true);
  assert.equal((await database.doc(`${root}/clients/untouched`).get()).exists, false);
  assert.equal((await database.doc(`${root}/reservations/approved`).get()).exists, true);
});
