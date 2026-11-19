import { FieldPath } from "firebase-admin/firestore";
import { cleanerAccountUid } from "./cleanerHubAccess.js";
import { isoDate } from "./platformOverview.js";

const key = FieldPath.documentId();

async function latest(query, field) {
  const snapshot = await query.orderBy(field, "desc").select(field).limit(1).get();
  return isoDate(snapshot.docs[0]?.get(field));
}

function cleanerRecords(org, collection, identityField, cleanerId, timestampField) {
  // Draft receipts have no organizationId. Scope by ancestor document name,
  // including for cleaners whose local ID is reused in another organization.
  return org.firestore.collectionGroup(collection).where(identityField, "==", cleanerId)
    .where(timestampField, ">=", new Date(0))
    .where(key, ">=", org).where(key, "<", org.parent.doc(org.id + "\u0000"));
}

export async function readCleanerActivity(org, cleanerId, uid = cleanerAccountUid(org.id, cleanerId)) {
  const session = org.collection("cleanerHubAccess").doc(cleanerId);
  const [access] = await org.firestore.getAll(session, { fieldMask: ["linkedAt"] });
  // updatedAt on the access document or run can be a manager action.
  // Only observe records written by a cleaner action, and never fetch tokens or answers.
  const queries = [
    ["notifications", org.collection("cleanerPushAccounts").doc(uid).collection("devices"), "lastSeenAt"],
    ["agenda", cleanerRecords(org, "assignments", "cleanerId", cleanerId, "cleanerAcknowledgedAt"), "cleanerAcknowledgedAt"],
    ["checklist", cleanerRecords(org, "checklistRuns", "readyForReviewCleanerId", cleanerId, "readyForReviewAt"), "readyForReviewAt"],
    ["checklist", cleanerRecords(org, "draftMutations", "cleanerId", cleanerId, "createdAt"), "createdAt"],
  ];
  const signals = await Promise.all(queries.map(async ([activitySource, query, field]) =>
    ({ activitySource, lastActivityAt: await latest(query, field) })));
  signals.push({ activitySource: "agenda", lastActivityAt: isoDate(access.get("linkedAt")) });
  return signals.filter((signal) => signal.lastActivityAt)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0] || { activitySource: null, lastActivityAt: null };
}
