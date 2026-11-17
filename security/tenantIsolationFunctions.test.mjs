import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { syntheticChecklistPng } from "./syntheticChecklistImages.mjs";

// Tenant isolation of the Functions: every callable and every public endpoint is
// confined to the caller's organization. Two complete, independent organizations
// are built through the real Functions, then each one is attacked from the other.
// Local, disposable emulators only: fail before loading the Admin SDK otherwise.
assert.equal(process.env.GCLOUD_PROJECT, "demo-cleanflow", "Functions isolation tests require the demo project");
const ports = {};
for (const [name, variable] of Object.entries({
  firestore: "FIRESTORE_EMULATOR_HOST", auth: "FIREBASE_AUTH_EMULATOR_HOST", storage: "FIREBASE_STORAGE_EMULATOR_HOST",
})) {
  const match = /^127\.0\.0\.1:(\d{4,5})$/.exec(process.env[variable] || "");
  assert.ok(match, `Functions isolation tests require a local ${variable}`);
  ports[name] = Number(match[1]);
}
process.env.AUTOMATIC_OFFERS_MODE = "enabled";
process.env.CLEANER_PUSH_MODE = "enabled";
process.env.DEV_CENTER_DEVELOPER_UIDS = "developer";

const functionsIndex = await import("../functions/src/index.js");
// index.js only declares Functions; the Functions Admin app starts with the runtime module.
await import("../functions/src/runtime/firebase.js");
const functionsRequire = createRequire(new URL("../functions/src/index.js", import.meta.url));
const { getFirestore, Timestamp } = functionsRequire("firebase-admin/firestore");
const { getStorage } = functionsRequire("firebase-admin/storage");
const { recordCleanerJobInboxEvents, recordCleanerOfferInboxEvent } = await import("../functions/src/cleanerNotificationEvents.js");
const { localDateKey } = await import("../functions/src/managerReminders.js");
const admin = getFirestore();

const defaultOrganization = "cleanflow-demo";
const organizations = ["org-a", "org-b"];
const pairs = [["org-a", "org-b"], ["org-b", "org-a"]];
let environment;
const state = {};

// Each test registers the Functions it proves; the last test checks none is missing.
const covered = new Set();
function covers(...names) { for (const name of names) covered.add(name); }

function dateKey(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

/** Every identifier of one organization. Nothing is shared between organizations. */
function ids(org) {
  const letter = org === defaultOrganization ? "d" : org.slice(-1);
  return {
    org, letter, root: `organizations/${org}`, manager: `manager-${letter}`, cleaner: `cleaner-${letter}`,
    client: `client-${letter}`, property: `house-${letter}`, job: `job-${letter}`, openJob: `open-job-${letter}`,
    offerJob: `offer-job-${letter}`, planJob: `plan-job-${letter}`, title: `House ${letter.toUpperCase()}`,
    owner: `Owner ${letter.toUpperCase()}`, cleanerName: `Cleaner ${letter.toUpperCase()}`,
    note: `Note from house ${letter.toUpperCase()}`,
    offerToken: Buffer.alloc(32, letter.charCodeAt(0)).toString("base64url"),
    managerDevice: { deviceId: `11111111-1111-4111-8111-11111111111${letter}`, token: `synthetic-never-sent-manager-token-${letter}-000000` },
    cleanerDevice: {
      deviceId: `synthetic-cleaner-installation-${letter}`, token: `synthetic-never-sent-cleaner-token-${letter}-000000`,
      platform: "android", permission: "granted", language: "en",
    },
  };
}

function managerRequest(org, data, { claim = org === defaultOrganization ? null : org } = {}) {
  return {
    auth: { uid: ids(org).manager, token: { firebase: { sign_in_provider: "password" }, ...(claim ? { organizationId: claim } : {}) } },
    data,
  };
}
function cleanerRequest(org, data, forgedClaims) {
  const session = state[org].session;
  return {
    auth: { uid: session.uid, token: { firebase: { sign_in_provider: "custom" }, cleanerHub: { ...session.cleanerHub, ...forgedClaims } } },
    data,
  };
}
function publicResponse() {
  return {
    code: 200, headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
    end() { return this; },
  };
}
async function publicCall(name, request) {
  const response = publicResponse();
  await functionsIndex[name]({ get() { return undefined; }, query: {}, ...request }, response);
  return response;
}
const publicChecklistGet = (token, query = {}) => publicCall("publicChecklist", { method: "GET", query: { token, ...query } });
const publicChecklistSave = (body) => publicCall("publicChecklist", { method: "POST", body });
const publicChecklistUpload = (token, requirementId, bytes, query = {}) => publicCall("publicChecklist", {
  method: "PUT", query: { token, ...query }, rawBody: bytes,
  get(header) {
    if (header === "X-CleanFlow-Checklist-Item") return requirementId;
    return header === "Content-Type" ? "image/png" : undefined;
  },
});
const publicReportGet = (token, query = {}) => publicCall("publicClientReport", { method: "GET", query: { token, ...query } });
const publicPortalGet = (token, query = {}) => publicCall("publicClientPortal", { method: "GET", query: { token, ...query } });
const publicOfferGet = (token) => publicCall("publicOffer", { method: "GET", query: { token } });
const publicOfferPost = (body) => publicCall("publicOffer", { method: "POST", body });

/** Runs a callable and reports how it ended, so one row can state every expected ending. */
async function outcome(name, request) {
  try {
    return { ok: true, value: await functionsIndex[name].run(request) };
  } catch (error) {
    return { ok: false, code: error?.code ?? `threw:${error?.message}` };
  }
}
const describeOutcome = (result) => result.ok ? `returned ${JSON.stringify(result.value)?.slice(0, 300)}` : `was refused with ${result.code}`;

/** Nothing that identifies the other organization may appear in what a caller receives. */
function assertRevealsNothing(value, other, label) {
  const text = Buffer.isBuffer(value) ? value.toString("base64") : JSON.stringify(value ?? null);
  const x = ids(other);
  const secrets = [other, x.manager, x.cleaner, x.client, x.property, x.job, x.openJob, x.offerJob, x.planJob, x.title, x.owner,
    x.cleanerName, x.note, x.managerDevice.deviceId, x.managerDevice.token, x.cleanerDevice.deviceId, x.cleanerDevice.token,
    ...(state[other]?.inboxIds ?? []), state[other]?.session?.uid, state[other]?.photoBase64].filter(Boolean);
  for (const secret of secrets) assert.equal(text.includes(secret), false, `${label}: the response carries "${secret}" of ${other}`);
}

/**
 * `expected` is an error code, or a check of a returned value that must reveal
 * nothing of the other organization.
 */
async function expectEnding(name, request, expected, label, context = {}) {
  const result = await outcome(name, request);
  if (typeof expected === "string") {
    assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: expected }, `${name}, ${label}: ${describeOutcome(result)}`);
    return result;
  }
  assert.equal(result.ok, true, `${name}, ${label}: ${describeOutcome(result)}`);
  if (context.other) assertRevealsNothing(result.value, context.other, `${name}, ${label}`);
  expected(result.value, context);
  return result;
}

