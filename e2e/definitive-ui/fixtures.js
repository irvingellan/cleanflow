import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Fictitious operation on the isolated demo-cleanflow emulators only
// (ports from firebase.cleaner-hub-e2e.json). Never a cloud project.
for (const [name, value] of Object.entries({
  GCLOUD_PROJECT: "demo-cleanflow",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:18280",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:19280",
})) assert.equal(process.env[name], value, `Definitive UI capture requires local ${name}`);

const app = getApps().find((candidate) => candidate.name === "definitive-ui")
  || initializeApp({ projectId: "demo-cleanflow" }, "definitive-ui");
export const db = getFirestore(app);
export const auth = getAuth(app);
export const organizationId = "cleanflow-demo";
const orgRef = db.collection("organizations").doc(organizationId);

export function dateKey(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

async function idToken(email, password) {
  const response = await fetch("http://127.0.0.1:19280/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return (await response.json()).idToken;
}

export async function managerCall(manager, name, data) {
  const token = await idToken(manager.email, manager.password);
  const response = await fetch(`http://127.0.0.1:15280/demo-cleanflow/us-central1/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`callable-${name}-${body.error?.status || response.status}-${body.error?.message || ""}`);
  return body.result;
}

const inboxId = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/** One deterministic-looking day of a small operation; all names invented. */
export async function seedOperation() {
  const run = randomUUID().slice(0, 6);
  const manager = { email: `manager-${run}@example.test`, password: "SyntheticOnly123!" };
  const user = await auth.createUser({ ...manager, displayName: "Operations Manager", emailVerified: true });
  const now = Timestamp.now();
  const minutesAgo = (minutes) => Timestamp.fromMillis(Date.now() - minutes * 60_000);
  const shared = { organizationId, active: true, dataProvenance: "DEMO", createdAt: now, updatedAt: now };
  const id = (name) => `${name}-${run}`;
  const clients = [["harborview", "Harborview Rentals"], ["seaside", "Seaside Stays Co"]];
  const properties = [
    ["harbor", "Harbor House", "harborview"], ["juniper", "Juniper Loft", "harborview"],
    ["maple", "Maple Studio", "seaside"], ["cedar", "Cedar Cottage", "seaside"],
    ["birch", "Birch Flat 2B", "harborview"], ["pine", "Pine Ridge Cabin", "seaside"],
  ];
  const cleaners = [["ana", "Ana Souza", "pt"], ["bia", "Bia Lima", "pt"], ["carla", "Carla Mendes", "es"], ["dani", "Dani Rocha", "en"]];
  const batch = db.batch();
  batch.set(orgRef.collection("members").doc(user.uid), { role: "MANAGER", active: true });
  for (const [key, name] of clients) batch.set(orgRef.collection("clients").doc(id(key)), { ...shared, name });
  for (const [key, name, client] of properties) {
    batch.set(orgRef.collection("properties").doc(id(key)), {
      ...shared, name, clientId: id(client), clientName: clients.find(([k]) => k === client)[1],
      defaultClientPrice: 180, defaultCleanerPrice: 110,
      keyCodeInfo: "synthetic-private-door", accessInstructions: "synthetic-private-access",
    });
  }
  for (const [key, name, preferredLanguage] of cleaners) {
    batch.set(orgRef.collection("cleaners").doc(id(key)), { ...shared, name, preferredLanguage, phone: "+15555550100" });
  }
  const jobs = {
    harborToday: ["harbor", 0, "09:00"], juniperToday: ["juniper", 0, "13:00"], mapleToday: ["maple", 0, "15:30"],
    cedarTomorrow: ["cedar", 1, "10:00"], birchTomorrow: ["birch", 1, "14:00"], pineSoon: ["pine", 3, "11:00"],
    harborLater: ["harbor", 9, "09:30"], juniperNextMonth: ["juniper", 26, "12:00"], mapleDone: ["maple", -1, "10:00"],
  };
  for (const [key, [property, day, start]] of Object.entries(jobs)) {
    const [, propertyName, client] = properties.find(([k]) => k === property);
    batch.set(orgRef.collection("jobs").doc(id(key)), {
      organizationId, propertyId: id(property), propertyName, clientId: id(client),
      clientName: clients.find(([k]) => k === client)[1], scheduledDate: dateKey(day), scheduledStart: start,
      notes: "", operationalStatus: "UNASSIGNED", schemaVersion: 2, checklistContextRevision: 0,
      assignedCleanerIds: [], dataProvenance: "DEMO", clientPrice: 180, cleanerPayout: 110, createdAt: now,
    });
  }
  await batch.commit();

  const assign = (job, cleaner) => managerCall(manager, "assignCleanerDirectly", { jobId: id(job), cleanerId: id(cleaner) });
  for (const job of ["harborToday", "cedarTomorrow", "pineSoon", "harborLater", "juniperNextMonth", "mapleDone"]) await assign(job, "ana");

  // Offers: two interested cleaners waiting for the manager's decision, one pending.
  const offered = db.batch();
  const offer = (job, cleaner, status, respondedMinutes) => offered.set(orgRef.collection("jobs").doc(id(job)).collection("offers").doc(id(cleaner)), {
    jobId: id(job), cleanerId: id(cleaner), cleanerName: cleaners.find(([k]) => k === cleaner)[1], status,
    createdAt: minutesAgo(180), ...(respondedMinutes ? { respondedAt: minutesAgo(respondedMinutes) } : {}),
  });
  offer("juniperToday", "bia", "INTERESTED", 42);
  offer("juniperToday", "carla", "INTERESTED", 18);
  offer("juniperToday", "dani", "PENDING");
  offer("birchTomorrow", "carla", "PENDING");
  offered.update(orgRef.collection("jobs").doc(id("juniperToday")), { operationalStatus: "OFFERED", offeredAt: minutesAgo(180) });
  offered.update(orgRef.collection("jobs").doc(id("birchTomorrow")), { operationalStatus: "OFFERED", offeredAt: minutesAgo(90) });
  offered.update(orgRef.collection("jobs").doc(id("cedarTomorrow")), { operationalStatus: "IN_PROGRESS", startedAt: minutesAgo(30) });
  offered.update(orgRef.collection("jobs").doc(id("mapleDone")), { operationalStatus: "COMPLETED", completedAt: minutesAgo(60 * 20) });
  await offered.commit();

  // A submitted checklist waiting for review on the in-progress Job.
  await managerCall(manager, "createChecklistRun", { jobId: id("cedarTomorrow") });
  const runs = await orgRef.collection("jobs").doc(id("cedarTomorrow")).collection("checklistRuns").get();
  for (const runDoc of runs.docs) await runDoc.ref.update({ status: "READY_FOR_REVIEW", submittedAt: minutesAgo(12), updatedAt: minutesAgo(12) });

  const inbox = db.batch();
  const item = (type, job, minutes, extra = {}) => {
    const eventId = inboxId(run, type, job, minutes);
    inbox.set(orgRef.collection("managerNotificationInbox").doc(eventId), {
      eventId, organizationId, type, ...(job ? { jobId: id(job) } : {}), eventVersion: 1,
      createdAt: minutesAgo(minutes), priority: type === "CLEANER_INTERESTED" ? "NORMAL" : "HIGH", processingState: "STORED", ...extra,
    });
    return eventId;
  };
  item("CLEANER_INTERESTED", "juniperToday", 18);
  item("CHECKLIST_READY_FOR_REVIEW", "cedarTomorrow", 12);
  item("CLEANER_INTERESTED", "juniperToday", 42);
  const readItem = item("TODAY_07", null, 60 * 4, { targetDate: dateKey(0) });
  item("ASSIGNMENT_CONFIRMED", "harborToday", 60 * 22);
  inbox.set(orgRef.collection("notificationInboxReadStates").doc(user.uid).collection("items").doc(readItem), { readAt: now });
  await inbox.commit();

  // A released, not-yet-started checklist for today's assigned Job (cleaner link).
  await managerCall(manager, "createChecklistRun", { jobId: id("harborToday") });
  const { token: checklistToken } = await managerCall(manager, "issueChecklistCapability", { jobId: id("harborToday"), cleanerId: id("ana") });

  const { code } = await managerCall(manager, "issueCleanerAccessCode", { cleanerId: id("ana") });
  return { run, manager, managerUid: user.uid, cleanerCode: code, checklistToken, jobId: (key) => id(key) };
}
