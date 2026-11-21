import { FieldPath } from "firebase-admin/firestore";
import { initialChecklistRunId } from "./checklistRunService.js";
import { allRows, count, pages, tenantGroup } from "./platformQueries.js";
import { adoptionFunnel, weeklyWindows } from "./platformUsage.js";

function inWindow(query, field, since, now) {
  return query.where(field, ">=", since).where(field, "<=", now).orderBy(field);
}

const accepted = ["SENT", "FCM_ACCEPTED"];
const noTarget = ["NO_ACTIVE_DEVICES", "NO_ACTIVE_RECIPIENTS"];
const confirmedAttempts = [...accepted, "PARTIAL", "FAILED"];

function deliveryStreams(org, { since7, now }) {
  // Operational and review outbox documents both use managerNotificationDeliveries.
  return [
    inWindow(org.collection("managerReminderDeliveries"), "attemptedAt", since7, now),
    inWindow(org.collection("cleanerNotificationDeliveries"), "recordedAt", since7, now),
    inWindow(tenantGroup(org, "managerNotificationDeliveries"), "attemptedAt", since7, now),
  ];
}

async function deliveriesIn(streams, statuses) {
  const counts = await Promise.all(streams.map(query => count(query.where("deliveryStatus", "in", statuses))));
  return counts.reduce((total, n) => total + n, 0);
}

export async function attentionInputs(org, window) {
  const streams = deliveryStreams(org, window);
  const [attempts, failed, oldIssues] = await Promise.all([
    deliveriesIn(streams, confirmedAttempts),
    deliveriesIn(streams, ["FAILED"]),
    count(tenantGroup(org, "issues").where("status", "==", "OPEN")
      .where("createdAt", "<", window.since7).orderBy("createdAt").limit(1)),
  ]);
  return { attempts, failed, oldIssues };
}

async function notifications(org, window) {
  const streams = deliveryStreams(org, window);
  const [managers, cleanerDevices, sent, failed, partial, noDevice] = await Promise.all([
    allRows(org.firestore.collection("managerPushDevices").where("organizationId", "==", org.id)
      .where("active", "==", true).orderBy(FieldPath.documentId()).select("lastSeenAt")),
    count(tenantGroup(org, "devices").where("role", "==", "CLEANER").where("active", "==", true)),
    deliveriesIn(streams, accepted), deliveriesIn(streams, ["FAILED"]),
    deliveriesIn(streams, ["PARTIAL"]), deliveriesIn(streams, noTarget),
  ]);
  const managerActive7d = managers.filter(doc => {
    const seen = doc.get("lastSeenAt")?.toMillis?.();
    return seen >= window.since7.getTime() && seen <= window.now.getTime();
  }).length;
  return { managerDevices: managers.length, managerActive7d, cleanerDevices,
    deliveries7d: { sent, failed, partial, noDevice } };
}

async function photoUploads(org, window) {
  const recent = group => inWindow(tenantGroup(org, group), "createdAt", window.since30, window.now);
  const [multiPhotoUploads, aliases] = await Promise.all([
    // REMOVED retains the original creation timestamp: the upload still happened.
    count(recent("evidenceContent").where("status", "in", ["SAVED", "REMOVED"])),
    allRows(recent("evidence").select("createdAt", "status", "evidenceId")),
  ]);
  // A v2 Run mirrors its required photo into evidence. Only the legacy
  // single-photo writer omits evidenceId; the v2 copy is already counted.
  return multiPhotoUploads + aliases.filter(doc => doc.get("status") === "SAVED" && !doc.get("evidenceId")).length;
}

async function submissions(org, window) {
  const query = inWindow(tenantGroup(org, "checklistRuns"), "readyForReviewAt", window.since30, window.now)
    .select("readyForReviewAt", "readyForReviewCleanerId", "readyForReviewByRole");
  const submitters = new Set();
  const recentJobs = new Set();
  let submitted30d = 0;
  for await (const runs of pages(query)) {
    for (const run of runs) {
      submitted30d++;
      recentJobs.add(run.ref.parent.parent.id);
      const cleaner = run.get("readyForReviewCleanerId");
      if (cleaner && run.get("readyForReviewByRole") !== "MANAGER") submitters.add(cleaner);
    }
  }
  return { submitters, recentJobs, submitted30d };
}

async function completionCoverage(org, recentJobs, window) {
  const completed = org.collection("jobs").where("operationalStatus", "==", "COMPLETED")
    .where("completedAt", ">=", window.since30).where("completedAt", "<=", window.now)
    .orderBy("completedAt", "desc").select("completedAt");
  let completedJobs30d = 0;
  let completedWithChecklist30d = 0;
  for await (const jobs of pages(completed)) {
    completedJobs30d += jobs.length;
    const olderRuns = jobs.filter(doc => !recentJobs.has(doc.id))
      .map(doc => doc.ref.collection("checklistRuns").doc(initialChecklistRunId));
    completedWithChecklist30d += jobs.length - olderRuns.length;
    if (olderRuns.length) {
      const runs = await org.firestore.getAll(...olderRuns, { fieldMask: ["readyForReviewAt"] });
      completedWithChecklist30d += runs.filter(doc => doc.get("readyForReviewAt")?.toMillis?.() <= window.now.getTime()).length;
    }
  }
  return { completedJobs30d, completedWithChecklist30d };
}

export async function readUsage(org, window, cleaners) {
  const reports = tenantGroup(org, "clientReportCapabilities");
  const [submitted, photos30d, prepared30d, sent30d, notices, weeklyJobs] = await Promise.all([
    submissions(org, window), photoUploads(org, window),
    count(inWindow(reports, "createdAt", window.since30, window.now)),
    count(inWindow(reports, "lastSent.at", window.since30, window.now)), notifications(org, window),
    Promise.all(weeklyWindows(window.now).map(async ({ startDate, start, end }, index) => ({
      startDate, count: await count(org.collection("jobs").where("createdAt", ">=", start)
        .where("createdAt", index === 7 ? "<=" : "<", end)),
    }))),
  ]);
  return {
    adoption: adoptionFunnel(cleaners, submitted.submitters, window),
    checklists: { submitted30d: submitted.submitted30d, photos30d, ...await completionCoverage(org, submitted.recentJobs, window) },
    reports: { prepared30d, sent30d }, notifications: notices, weeklyJobs,
  };
}