/**
 * The same request with the other organization's ID added to its data. A handler
 * must never take the organization from the request: the call ends exactly as it
 * does without the extra field, or is refused as an invalid request.
 */
async function expectInjectionIgnored(name, request, other, expected, label, context) {
  const injected = { ...request, data: { ...request.data, organizationId: other } };
  const result = await outcome(name, injected);
  if (result.ok === false && result.code === "invalid-argument") return;
  await expectEnding(name, injected, expected, label, context);
}

/** Builds one organization the way a real company would: through the Functions, as its own manager. */
async function buildOrganization(org) {
  const x = ids(org);
  const built = { ids: x };
  state[org] = built;
  const base = admin.batch();
  const set = (path, data) => base.set(admin.doc(`${x.root}/${path}`), data);
  set(`members/${x.manager}`, { role: "MANAGER", active: true });
  set(`clients/${x.client}`, { organizationId: org, name: x.owner, active: true });
  set(`properties/${x.property}`, { organizationId: org, clientId: x.client, clientName: x.owner, name: x.title, active: true });
  set(`cleaners/${x.cleaner}`, { organizationId: org, name: x.cleanerName, active: true, preferredLanguage: "en" });
  const job = {
    organizationId: org, schemaVersion: 2, checklistContextRevision: 1, scheduleRevision: 0, propertyId: x.property,
    propertyName: x.title, clientId: x.client, clientName: x.owner, scheduledDate: dateKey(1), scheduledStart: "10:30",
    clientPrice: 900, cleanerPayout: 250,
  };
  const assignment = (jobId) => ({
    organizationId: org, jobId, cleanerId: x.cleaner, cleanerNameSnapshot: x.cleanerName, isActive: true, executionStatus: "ASSIGNED",
  });
  set(`jobs/${x.job}`, { ...job, operationalStatus: "ASSIGNED", assignedCleanerIds: [x.cleaner] });
  set(`jobs/${x.job}/assignments/assignment-${x.letter}`, assignment(x.job));
  set(`jobs/${x.planJob}`, { ...job, operationalStatus: "ASSIGNED", assignedCleanerIds: [x.cleaner] });
  set(`jobs/${x.planJob}/assignments/assignment-${x.letter}`, assignment(x.planJob));
  set(`jobs/${x.openJob}`, { ...job, operationalStatus: "UNASSIGNED", assignedCleanerIds: [] });
  set(`jobs/${x.offerJob}`, { ...job, operationalStatus: "OFFERED", assignedCleanerIds: [] });
  set(`jobs/${x.offerJob}/offers/${x.cleaner}`, {
    organizationId: org, cleanerId: x.cleaner, cleanerName: x.cleanerName, status: "PENDING",
    publicOfferTokenHash: createHash("sha256").update(x.offerToken).digest("hex"),
    publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
  });
  await base.commit();

  const call = async (name, data) => functionsIndex[name].run(managerRequest(org, data));
  built.managerDevice = await call("registerManagerPushDevice", { ...x.managerDevice, language: "en" });
  // The default organization only needs to exist, with its own manager and device.
  if (org === defaultOrganization) return built;

  await call("createChecklistRun", { jobId: x.job });
  const checklist = await call("issueChecklistCapability", { jobId: x.job, cleanerId: x.cleaner });
  built.checklistToken = checklist.token;
  built.photo = syntheticChecklistPng(x.letter.charCodeAt(0));
  built.photoBase64 = built.photo.toString("base64");
  const upload = await publicChecklistUpload(checklist.token, "living-belongings", built.photo);
  assert.equal(upload.code, 200, `photo upload for ${org}`);
  const run = (await admin.doc(`${x.root}/jobs/${x.job}/checklistRuns/initial`).get()).data();
  const saved = await publicChecklistSave({
    token: checklist.token, mutationId: `isolation-draft-${x.letter}-0001`, baseRevision: 0,
    changes: {
      checklistAnswers: Object.fromEntries(run.resolvedDefinition.sections.flatMap((section) => section.items.map((item) => [item.id, "DONE"]))),
      inventoryAnswers: Object.fromEntries(run.resolvedDefinition.inventoryItems.map((item) => [item.id, "HIGH"])),
      issueNotes: "", generalNotes: x.note,
    },
  });
  assert.equal(saved.code, 200, `checklist draft for ${org}`);
  const ready = await publicChecklistSave({
    token: checklist.token, action: "READY_FOR_REVIEW", submissionId: `isolation-review-${x.letter}-0001`, baseRevision: 1,
  });
  assert.equal(ready.code, 200, `ready for review for ${org}`);
  built.reportToken = (await call("createClientReport", { jobId: x.job })).token;
  built.portalToken = (await call("clientPortalAccess", { clientId: x.client, action: "issue" })).access.token;

  const { code } = await call("issueCleanerAccessCode", { cleanerId: x.cleaner });
  const { token } = await functionsIndex.redeemCleanerAccessCode.run({ data: { code } });
  const jwt = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  built.session = { uid: jwt.uid, cleanerHub: jwt.claims.cleanerHub };
  built.cleanerDevice = await functionsIndex.registerCleanerPushDevice.run(cleanerRequest(org, x.cleanerDevice));

  // The inbox items the Firestore triggers would write: a new offer and a reschedule prompt.
  const offer = await admin.doc(`${x.root}/jobs/${x.offerJob}/offers/${x.cleaner}`).get();
  await recordCleanerOfferInboxEvent(admin, { organizationId: org, jobId: x.offerJob, offerId: x.cleaner, before: null, after: offer });
  const planJob = admin.doc(`${x.root}/jobs/${x.planJob}`);
  const beforeReschedule = await planJob.get();
  const rescheduled = await call("rescheduleJob", { jobId: x.planJob, scheduledDate: dateKey(2), scheduledStart: "09:00" });
  await recordCleanerJobInboxEvents(admin, {
    organizationId: org, jobId: x.planJob, before: beforeReschedule, after: await planJob.get(),
    eventId: `${x.planJob}-revision-${rescheduled.scheduleRevision}`,
  });
  const inbox = await functionsIndex.listNotificationInbox.run(cleanerRequest(org, { role: "CLEANER" }));
  built.offerNoticeId = inbox.items.find(({ type }) => type === "NEW_OFFER").id;
  const prompt = inbox.items.find(({ type }) => type === "RESCHEDULED");
  built.reschedule = { eventId: prompt.id, scheduleRevision: rescheduled.scheduleRevision };
  built.managerNoticeId = (await admin.collection(`${x.root}/managerNotificationInbox`).get()).docs[0].id;
  built.inboxIds = [...inbox.items.map(({ id }) => id), built.managerNoticeId];
  const photos = (await admin.doc(`${x.root}/jobs/${x.job}/checklistRuns/initial/evidenceState/current`).get()).data().photos;
  built.photoId = photos[0].id ?? photos[0].evidenceId;
  return built;
}

