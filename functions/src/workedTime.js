import { appendJobCorrection, cleanerWasPaid, jobHasPayoutMarker, jobPayoutRecords } from "./jobCorrections.js";
import { normalizeServiceType } from "./serviceTypes.js";
import { approvedAssignmentBillingUpdate, clearApprovedAssignmentBilling, validApprovedMinutes } from "./approvedAssignmentBilling.js";
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

function workedDuration(input, allowedZero = false) {
  const { minutes, start, end } = input || {};
  const from = clock(start);
  const to = clock(end);
  const duration = start === undefined && end === undefined ? minutes
    : minutes === undefined && from !== null && to !== null ? (to - from + 1440) % 1440 : null;
  if (!Number.isInteger(duration) || duration < (allowedZero ? 0 : 1) || duration > 1440) {
    throw new HttpsError("invalid-argument", "Enter a duration from 1 minute to 24 hours.");
  }
  return duration;
}

export function roundedWorkedMinutes(input, allowedZero = false) {
  return Math.round(workedDuration(input, allowedZero) / 5) * 5;
}

export function cleanerSubmission(input, reportedWork) {
  const submittedMinutes = workedDuration(input);
  const minutes = Math.round(submittedMinutes / 5) * 5;
  const clockTimes = input.start === undefined ? {} : { start: input.start, end: input.end };
  const matches = reportedWork?.submittedMinutes == null ? reportedWork?.minutes === minutes
    : reportedWork.submittedMinutes === submittedMinutes
      && reportedWork.start === clockTimes.start && reportedWork.end === clockTimes.end;
  if (reportedWork && !matches) {
    throw new HttpsError("failed-precondition", "Worked time was already sent. Only the manager can change it.", {
      reason: "worked-time-already-submitted",
    });
  }
  return { minutes, submittedMinutes, ...clockTimes };
}

function belongs(data, ids) {
  return data && (data.organizationId == null || data.organizationId === ids.organizationId)
    && (data.jobId == null || data.jobId === ids.jobId);
}

export async function loadWorkedTimeRate(transaction, jobRef, ids, job, assignment) {
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
    return { hourly: true, rate: agreement.offeredPay.rateCents, agreed: true };
  }
  if (agreement && (Object.hasOwn(agreement, "offeredCompensation") || Object.hasOwn(agreement, "offeredPay"))) {
    return { unresolved: agreement.offeredCompensation == null, agreed: true };
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
    const submission = manager ? null : cleanerSubmission(input, assignment.reportedWork);
    if (!manager && assignment.reportedWork) return { minutes: assignment.reportedWork.minutes };
    if (!removeApproval && !canRecordWorkedTime(job, belongs(checklist.data(), ids) ? checklist.data().status : null)) {
      throw new HttpsError("failed-precondition", "Worked time is available after work has started.");
    }
    if (manager && input.refreshClientHours === true) {
      const approved = active.filter(doc => doc.data().approvedWork);
      const teamMinutes = roster.map(id => active.find(doc => doc.data().cleanerId === id)?.data().approvedWork?.minutes);
      if (job.billing?.mode !== "HOURLY" || active.length !== roster.length
        || !teamMinutes.every(validApprovedMinutes)) {
        throw new HttpsError("failed-precondition", "Every active cleaner needs approved hours.");
      }
      const approvedMinutes = teamMinutes.reduce((sum, value) => sum + value, 0);
      transaction.update(jobRef, {
        approvedAssignments: Object.fromEntries(approved.map(doc => [doc.id, doc.data().cleanerId])),
        "billing.hours": { approved: true, approvedMinutes, source: "APPROVED_ASSIGNMENTS", roster,
          assignmentIds: active.map(doc => doc.id).sort() },
      });
      return { approvedMinutes };
    }
    const payouts = await jobPayoutRecords(transaction, organization, jobId);
    if (cleanerWasPaid(job, assignment.cleanerId, payouts)) {
      throw new HttpsError("failed-precondition", "The assignment is already paid.");
    }
    const afterPayout = jobHasPayoutMarker(job) || !payouts.empty;
    const correction = (kind, before, after, reason) => appendJobCorrection(transaction, jobRef, {
      kind, before: { assignmentId: target.id, ...before }, after: { assignmentId: target.id, ...after },
      reason, byUid: uid, afterPayout,
    });
    const approvedAssignments = Object.fromEntries(active.flatMap(doc => doc.data().approvedWork ? [[doc.id, doc.data().cleanerId]] : []));
    if (manager && removeApproval) {
      if (!assignment.approvedWork) return { removed: false };
      delete approvedAssignments[target.id];
      transaction.update(target.ref, { approvedWork: FieldValue.delete(), payoutCents: FieldValue.delete() });
      transaction.update(jobRef, { approvedAssignments, ...clearApprovedAssignmentBilling(job) });
      correction("APPROVAL_REMOVED", { minutes: assignment.approvedWork.minutes, payoutCents: assignment.payoutCents ?? null },
        { minutes: null, payoutCents: null }, "Manager removed the worked time approval.");
      return { removed: true };
    }
    const rate = await loadWorkedTimeRate(transaction, jobRef, ids, job, assignment);
    const clientHourly = job.billing?.mode === "HOURLY";
    if (rate.unresolved || (!rate.hourly && !(manager && (clientHourly || assignment.reportedWork || assignment.approvedWork)))
      || (rate.hourly && hourlyAmountCents(rate.rate, 0) === null)) {
      throw new HttpsError("failed-precondition", "Eligible hourly pricing is required.");
    }
    if (assignment.approvedWork && !manager) {
      throw new HttpsError("failed-precondition", "Worked time is already approved.");
    }
    const useReport = input.minutes === undefined && input.start === undefined && input.end === undefined;
    const minutes = submission?.minutes ?? (useReport ? assignment.reportedWork?.minutes : roundedWorkedMinutes(input, true));
    if (manager && normalizeServiceType(job.serviceType) === "AIRBNB_TOUCH_UP" && minutes > 120 && useReport) {
      throw new HttpsError("failed-precondition", "Explicitly adjust a touch-up that exceeds two hours.");
    }
    if (!validApprovedMinutes(minutes)) {
      throw new HttpsError("failed-precondition", "Reported or adjusted time is required.");
    }
    if (!manager) {
      transaction.update(target.ref, { reportedWork: { ...submission, reportedAt: FieldValue.serverTimestamp() } });
      return { minutes };
    }
    const payoutCents = rate.hourly ? hourlyAmountCents(rate.rate, minutes) : assignment.payoutCents ?? null;
    approvedAssignments[target.id] = assignment.cleanerId;
    const approved = active.map(doc => doc.id === target.id
      ? { assignmentId: doc.id, cleanerId: assignment.cleanerId, minutes }
      : { assignmentId: doc.id, cleanerId: doc.data().cleanerId, minutes: doc.data().approvedWork?.minutes });
    transaction.update(jobRef, {
      approvedAssignments,
      ...approvedAssignmentBillingUpdate(job, clientHourly, approved),
    });
    transaction.update(target.ref, {
      approvedWork: { minutes, approvedByUid: uid, approvedAt: FieldValue.serverTimestamp() },
      ...(rate.hourly && { payoutCents }),
    });
    const beforeMinutes = assignment.approvedWork?.minutes ?? assignment.reportedWork?.minutes;
    if (beforeMinutes != null && beforeMinutes !== minutes) {
      correction("WORKED_TIME", { minutes: beforeMinutes, payoutCents: assignment.payoutCents ?? null },
        { minutes, payoutCents }, "Manager adjusted worked time.");
    }
    return { minutes, payoutCents };
  });
}
