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
  await call("RESOLVE", { propertyId: "house", expectedRevision: 0 });
  const results = await Promise.all(Array.from({ length: 4 }, () => call("PROMOTE", { confirmed: true, expectedRevision: 1 })));
  assert.equal(new Set(results.map(r => r.reservationId)).size, 1);
  assert.equal((await database.collection(`organizations/${org}/reservations`).get()).size, 1);
  assert.equal((await database.collection(`organizations/${org}/jobs`).get()).size, 0);
  assert.equal((await call("READ")).state, "PROMOTED");
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