/** Every document in the database, including the ones that only exist as parents. */
async function allDocuments() {
  const documents = [];
  async function walk(collection) {
    await Promise.all((await collection.listDocuments()).map(async (reference) => {
      documents.push(await reference.get());
      await Promise.all((await reference.listCollections()).map(walk));
    }));
  }
  await Promise.all((await admin.listCollections()).map(walk));
  return documents;
}
async function storedFiles() {
  const [files] = await getStorage().bucket().getFiles();
  return Object.fromEntries(files.map((file) => [file.name, `${file.metadata.generation}:${file.metadata.md5Hash}`]));
}

/**
 * A fingerprint of every document and stored file, optionally leaving out one
 * organization's own records. Any write at all changes it.
 */
async function everything({ except } = {}) {
  const result = {};
  for (const snapshot of await allDocuments()) {
    const { path } = snapshot.ref;
    if (except && (path === `organizations/${except}` || path.startsWith(`organizations/${except}/`)
      || (!path.startsWith("organizations/") && snapshot.data()?.organizationId === except))) continue;
    result[path] = snapshot.exists
      ? `${snapshot.updateTime.seconds}.${snapshot.updateTime.nanoseconds}:${createHash("sha256").update(JSON.stringify(snapshot.data())).digest("hex")}`
      : "no document, only children";
  }
  for (const [name, version] of Object.entries(await storedFiles())) {
    if (!except || !name.startsWith(`organizations/${except}/`)) result[`storage:${name}`] = version;
  }
  return result;
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-cleanflow",
    firestore: { host: "127.0.0.1", port: ports.firestore, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: ports.storage, rules: await readFile("storage.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });

// The organizations are built once through the real Functions. Before every later
// test the same documents are written back, so each test starts from that exact state.
let baseline = null;
beforeEach(async () => {
  await environment.clearFirestore();
  if (baseline && JSON.stringify(await storedFiles()) === baseline.files) {
    const writer = admin.bulkWriter();
    for (const [path, data] of baseline.documents) writer.set(admin.doc(path), data);
    await writer.close();
    return;
  }
  await environment.clearStorage();
  await fetch(`http://127.0.0.1:${ports.auth}/emulator/v1/projects/demo-cleanflow/accounts`, { method: "DELETE" });
  await Promise.all([defaultOrganization, ...organizations].map(buildOrganization));
  baseline = {
    documents: (await allDocuments()).filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.ref.path, snapshot.data()]),
    files: JSON.stringify(await storedFiles()),
  };
});

// ---------------------------------------------------------------------------
// Callables. One row per request. `data` builds the request for the records of
// one organization. In an attack, the caller belongs to the OTHER organization.
//   cross   how the call ends when the caller's own organization is selected and
//           the IDs exist only in the other one: an error code, or a check of a
//           returned value (which must reveal nothing of the other organization).
//   control how the same request ends for the rightful organization: "ok" (and
//           `shows` checks it is that organization's data), "state" (accepted
//           as that organization's, then refused only for the record's state),
//           or "none" where the row says why.
// ---------------------------------------------------------------------------
const nothingFound = (field) => (value) => assert.deepEqual(value[field], { state: "NONE" });
const managerRows = [
  { name: "registerManagerPushDevice", data: (x) => ({ ...x.managerDevice, language: "en" }), cross: "permission-denied",
    shows: (value) => assert.equal(value.registered, true) },
  { name: "deactivateManagerPushDevice",
    data: (x, s) => ({ ...x.managerDevice, registrationRevision: s.managerDevice.registrationRevision }),
    cross: (value) => assert.deepEqual(value, { deactivated: false }), shows: (value) => assert.deepEqual(value, { deactivated: true }) },
  { name: "createChecklistRun", data: (x) => ({ jobId: x.job }), cross: "not-found", shows: (value, x) => assert.equal(value.run.jobId, x.job) },
  { name: "getChecklistRun", data: (x) => ({ jobId: x.job }), cross: "not-found", shows: (value, x) => assert.equal(value.run.jobId, x.job) },
  { name: "submitChecklistRunForReview", data: (x) => ({ jobId: x.job, baseRevision: 1 }), cross: "not-found",
    shows: (value) => assert.equal(value.status, "READY_FOR_REVIEW") },
  { name: "approveChecklistRun", data: (x) => ({ jobId: x.job }), cross: "not-found", shows: (value) => assert.equal(value.completed, true) },
  { name: "createAutomaticJobOffers", data: (x) => ({ jobId: x.openJob, cleanerIds: [x.cleaner] }), cross: "not-found",
    shows: (value, x) => assert.deepEqual(value, { jobId: x.openJob, count: 1 }) },
  { name: "assignCleanerDirectly", data: (x) => ({ jobId: x.openJob, cleanerId: x.cleaner }), cross: "not-found",
    shows: (value, x) => assert.deepEqual(value.assignedCleanerIds, [x.cleaner]) },
  // No vacancy was opened by a declined reschedule, so the rightful manager is refused for the Job's state.
  { name: "createManualReplacementOffer", data: (x) => ({ jobId: x.planJob, cleanerId: x.cleaner, scheduleRevision: 1 }),
    cross: "not-found", control: "state" },
  // The Assignment was made directly, not by an automatic offer.
  { name: "removeAutomaticCleanerAssignment", data: (x) => ({ jobId: x.job, assignmentId: `assignment-${x.letter}` }),
    cross: "not-found", control: "state" },
  // A Job without a cleaner cannot be completed.
  { name: "completeJobWithoutChecklist", data: (x) => ({ jobId: x.openJob }), cross: "not-found", control: "state" },
  // The checklist was already sent for review.
  { name: "abandonChecklistRunAndCompleteJob", data: (x) => ({ jobId: x.job }), cross: "not-found", control: "state" },
  { name: "rescheduleJob",
    data: (x) => ({ jobId: x.openJob, scheduledDate: dateKey(3), scheduledStart: "11:00", expectedScheduleRevision: 0 }),
    cross: "not-found", shows: (value, x) => assert.equal(value.jobId, x.openJob) },
  { name: "getChecklistCapability", data: (x) => ({ jobId: x.job }), cross: "not-found",
    shows: (value, x) => assert.equal(value.capability.cleanerId, x.cleaner) },
  // Issued for each organization while it was built; the checklist has since been sent for review.
  { name: "issueChecklistCapability", data: (x) => ({ jobId: x.job, cleanerId: x.cleaner }), cross: "not-found", control: "state" },
  { name: "revokeChecklistCapability", data: (x) => ({ jobId: x.job }), cross: "not-found",
    shows: (value) => assert.equal(value.capability.state, "REVOKED") },
  { name: "getJobPhotoCounts", data: (x) => ({ jobIds: [x.job] }), cross: (value) => assert.deepEqual(value, { counts: {} }),
    shows: (value, x) => assert.equal(value.counts[x.job].photoCount, 1) },
  { name: "getChecklistEvidence", data: (x) => ({ jobId: x.job, requirementId: "living-belongings" }), cross: "not-found",
    shows: (value, x, s) => assert.equal(value.base64, s.photoBase64) },
  { name: "getClientReportCapability", data: (x) => ({ jobId: x.job }), cross: "not-found",
    shows: (value) => assert.equal(value.capability.state, "ACTIVE") },
  { name: "setReportPhotoVisibility", data: (x, s) => ({ jobId: x.job, evidenceId: s.photoId, hidden: true, reason: "Synthetic reason" }),
    cross: "not-found", shows: (value, x, s) => assert.deepEqual(value, { evidenceId: s.photoId, hidden: true }) },
  { name: "correctChecklistAnswer",
    data: (x) => ({ jobId: x.job, kind: "inventory", itemId: "hand-soap", answer: { level: "LOW", quantity: 2 } }),
    cross: "not-found", shows: (value) => assert.equal(value.corrected, true) },
  { name: "createClientReport", data: (x) => ({ jobId: x.job, replaceExisting: true }), cross: "not-found",
    shows: (value) => assert.equal(value.created, true) },
  { name: "revokeClientReport", data: (x) => ({ jobId: x.job }), cross: nothingFound("capability"),
    shows: (value) => assert.equal(value.capability.state, "REVOKED") },
  { name: "clientPortalAccess", label: "get", data: (x) => ({ clientId: x.client, action: "get" }), cross: nothingFound("access"),
    shows: (value) => assert.equal(value.access.state, "ACTIVE") },
  { name: "clientPortalAccess", label: "issue", data: (x) => ({ clientId: x.client, action: "issue" }), cross: "failed-precondition",
    shows: (value) => assert.equal(typeof value.access.token, "string") },
  { name: "clientPortalAccess", label: "revoke", data: (x) => ({ clientId: x.client, action: "revoke" }), cross: nothingFound("access"),
    shows: (value) => assert.equal(value.access.state, "REVOKED") },
  { name: "issueCleanerAccessCode", data: (x) => ({ cleanerId: x.cleaner, additionalDevice: true }), cross: "failed-precondition",
    shows: (value) => assert.equal(typeof value.code, "string") },
  // Revoking an unknown cleaner records the revocation in the caller's own organization only.
  { name: "revokeCleanerHubAccess", data: (x) => ({ cleanerId: x.cleaner }), writesOwn: true,
    cross: (value) => assert.deepEqual(value, { active: false }),
    shows: async (value, x) => {
      assert.deepEqual(value, { active: false });
      const afterwards = await outcome("listNotificationInbox", cleanerRequest(x.org, { role: "CLEANER" }));
      assert.equal(afterwards.code, "permission-denied", "the revoked cleaner's session stops working");
    } },
  // A cleaner session may only test her own phone, so a forged cleaner session is refused as an invalid request.
  { name: "cleanerPushTest", label: "overview", data: (x) => ({ action: "overview", cleanerId: x.cleaner }), asCleaner: "invalid-argument",
    cross: (value) => assert.equal(value.activeDevices, 0), shows: (value) => assert.equal(value.activeDevices, 1) },
  // A rightful send waits for the delivery trigger, which does not run here; the overview row is the control of this handler.
  { name: "cleanerPushTest", label: "send", data: (x) => ({ action: "send", cleanerId: x.cleaner }), asCleaner: "invalid-argument",
    cross: (value) => assert.deepEqual(value, { state: "no-devices" }), control: "none" },
  { name: "listNotificationInbox", data: () => ({ role: "MANAGER" }),
    cross: (value, { own }) => assert.deepEqual(value.items.map(({ id }) => id), [state[own].managerNoticeId]),
    shows: (value, x, s) => assert.deepEqual(value.items.map(({ id }) => id), [s.managerNoticeId]) },
  { name: "markNotificationRead", data: (x, s) => ({ role: "MANAGER", id: s.managerNoticeId }), cross: "not-found",
    shows: (value) => assert.deepEqual(value, { state: "read" }) },
  { name: "openNotificationInboxItem", data: (x, s) => ({ role: "MANAGER", id: s.managerNoticeId }),
    cross: (value) => assert.deepEqual(value, { state: "unavailable", destination: null }),
    shows: (value, x) => assert.deepEqual(value, { state: "opened", destination: { kind: "JOB", jobId: x.job } }) },
];

const cleanerRows = [
  { name: "openMyChecklist", data: (x) => ({ jobId: x.job }), cross: (value) => assert.deepEqual(value, { state: "unavailable" }),
    shows: (value) => assert.equal(value.state, "submitted") },
  { name: "getMyJobAccess", data: (x) => ({ jobId: x.job }), cross: (value) => assert.deepEqual(value, { state: "denied" }),
    shows: (value) => assert.notEqual(value.state, "denied") },
  { name: "respondToMyOffer", data: (x) => ({ jobId: x.offerJob, status: "INTERESTED", scheduleRevision: 0 }),
    cross: (value) => assert.deepEqual(value, { state: "unavailable", status: null }),
    shows: (value) => assert.deepEqual(value, { state: "answered", status: "INTERESTED" }) },
  { name: "respondToMyReschedule", data: (x, s) => ({ ...s.reschedule, decision: "CONFIRMED" }), cross: "permission-denied",
    shows: (value, x, s) => assert.deepEqual(value, { state: "CONFIRMED", scheduleRevision: s.reschedule.scheduleRevision }) },
  // The request carries the other organization's phone: its installation ID and its push token.
  { name: "registerCleanerPushDevice", data: (x) => x.cleanerDevice, cross: "permission-denied",
    shows: (value) => assert.equal(value.registered, true) },
  { name: "deactivateCleanerPushDevice",
    data: (x, s) => ({ deviceId: x.cleanerDevice.deviceId, token: x.cleanerDevice.token, registrationRevision: s.cleanerDevice.registrationRevision, reason: "SIGNED_OUT" }),
    cross: (value) => assert.deepEqual(value, { deactivated: false }), shows: (value) => assert.deepEqual(value, { deactivated: true }) },
  { name: "getCleanerPushDeviceStatus", data: (x) => ({ deviceId: x.cleanerDevice.deviceId }),
    cross: (value) => assert.notEqual(value.state, "active"), shows: (value) => assert.equal(value.state, "active") },
  // The request names no record, and a rightful send waits for the delivery trigger, which does not run here.
  { name: "cleanerPushTest", label: "own phone", data: () => ({ action: "send" }), cross: null, control: "none" },
  { name: "listNotificationInbox", data: () => ({ role: "CLEANER" }),
    cross: (value, { own }) => assert.deepEqual(value.items.map(({ id }) => id).sort(), [state[own].offerNoticeId, state[own].reschedule.eventId].sort()),
    shows: (value, x, s) => assert.deepEqual(value.items.map(({ id }) => id).sort(), [s.offerNoticeId, s.reschedule.eventId].sort()) },
  { name: "markNotificationRead", data: (x, s) => ({ role: "CLEANER", id: s.offerNoticeId }), cross: "not-found",
    shows: (value) => assert.deepEqual(value, { state: "read" }) },
  { name: "openNotificationInboxItem", data: (x, s) => ({ role: "CLEANER", id: s.offerNoticeId }),
    cross: (value) => assert.deepEqual(value, { state: "unavailable", destination: null }),
    shows: (value) => assert.equal(value.state, "opened") },
];

const rowTitle = (row) => `${row.name}${row.label ? ` (${row.label})` : ""}`;

/** The rightful organization is accepted: it succeeds, or is refused only for the record's own state. */
async function expectControl(row, org, request) {
  if (row.control === "none") return;
  const result = await outcome(row.name, request);
  if (row.control === "state") {
    assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: "failed-precondition" },
      `${rowTitle(row)}, rightful ${org}: ${describeOutcome(result)}`);
    return;
  }
  assert.equal(result.ok, true, `${rowTitle(row)}, rightful ${org}: ${describeOutcome(result)}`);
  await row.shows(result.value, ids(org), state[org]);
}

