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
