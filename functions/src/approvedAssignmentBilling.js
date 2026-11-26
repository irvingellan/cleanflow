import { maxCleanersPerJob, rosterCleanerIds } from "./offerSlots.js";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

export function clearApprovedAssignmentBilling(job) {
  return job.billing?.hours?.source === "APPROVED_ASSIGNMENTS" ? { "billing.hours": FieldValue.delete() } : {};
}

export function assertUnapprovedAssignment(assignment) {
  if (assignment.approvedWork) {
    throw new HttpsError("failed-precondition", "Remove the worked time approval before changing the assignment.", {
      reason: "assignment-has-approved-work",
    });
  }
}

export function approvedAssignmentBillingUpdate(job, clientHourly, assignments) {
  const roster = rosterCleanerIds(job);
  const team = roster.map(cleanerId => assignments.filter(item => item.cleanerId === cleanerId));
  if (clientHourly && roster.length && team.every(items => items.length === 1 && validApprovedMinutes(items[0].minutes))) {
    return { "billing.hours": {
      approved: true,
      approvedMinutes: team.reduce((sum, [item]) => sum + item.minutes, 0),
      source: "APPROVED_ASSIGNMENTS",
      roster,
      assignmentIds: team.map(([item]) => item.assignmentId).sort(),
    } };
  }
  return clearApprovedAssignmentBilling(job);
}

export function validApprovedMinutes(minutes) {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 && minutes % 5 === 0;
}

export async function activeApprovedAssignments(transaction, jobRef, job, ids) {
  const roster = rosterCleanerIds(job);
  if (!roster.length) return [];
  const snapshot = await transaction.get(jobRef.collection("assignments")
    .where("isActive", "==", true).limit(maxCleanersPerJob + 1));
  if (snapshot.size > maxCleanersPerJob) throw new HttpsError("failed-precondition", "The roster needs review.");
  const active = snapshot.docs.filter(doc => {
    const { cleanerId, organizationId, jobId } = doc.data();
    return roster.includes(cleanerId) && (organizationId == null || organizationId === ids.organizationId)
      && (jobId == null || jobId === ids.jobId);
  });
  if (new Set(active.map(doc => doc.data().cleanerId)).size !== active.length) {
    throw new HttpsError("failed-precondition", "The roster needs review.");
  }
  return active.filter(doc => validApprovedMinutes(doc.data().approvedWork?.minutes));
}