for (const row of managerRows) {
  covers(row.name);
  test(`manager callable ${rowTitle(row)} is confined to the caller's organization`, async () => {
    for (const [own, other] of pairs) {
      const data = await row.data(ids(other), state[other]);
      const scope = row.writesOwn ? { except: own } : {};
      const before = await everything(scope);
      // Without a claim the default organization is selected, and the caller is not one of its managers.
      await expectEnding(row.name, managerRequest(own, data, { claim: null }), "permission-denied", `${own} manager without a claim`);
      await expectEnding(row.name, managerRequest(own, data), row.cross, `${own} manager on ${other} records`, { own, other });
      await expectInjectionIgnored(row.name, managerRequest(own, data), other, row.cross, `${own} manager naming ${other} in the request`, { own, other });
      // A claim only selects the organization; the membership document still authorizes.
      await expectEnding(row.name, managerRequest(own, data, { claim: other }), "permission-denied", `${own} manager with a forged ${other} claim`);
      await expectEnding(row.name, cleanerRequest(own, data, { organizationId: other }), row.asCleaner ?? "permission-denied",
        `${own} cleaner with a forged ${other} claim`);
      assert.deepEqual(await everything(scope), before, `${rowTitle(row)}: nothing may change`);
    }
    for (const org of organizations) await expectControl(row, org, managerRequest(org, await row.data(ids(org), state[org])));
  });
}

