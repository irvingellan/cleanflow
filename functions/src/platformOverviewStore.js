import { cleanerSessionIds, eligibleCleaner, isActiveCleanerMembership } from "./cleanerHubAccess.js";
import { allRows, count, pages } from "./platformQueries.js";
import { attentionReasons, offerWaitingTooLong } from "./platformUsage.js";
import { attentionInputs, readUsage } from "./platformUsageStore.js";
import { readCleanerActivity } from "./platformCleanerActivity.js";
import { FieldPath } from "firebase-admin/firestore";
import { automaticOfferState, isAutomaticOfferJob } from "./firstAcceptWins.js";
import { isManualReplacementOfferId, currentManualReplacementOffer } from "./managerManualReplacementOfferService.js";
import { manualOfferAvailability } from "./offerSlots.js";
import { directoryPerson, displayLabel, isoDate, operationKinds, organizationKey, reportingWindow, summarizeHealth } from "./platformOverview.js";

const byId = FieldPath.documentId();

async function directoryCounts(collection, defaultActive) {
  const marked = collection.where("archivedAt", "!=", null);
  // Cleaner and client directories default a missing active flag to true.
  // Properties require an explicit true. Missing archivedAt means visible.
  const flagged = collection.where("active", "==", !defaultActive);
  const [archived, flaggedCount, archivedFlagged, total] = await Promise.all([
    count(marked), count(flagged), count(flagged.where("archivedAt", "!=", null)),
    defaultActive ? count(collection) : 0,
  ]);
  const visibleFlagged = flaggedCount - archivedFlagged;
  return { active: defaultActive ? total - archived - visibleFlagged : visibleFlagged, archived };
}

function between(query, key, since, now) {
  return query.where(key, ">=", since).where(key, "<=", now);
}

async function lastJobActivity(jobs) {
  // Current Job creation sets only createdAt. Firestore orderBy excludes
  // documents missing that field, so exact activity needs TWO one-row indexes.
  const timestamps = await Promise.all(["updatedAt", "createdAt"].map(async (field) => {
    const snapshot = await jobs.orderBy(field, "desc").limit(1).select(field).get();
    return isoDate(snapshot.docs[0]?.get(field));
  }));
  return timestamps.filter(Boolean).sort().at(-1) ?? null;
}

function statusInOrganization(org, collection, status) {
  // Issues on older Jobs have no organizationId field. Document references
  // sort by path segments, so [org, org + NUL) contains only its descendants.
  const upper = org.parent.doc(org.id + "\u0000");
  return org.firestore.collectionGroup(collection).where("status", "==", status)
    .orderBy(byId).startAt(org).endBefore(upper);
}

const offerFields = ["status", "cleanerId", "managerDecision", "offerDistributionMode", "publicOfferExpiresAt",
  "offeredChecklistContextRevision", "automaticOfferBatchVersion", "revokedAt", "offerKind", "replacementOfferId",
  "organizationId", "scheduleRevision", "createdAt", "managerReopenedAt"];
const jobOfferFields = ["operationalStatus", "archivedAt", "assignedCleanerId", "assignedCleanerIds", "requiredCleanerCount",
  "offerDistributionMode", "schemaVersion", "offerDistributionClosedAt", "firstAcceptClaim", "checklistContextRevision",
  "automaticOfferBatch", "manualReplacementOffer", "scheduleRevision", "startedAt", "organizationId"];

async function waitingOffers(org, now) {
  let waiting = 0;
  let oldOffers = 0;
  for await (const offers of pages(statusInOrganization(org, "offers", "PENDING").select(...offerFields))) {
    // A filled team or a manager decision can close an invitation while its
    // response stays PENDING. Project only the fields used by the actual gate.
    const refs = new Map(offers.map((offer) => [offer.ref.parent.parent.path, offer.ref.parent.parent]));
    const parents = await org.firestore.getAll(...refs.values(), { fieldMask: jobOfferFields });
    const jobs = new Map(parents.map((doc) => [doc.ref.path, doc.data()]));
    for (const doc of offers) {
      const job = jobs.get(doc.ref.parent.parent.path);
      if (!job || job.archivedAt) continue;
      const offer = doc.data();
      let available;
      if (isManualReplacementOfferId(doc.id)) available = currentManualReplacementOffer(job, offer, doc.id, now);
      else if (isAutomaticOfferJob(job)) available = automaticOfferState(offer, job, now) === "available";
      else available = ["OFFERED", "ASSIGNED"].includes(job.operationalStatus) && manualOfferAvailability(job, offer) === "open";
      if (available) {
        waiting++;
        const waitingSince = offer.managerReopenedAt ?? offer.createdAt;
        if (offerWaitingTooLong(waitingSince?.toMillis?.(), now)) oldOffers++;
      }
    }
  }
  return { waiting, oldOffers };
}

async function pageTimings(loads) {
  const durations = [];
  let failedPageLoads = 0;
  for await (const docs of pages(loads.orderBy("createdAt").select("durationMs", "result", "createdAt"))) {
    for (const doc of docs) {
      durations.push(doc.get("durationMs"));
      if (doc.get("result") === "error") failedPageLoads++;
    }
  }
  return { durations, failedPageLoads };
}

async function readHealth(org, { since7, now }) {
  const loads = between(org.collection("managerPageLoadEvents"), "createdAt", since7, now);
  const operations = between(org.collection("managerOperationEvents"), "createdAt", since7, now);
  const [{ durations, failedPageLoads }, operationsByKind] = await Promise.all([
    pageTimings(loads),
    Promise.all(operationKinds.map(async (kind) => {
      const query = operations.where("operation", "==", kind);
      const [failed, succeeded] = await Promise.all([
        count(query.where("result", "==", "error")), count(query.where("result", "==", "success")),
      ]);
      return { kind, failed, attempts: failed + succeeded };
    })),
  ]);
  return summarizeHealth(durations.length, durations,
    Object.fromEntries(operationsByKind.map(({ kind, failed }) => [kind, failed])), failedPageLoads,
    Object.fromEntries(operationsByKind.map(({ kind, attempts }) => [kind, attempts])));
}

