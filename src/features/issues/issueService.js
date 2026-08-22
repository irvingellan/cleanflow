import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
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

export async function getJobIssues(jobId) {
  const snapshot = await getDocs(issuesCollection(jobId));

  return snapshot.docs.map((issueDocument) => ({
    ...issueDocument.data(),
    id: issueDocument.id,
  }));
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