for (const row of cleanerRows) {
  covers(row.name);
  test(`cleaner callable ${rowTitle(row)} is confined to the caller's organization`, async () => {
    for (const [own, other] of pairs) {
      const data = await row.data(ids(other), state[other]);
      const before = await everything();
      if (row.cross) {
        await expectEnding(row.name, cleanerRequest(own, data), row.cross, `${own} cleaner on ${other} records`, { own, other });
        await expectInjectionIgnored(row.name, cleanerRequest(own, data), other, row.cross, `${own} cleaner naming ${other} in the request`, { own, other });
      }
      await expectEnding(row.name, cleanerRequest(own, data, { organizationId: other }), "permission-denied",
        `${own} cleaner with a forged ${other} organization`);
      // Even the other cleaner's exact claims are useless on another account.
      await expectEnding(row.name, cleanerRequest(own, data, state[other].session.cleanerHub), "permission-denied",
        `${own} cleaner with the ${other} cleaner's claims`);
      assert.deepEqual(await everything(), before, `${rowTitle(row)}: nothing may change`);
    }
    for (const org of organizations) await expectControl(row, org, cleanerRequest(org, await row.data(ids(org), state[org])));
  });
}

// ---------------------------------------------------------------------------
// Functions with their own shape.
// ---------------------------------------------------------------------------
covers("submitFeedback");
test("submitFeedback refuses anyone who is not a manager of the selected organization", async () => {
  // A rightful call would reach the external tracker, so only the refusals are exercised here.
  const data = { type: "suggestion", message: "Synthetic feedback" };
  const before = await everything();
  for (const [own, other] of pairs) {
    await expectEnding("submitFeedback", managerRequest(own, data, { claim: null }), "permission-denied", `${own} manager without a claim`);
    await expectEnding("submitFeedback", managerRequest(own, data, { claim: other }), "permission-denied", `${own} manager with a forged claim`);
    await expectEnding("submitFeedback", cleanerRequest(own, data), "permission-denied", `${own} cleaner`);
  }
  assert.deepEqual(await everything(), before);
});