async function upcomingJobs(jobs, window) {
  const upcoming = jobs.where("operationalStatus", "in", ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"])
    .where("scheduledDate", ">=", window.today).where("scheduledDate", "<", window.endDate);
  // Archive and operational status are independent; old jobs may omit archivedAt.
  const [total, archived] = await Promise.all([
    count(upcoming),
    count(upcoming.where("archivedAt", "!=", null).orderBy("archivedAt").orderBy("scheduledDate")),
  ]);
  return total - archived;
}

async function readOrganization(doc, window) {
  const org = doc.ref;
  const jobs = org.collection("jobs");
  const [activeManagers, cleaners, clients, properties, total, created30d, scheduled7d, completed30d,
    openIssues, pending, lastActivityAt, health, alerts] = await Promise.all([
    count(org.collection("members").where("role", "==", "MANAGER").where("active", "==", true)),
    directoryCounts(org.collection("cleaners"), true), directoryCounts(org.collection("clients"), true), directoryCounts(org.collection("properties"), false),
    count(jobs), count(between(jobs, "createdAt", window.since30, window.now)),
    upcomingJobs(jobs, window),
    count(between(jobs.where("operationalStatus", "==", "COMPLETED"), "completedAt", window.since30, window.now).orderBy("completedAt", "desc")),
    count(statusInOrganization(org, "issues", "OPEN")), waitingOffers(org, window.now), lastJobActivity(jobs), readHealth(org, window),
    attentionInputs(org, window),
  ]);
  const createdAt = isoDate(doc.get("createdAt"));
  return {
    id: organizationKey(org.id), displayName: displayLabel(doc.get("displayName")) ?? displayLabel(doc.get("name")), createdAt,
    people: { activeManagers, activeCleaners: cleaners.active, archivedCleaners: cleaners.archived }, clients, properties,
    jobs: { total, created30d, scheduled7d, completed30d }, attention: { openIssues, waitingOffers: pending.waiting }, lastActivityAt, health,
    attentionReasons: attentionReasons({ ...alerts, createdAt, lastActivityAt, health: health.status, oldOffers: pending.oldOffers }, window.now),
  };
}

export async function readOverview(db, now = new Date()) {
  // listDocuments also finds historic organizations with children but no
  // root document. The SDK pages paths only. Every metrics query is either
  // an index count, a top-1 or a projected page of 100. Document read cost is
  // chiefly one per 7-day page timing and per pending offer + distinct parent.
  // Bound org fan-out independently of the total number of tenants.
  const refs = await db.collection("organizations").listDocuments();
  const organizations = [];
  const window = reportingWindow(now);
  for (let i = 0; i < refs.length; i += 4) {
    const docs = await db.getAll(...refs.slice(i, i + 4), { fieldMask: ["displayName", "name", "createdAt"] });
    organizations.push(...await Promise.all(docs.map((doc) => readOrganization(doc, window))));
  }
  return { organizations };
}

export async function readPeople(org, auth, now = new Date()) {
  const [members, cleaners] = await Promise.all([
    allRows(org.collection("members").where("role", "in", ["MANAGER", "CLEANER"]).orderBy(byId).select("role", "cleanerId", "displayName", "name", "active", "organizationId", "sessionId", "sessionIds")),
    allRows(org.collection("cleaners").orderBy(byId).select("name", "displayName", "active", "archivedAt")),
  ]);
  const ids = members.map((doc) => doc.id).filter((id) => id.length <= 128);
  const accounts = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { users } = await auth.getUsers(ids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const user of users) accounts.set(user.uid, user);
  }
  const linked = new Map(members.filter((doc) => doc.get("role") === "CLEANER" && doc.get("cleanerId"))
    .map((doc) => [doc.get("cleanerId"), doc]));
  const people = members.filter((doc) => doc.get("role") === "MANAGER")
    .map((doc) => directoryPerson("MANAGER", doc.data(), accounts.get(doc.id)));
  const cleanerProfiles = cleaners.map((doc) => {
    const member = linked.get(doc.id);
    linked.delete(doc.id);
    return { cleanerId: doc.id, profile: doc.data(), member };
  });
  // A residual membership is still visible, but cannot use the Hub without
  // its active cleaner profile. Never interpret an Auth sign-in as Hub usage.
  for (const [cleanerId, member] of linked) {
    if (typeof cleanerId !== "string" || cleanerId.includes("/")) continue;
    cleanerProfiles.push({ cleanerId, profile: { ...member.data(), active: false }, member });
  }
  const funnelCleaners = [];
  for (let start = 0; start < cleanerProfiles.length; start += 4) {
    const group = cleanerProfiles.slice(start, start + 4);
    people.push(...await Promise.all(group.map(async ({ cleanerId, profile, member }) => {
      const activity = await readCleanerActivity(org, cleanerId, member?.id);
      const person = directoryPerson("CLEANER", profile, accounts.get(member?.id), activity);
      const membership = member?.data();
      const hubAccess = eligibleCleaner(profile) && isActiveCleanerMembership(membership)
        && membership.organizationId === org.id && cleanerSessionIds(membership).some(id => typeof id === "string" && id.length > 0);
      funnelCleaners.push({ id: cleanerId, active: person.active, hubAccess, lastActivityAt: person.lastActivityAt });
      return person;
    })));
  }
  return { people, usage: await readUsage(org, reportingWindow(now), funnelCleaners) };
}
