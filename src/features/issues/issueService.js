import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";
const issueCategories = [
  "ACCESS",
  "SUPPLIES",
  "BROKEN_ITEM",
  "HEAVY_CLEANING",
  "OTHER",
];

function issuesCollection(jobId) {
  return collection(
    db,
    "organizations",
    organizationId,
    "jobs",
    jobId,
    "issues",
  );
}

function issueDocument(jobId, issueId) {
  return doc(
    db,
    "organizations",
    organizationId,
    "jobs",
    jobId,
    "issues",
    issueId,
  );
}

function mapIssue(issueSnapshot) {
  return {
    ...issueSnapshot.data(),
    id: issueSnapshot.id,
  };
}

export async function getJobIssues(jobId) {
  const snapshot = await getDocs(issuesCollection(jobId));

  return snapshot.docs.map(mapIssue);
}

export async function getOpenJobIssues(jobId) {
  const snapshot = await getDocs(
    query(issuesCollection(jobId), where("status", "==", "OPEN"), limit(3)),
  );

  return snapshot.docs.map(mapIssue);
}

export async function createIssue({
  jobId,
  propertyId,
  cleanerId,
  cleanerName,
  category,
  description,
}) {
  if (!issueCategories.includes(category)) {
    throw new Error("Invalid issue category.");
  }

  const trimmedDescription = description.trim();

  if (!trimmedDescription) {
    throw new Error("Issue description is required.");
  }

  const issue = {
    jobId,
    cleanerId,
    cleanerName,
    category,
    description: trimmedDescription,
    status: "OPEN",
    createdAt: serverTimestamp(),
  };

  if (propertyId) {
    issue.propertyId = propertyId;
  }

  const issueDocument = await addDoc(issuesCollection(jobId), issue);
  return issueDocument.id;
}

export async function resolveIssue({ jobId, issueId, resolutionNote }) {
  const issueReference = issueDocument(jobId, issueId);
  const trimmedResolutionNote = resolutionNote.trim();

  await runTransaction(db, async (transaction) => {
    const issueSnapshot = await transaction.get(issueReference);

    if (!issueSnapshot.exists()) {
      const error = new Error("Issue not found.");
      error.code = "issue-not-found";
      throw error;
    }

    const issue = issueSnapshot.data();

    if (issue.status !== "OPEN") {
      const error = new Error("Issue is already resolved.");
      error.code = "issue-not-open";
      error.issue = mapIssue(issueSnapshot);
      throw error;
    }

    transaction.update(issueReference, {
      status: "RESOLVED",
      resolvedAt: serverTimestamp(),
      resolutionNote: trimmedResolutionNote,
    });
  });

  const resolvedIssueSnapshot = await getDoc(issueReference);
  return mapIssue(resolvedIssueSnapshot);
}