covers("redeemCleanerAccessCode");
test("an access code signs a cleaner into the organization that issued it, and nowhere else", async () => {
  for (const [own, other] of pairs) {
    const x = ids(own);
    const { code } = await functionsIndex.issueCleanerAccessCode.run(managerRequest(own, { cleanerId: x.cleaner, additionalDevice: true }));
    const before = await everything({ except: own });
    const { token } = await functionsIndex.redeemCleanerAccessCode.run({ data: { code } });
    const jwt = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    assert.equal(jwt.uid, state[own].session.uid);
    assert.deepEqual({ organizationId: jwt.claims.cleanerHub.organizationId, cleanerId: jwt.claims.cleanerHub.cleanerId },
      { organizationId: own, cleanerId: x.cleaner });
    assert.notEqual(jwt.uid, state[other].session.uid);
    await assert.rejects(functionsIndex.redeemCleanerAccessCode.run({ data: { code } }), "a code works once");
    assert.deepEqual(await everything({ except: own }), before, `redeeming a ${own} code changes nothing outside ${own}`);
  }
});

covers("publicChecklist", "publicClientReport", "publicClientPortal", "publicOffer");
for (const [own, other] of pairs) {
  test(`public links of ${own} return and change only ${own}`, async () => {
    const x = ids(own);
    const s = state[own];
    const theirs = ids(other);
    // The client portal opens the reports of services up to today.
    await admin.doc(`${x.root}/jobs/${x.job}`).update({ scheduledDate: dateKey(-1) });
    const before = await everything({ except: own });
    const mine = (response, label) => {
      assert.equal(response.code, 200, `${label}: ${JSON.stringify(response.body)}`);
      assert.ok(JSON.stringify(response.body).includes(x.title), `${label} shows ${x.title}`);
      assertRevealsNothing(response.body, other, label);
    };

    // Checklist: the token alone selects the record; injected identifiers are ignored.
    mine(await publicChecklistGet(s.checklistToken), "public checklist");
    mine(await publicChecklistGet(s.checklistToken, { organizationId: other, jobId: theirs.job }), "public checklist with injected identifiers");

    // Client report, and a photo of the other organization requested with this token.
    mine(await publicReportGet(s.reportToken), "client report");
    const ownPhoto = await publicReportGet(s.reportToken, { photo: "1", evidenceId: s.photoId });
    assert.equal(ownPhoto.code, 200);
    assert.deepEqual(ownPhoto.body, s.photo);
    assert.equal((await publicReportGet(s.reportToken, { photo: "1", evidenceId: state[other].photoId })).code, 404);

    // Client portal: the list, its own service, and the other organization's service.
    mine(await publicPortalGet(s.portalToken), "client portal");
    mine(await publicPortalGet(s.portalToken, { job: x.job }), "client portal service");
    for (const query of [{ job: theirs.job }, { job: theirs.job, photo: "1", evidenceId: state[other].photoId }]) {
      const refused = await publicPortalGet(s.portalToken, query);
      assert.equal(refused.code, 404);
      assertRevealsNothing(refused.body, other, "client portal refusal");
    }

    // Offer: shown and answered inside its own organization, whatever the body claims.
    mine(await publicOfferGet(x.offerToken), "public offer");
    const answered = await publicOfferPost({ token: x.offerToken, status: "INTERESTED", organizationId: other, jobId: theirs.offerJob });
    assert.equal(answered.code, 200, JSON.stringify(answered.body));
    assert.equal((await admin.doc(`${x.root}/jobs/${x.offerJob}/offers/${x.cleaner}`).get()).data().status, "INTERESTED");

    // A token that no organization issued opens nothing.
    const unknown = Buffer.alloc(32, 0x7a).toString("base64url");
    for (const response of [await publicChecklistGet(unknown), await publicReportGet(unknown), await publicPortalGet(unknown), await publicOfferGet(unknown)]) {
      assert.ok([404, 410].includes(response.code), `unknown token ends with ${response.code}`);
    }
    assert.deepEqual(await everything({ except: own }), before, `the public links of ${own} change nothing outside ${own}`);
  });
}

