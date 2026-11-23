import { clearApprovedAssignmentBilling } from "./approvedAssignmentBilling.js";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { initialChecklistRunId, validChecklistRunJobId } from "./checklistRunService.js";
import { assertSessionForMutation } from "./cleanerHubAccess.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { maxCleanersPerJob, rosterCleanerIds } from "./offerSlots.js";
import { hourlyAmountCents } from "./hourlyAmount.js";

const submittedChecklistStates = ["READY_FOR_REVIEW", "APPROVED", "LOCKED", "FINALIZED"];
export const canRecordWorkedTime = (job, checklistStatus) =>
  ["IN_PROGRESS", "COMPLETED"].includes(job?.operationalStatus)
  || (job?.operationalStatus === "ASSIGNED" && submittedChecklistStates.includes(checklistStatus));

function clock(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return 60 * hours + minutes;
}

export function roundedWorkedMinutes(input, allowedZero = false) {
  const { minutes, start, end } = input || {};
  const from = clock(start);
  const to = clock(end);
  const duration = start === undefined && end === undefined ? minutes
    : minutes === undefined && from !== null && to !== null ? (to - from + 1440) % 1440 : null;
  if (!Number.isInteger(duration) || duration < (allowedZero ? 0 : 1) || duration > 1440) {
    throw new HttpsError("invalid-argument", "Enter a duration from 1 minute to 24 hours.");
  }
  return Math.round(duration / 5) * 5;
}

function belongs(data, ids) {
  return data && (data.organizationId == null || data.organizationId === ids.organizationId)
    && (data.jobId == null || data.jobId === ids.jobId);
}

async function loadRate(transaction, jobRef, ids, job, assignment) {
  let agreement = assignment.paySnapshot;
  if (assignment.sourceOfferId) {
    if (!validChecklistRunJobId(assignment.sourceOfferId)) return { unresolved: true };
    const offer = (await transaction.get(jobRef.collection("offers").doc(assignment.sourceOfferId))).data();
    if (!belongs(offer, ids) || offer.cleanerId !== assignment.cleanerId
      || !["ACCEPTED", "INTERESTED", "SELECTED"].includes(offer.status)
      || offer.revokedAt || offer.managerDecision != null) return { unresolved: true };
    agreement = offer;
  }
  if (agreement?.offeredPay?.mode === "HOURLY") {
    return { hourly: true, rate: agreement.offeredPay.rateCents };
  }
  if (agreement && (Object.hasOwn(agreement, "offeredCompensation") || Object.hasOwn(agreement, "offeredPay"))) {
    return { unresolved: agreement.offeredCompensation == null };
  }
  return job.pay?.mode === "HOURLY" ? { hourly: true, rate: job.pay.rateCents } : {};
}

