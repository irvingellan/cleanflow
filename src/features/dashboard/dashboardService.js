import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import { getOpenJobIssues } from "../issues/issueService.js";
import { getInterestedJobOffers } from "../jobs/jobOfferService.js";

const organizationId = "cleanflow-demo";
const activeOperationalStatuses = [
  "UNASSIGNED",
  "OFFERED",
  "ASSIGNED",
  "IN_PROGRESS",
];
const attentionJobLimit = 10;
const issueCandidateJobLimit = 10;
const next48HoursJobLimit = 20;
const recentlyCompletedJobLimit = 5;

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

function jobFromSnapshot(snapshot) {
  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWithinNext48Hours(job, now, windowEnd) {
  if (!job.scheduledDate) {
    return false;
  }

  if (!job.scheduledStart) {
    const scheduledDayStart = new Date(`${job.scheduledDate}T00:00:00`);
    const scheduledDayEnd = new Date(`${job.scheduledDate}T23:59:59.999`);

    return scheduledDayStart <= windowEnd && scheduledDayEnd >= now;
  }

  const scheduledAt = new Date(`${job.scheduledDate}T${job.scheduledStart}`);
  return !Number.isNaN(scheduledAt.getTime()) && scheduledAt >= now && scheduledAt <= windowEnd;
}

function sortByScheduledDateTime(firstJob, secondJob) {
  return `${firstJob.scheduledDate || ""}T${firstJob.scheduledStart || ""}`.localeCompare(
    `${secondJob.scheduledDate || ""}T${secondJob.scheduledStart || ""}`,
  );
}

function uniqueJobs(jobs) {
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
}

export async function getOperationalDashboard() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const today = localDateKey(now);
  const endDate = localDateKey(windowEnd);
  const todayStart = localDayStart(now);
  const tomorrowStart = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    todayStart.getDate() + 1,
  );
  const jobs = jobsCollection();
  const [
    todayJobsCount,
    needsAssignmentCount,
    inProgressCount,
    completedTodayCount,
    attentionSnapshot,
    inProgressSnapshot,
    next48HoursSnapshot,
    recentlyCompletedSnapshot,
  ] = await Promise.all([
    getCountFromServer(query(jobs, where("scheduledDate", "==", today))),
    getCountFromServer(
      query(jobs, where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"])),
    ),
    getCountFromServer(query(jobs, where("operationalStatus", "==", "IN_PROGRESS"))),
    getCountFromServer(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        where("completedAt", ">=", Timestamp.fromDate(todayStart)),
        where("completedAt", "<", Timestamp.fromDate(tomorrowStart)),
        orderBy("completedAt", "desc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]),
        orderBy("scheduledDate", "asc"),
        limit(attentionJobLimit),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "IN_PROGRESS"),
        orderBy("scheduledDate", "asc"),
        limit(issueCandidateJobLimit),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", activeOperationalStatuses),
        where("scheduledDate", ">=", today),
        where("scheduledDate", "<=", endDate),
        orderBy("scheduledDate", "asc"),
        limit(next48HoursJobLimit),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
        limit(recentlyCompletedJobLimit),
      ),
    ),
  ]);
  const attentionJobs = attentionSnapshot.docs.map(jobFromSnapshot);
  const inProgressJobs = inProgressSnapshot.docs.map(jobFromSnapshot);
  const recentlyCompletedJobs = recentlyCompletedSnapshot.docs.map(jobFromSnapshot);
  const offeredAttentionJobs = attentionJobs.filter(
    (job) => job.operationalStatus === "OFFERED",
  );
  const issueCandidateJobs = uniqueJobs([
    ...inProgressJobs,
    ...recentlyCompletedJobs,
  ]);
  const [offeredJobOffers, issueGroups] = await Promise.all([
    Promise.all(
      offeredAttentionJobs.map(async (job) => ({
        jobId: job.id,
        offers: await getInterestedJobOffers(job.id),
      })),
    ),
    Promise.all(
      issueCandidateJobs.map(async (job) => ({
        job,
        issues: await getOpenJobIssues(job.id),
      })),
    ),
  ]);

  return {
    counts: {
      today: todayJobsCount.data().count,
      needsAssignment: needsAssignmentCount.data().count,
      inProgress: inProgressCount.data().count,
      completedToday: completedTodayCount.data().count,
      openIssues: issueGroups.flatMap(({ issues }) => issues).length,
    },
    attentionJobs,
    offersByJob: Object.fromEntries(
      offeredJobOffers.map(({ jobId, offers }) => [jobId, offers]),
    ),
    openIssues: issueGroups.flatMap(({ job, issues }) =>
      issues.map((issue) => ({ ...issue, job })),
    ),
    next48HoursJobs: next48HoursSnapshot.docs
      .map(jobFromSnapshot)
      .filter((job) => isWithinNext48Hours(job, now, windowEnd))
      .sort(sortByScheduledDateTime),
    recentlyCompletedJobs,
  };
}