covers("sendTodayExecutionReminder", "sendTomorrowPlanningReminder", "previewManagerReminder");
test("scheduled reminders give each organization its own reminder, and a preview follows the developer's organization", async () => {
  // Jobs on the reminder's own "today": one more in org-b than in org-a.
  const today = localDateKey(new Date());
  const extra = { "org-a": 1, "org-b": 3 };
  for (const org of organizations) {
    for (let index = 0; index < extra[org]; index += 1) {
      await admin.doc(`organizations/${org}/jobs/today-${ids(org).letter}-${index}`).set({
        organizationId: org, schemaVersion: 2, operationalStatus: "ASSIGNED", assignedCleanerIds: [ids(org).cleaner], scheduledDate: today,
      });
    }
  }
  const expected = async (org) => (await admin.collection(`organizations/${org}/jobs`).where("scheduledDate", "==", today).get()).docs
    .filter((snapshot) => ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"].includes(snapshot.data().operationalStatus)).length;
  assert.equal(await expected("org-b") - await expected("org-a"), 2);

  await functionsIndex.sendTodayExecutionReminder.run({});
  await functionsIndex.sendTomorrowPlanningReminder.run({});
  for (const org of organizations) {
    const deliveries = (await admin.collection(`organizations/${org}/managerReminderDeliveries`).get()).docs.map((snapshot) => snapshot.data());
    const todays = deliveries.find(({ reminderType }) => reminderType === "TODAY_07");
    assert.deepEqual({ organizationId: todays.organizationId, jobCount: todays.jobCount }, { organizationId: org, jobCount: await expected(org) });
    assert.ok(deliveries.every((delivery) => delivery.organizationId === org));
    const inbox = await functionsIndex.listNotificationInbox.run(managerRequest(org, { role: "MANAGER" }));
    assert.ok(inbox.items.some(({ type }) => type === "TODAY_07"), `${org} manager sees her own reminder`);
    assertRevealsNothing(inbox, organizations.find((candidate) => candidate !== org), `${org} manager inbox`);
  }
  // A repeated run claims nothing twice.
  await functionsIndex.sendTodayExecutionReminder.run({});
  for (const org of organizations) {
    const count = (await admin.collection(`organizations/${org}/managerReminderDeliveries`).where("reminderType", "==", "TODAY_07").get()).size;
    assert.equal(count, 1);
  }

  const developer = (claim) => ({
    auth: { uid: "developer", token: { firebase: { sign_in_provider: "password" }, ...(claim ? { organizationId: claim } : {}) } },
    data: { type: "TODAY_07" },
  });
  for (const org of organizations) {
    assert.equal((await functionsIndex.previewManagerReminder.run(developer(org))).reminder.jobCount, await expected(org));
  }
  assert.equal((await functionsIndex.previewManagerReminder.run(developer(null))).reminder.jobCount, await expected(defaultOrganization));
  for (const [own, other] of pairs) {
    await expectEnding("previewManagerReminder", managerRequest(own, { type: "TODAY_07" }, { claim: other }), "permission-denied",
      `${own} manager, not a developer`);
  }
});

covers("getDevCenterAccess", "getManagerNotificationDiagnostics", "sendDeveloperTestNotification",
  "reportManagerNotificationHealth", "sendCurrentManagerTestNotification");
test("developer tools stay pinned to the default organization, whatever the caller's claim says", async () => {
  const developer = (claim, data = {}) => ({
    auth: { uid: "developer", token: { firebase: { sign_in_provider: "password" }, organizationId: claim } }, data,
  });
  const before = await everything();
  for (const org of organizations) {
    const access = await functionsIndex.getDevCenterAccess.run(developer(org));
    assert.equal(access.authorized, true);
    const diagnostics = await functionsIndex.getManagerNotificationDiagnostics.run(developer(org));
    for (const organization of organizations) {
      assertRevealsNothing(access, organization, "getDevCenterAccess");
      assertRevealsNothing(diagnostics, organization, "getManagerNotificationDiagnostics");
    }
    // The developer is not a manager of the default organization, so no test notice is sent.
    await expectEnding("sendDeveloperTestNotification", developer(org, { confirm: true, targetRegistrationId: "synthetic" }),
      "permission-denied", `developer with a ${org} claim`);

    // The two manager callables that live with the developer tools: only the default organization's managers.
    const x = ids(org);
    const health = {
      deviceId: x.managerDevice.deviceId, notificationPermission: "granted", serviceWorker: "active", fcmRegistration: "registered",
      platform: "desktop", browserClass: "chrome", standalone: false,
    };
    for (const claim of [org, null, organizations.find((candidate) => candidate !== org)]) {
      await expectEnding("reportManagerNotificationHealth", managerRequest(org, health, { claim }), "permission-denied", `${org} manager, claim ${claim}`);
      await expectEnding("sendCurrentManagerTestNotification", managerRequest(org, { deviceId: x.managerDevice.deviceId, confirm: true }, { claim }),
        "permission-denied", `${org} manager, claim ${claim}`);
    }
  }
  assert.deepEqual(await everything(), before, "developer tools change nothing for another caller");

  // The default organization's own manager is recognized by both.
  const d = ids(defaultOrganization);
  for (const [name, data] of [
    ["reportManagerNotificationHealth", { deviceId: d.managerDevice.deviceId, notificationPermission: "granted", serviceWorker: "active",
      fcmRegistration: "registered", platform: "desktop", browserClass: "chrome", standalone: false }],
    ["sendCurrentManagerTestNotification", { deviceId: d.managerDevice.deviceId, confirm: true }],
  ]) {
    const result = await outcome(name, managerRequest(defaultOrganization, data));
    assert.notEqual(result.code, "permission-denied", `${name} for the default organization's manager: ${describeOutcome(result)}`);
  }
});

// ---------------------------------------------------------------------------
// Coverage guard: a new Function cannot skip this proof.
// ---------------------------------------------------------------------------
const trigger = "Firestore trigger: its organization is the {orgId} of the document that fired it, never a caller's input.";
const exempt = {
  notifyManagersOperationalEvent: trigger,
  notifyManagersChecklistReadyForReview: trigger,
  notifyCleanerInboxEvent: trigger,
  syncCleanerAgendaOnJobWrite: trigger,
  syncCleanerAgendaOnAssignmentWrite: trigger,
  syncCleanerAgendaOnOfferWrite: trigger,
  syncCleanerAgendaOnChecklistRunWrite: trigger,
  syncCleanerAgendaOnChecklistStart: trigger,
  generateDevCenterScenario: "Developer tool pinned to the default organization; it writes only outside Production and is proven by security/devCenterSandbox.test.mjs.",
  clearDevCenterData: "Developer tool pinned to the default organization; it deletes only outside Production and is proven by security/devCenterSandbox.test.mjs.",
};

test("every exported Function is covered by this suite or exempt with a written reason", () => {
  const endpoints = Object.entries(functionsIndex).filter(([, value]) => value?.__endpoint).map(([name]) => name).sort();
  assert.ok(endpoints.length > 0);
  const unknown = endpoints.filter((name) => !covered.has(name) && !(name in exempt));
  assert.deepEqual(unknown, [], "add each new Function to a table above, or to `exempt` with a reason");
  assert.deepEqual([...covered, ...Object.keys(exempt)].filter((name) => !endpoints.includes(name)), [], "a listed name is no longer exported");
  assert.deepEqual(Object.keys(exempt).filter((name) => covered.has(name)), [], "a Function is either covered or exempt, not both");
  for (const [name, reason] of Object.entries(exempt)) assert.ok(typeof reason === "string" && reason.length > 20, `${name} needs a reason`);
  assert.equal(covered.size + Object.keys(exempt).length, endpoints.length);
});