export async function recordWorkedTime(database, { organizationId, uid, cleanerId, sessionId, input, manager = false, removeApproval = false }) {
  const jobId = input?.jobId;
  if (!validChecklistRunJobId(jobId) || (manager && !validChecklistRunJobId(input.assignmentId))) {
    throw new HttpsError("invalid-argument", "The job or assignment is invalid.");
  }
  const ids = { organizationId, jobId };
  const organization = database.collection("organizations").doc(organizationId);
  const jobRef = organization.collection("jobs").doc(jobId);
  return database.runTransaction(async transaction => {
    if (manager) {
      const member = (await transaction.get(organization.collection("members").doc(uid))).data();
      if (!isActiveManagerMembership(member) || (member.organizationId != null && member.organizationId !== organizationId)) {
        throw new HttpsError("permission-denied", "Active manager access is required.");
      }
    } else {
      await assertSessionForMutation(transaction, database, { organizationId, uid, cleanerId, sessionId });
    }
    const job = (await transaction.get(jobRef)).data();
    const roster = rosterCleanerIds(job);
    if (!belongs(job, ids) || job.archivedAt || roster.length > maxCleanersPerJob || (!manager && !roster.includes(cleanerId))) {
      throw new HttpsError("permission-denied", "The assignment is unavailable.");
    }
    const [assignmentDocs, checklist] = await Promise.all([
      transaction.get(jobRef.collection("assignments").where("isActive", "==", true).limit(maxCleanersPerJob + 1)),
      transaction.get(jobRef.collection("checklistRuns").doc(initialChecklistRunId)),
    ]);
    if (assignmentDocs.size > maxCleanersPerJob) {
      throw new HttpsError("failed-precondition", "The roster needs review.");
    }
    const active = assignmentDocs.docs.filter(doc => belongs(doc.data(), ids) && roster.includes(doc.data().cleanerId));
    const target = active.find(doc => manager ? doc.id === input.assignmentId : doc.data().cleanerId === cleanerId);
    const assignment = target?.data();
    if (!assignment || active.filter(doc => doc.data().cleanerId === assignment.cleanerId).length !== 1) {
      throw new HttpsError("permission-denied", "The assignment is unavailable.");
    }
    if (!removeApproval && !canRecordWorkedTime(job, belongs(checklist.data(), ids) ? checklist.data().status : null)) {
      throw new HttpsError("failed-precondition", "Worked time is available after work has started.");
    }
    if (job.payoutId || job.payoutPaidAt || job.payoutIdsByCleaner?.[assignment.cleanerId]) {
      throw new HttpsError("failed-precondition", "The assignment is already paid.");
    }
    const approvedAssignments = Object.fromEntries(active.flatMap(doc => doc.data().approvedWork ? [[doc.id, doc.data().cleanerId]] : []));
    if (manager && removeApproval) {
      if (!assignment.approvedWork) return { removed: false };
      delete approvedAssignments[target.id];
      transaction.update(target.ref, { approvedWork: FieldValue.delete(), payoutCents: FieldValue.delete() });
      transaction.update(jobRef, { approvedAssignments, ...clearApprovedAssignmentBilling(job) });
      return { removed: true };
    }
    const rate = await loadRate(transaction, jobRef, ids, job, assignment);
    const clientHourly = job.billing?.mode === "HOURLY";
    if (rate.unresolved || (!rate.hourly && !(manager && clientHourly))
      || (rate.hourly && hourlyAmountCents(rate.rate, 0) === null)) {
      throw new HttpsError("failed-precondition", "Eligible hourly pricing is required.");
    }
    // A manager may correct an approval until that cleaner is paid; a cleaner cannot change it.
    if (assignment.approvedWork && !manager) {
      throw new HttpsError("failed-precondition", "Worked time is already approved.");
    }
    const minutes = manager && input.minutes === undefined && input.start === undefined && input.end === undefined
      ? assignment.reportedWork?.minutes : roundedWorkedMinutes(input, manager);
    if (manager && job.serviceType === "AIRBNB_TOUCH_UP" && minutes > 120
      && input.minutes === undefined && input.start === undefined && input.end === undefined) {
      throw new HttpsError("failed-precondition", "Explicitly adjust a touch-up that exceeds two hours.");
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || minutes % 5 !== 0) {
      throw new HttpsError("failed-precondition", "Reported or adjusted time is required.");
    }
    if (!manager) {
      transaction.update(target.ref, { reportedWork: { minutes, reportedAt: FieldValue.serverTimestamp() } });
      return { minutes };
    }
    const payoutCents = rate.hourly ? hourlyAmountCents(rate.rate, minutes) : null;
    approvedAssignments[target.id] = assignment.cleanerId;
    const approvals = new Map(active.map(doc => [doc.data().cleanerId,
      doc.id === target.id ? minutes : doc.data().approvedWork?.minutes]));
    const teamMinutes = roster.map(id => approvals.get(id));
    const completeTeam = clientHourly && active.length === roster.length && teamMinutes.every(value =>
      Number.isInteger(value) && value >= 0 && value <= 1440 && value % 5 === 0);
    transaction.update(jobRef, {
      approvedAssignments,
      ...(completeTeam ? {
        "billing.hours": { approved: true, approvedMinutes: teamMinutes.reduce((sum, value) => sum + value, 0),
          source: "APPROVED_ASSIGNMENTS", roster, assignmentIds: active.map(doc => doc.id).sort() },
      } : clearApprovedAssignmentBilling(job)),
    });
    transaction.update(target.ref, {
      approvedWork: { minutes, approvedByUid: uid, approvedAt: FieldValue.serverTimestamp() },
      ...(rate.hourly && { payoutCents }),
    });
    return { minutes, payoutCents };
  });
}
