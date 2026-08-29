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
import { getCleanerNamesById } from "../cleaners/cleanerService.js";
import { getOpenJobIssues } from "../issues/issueService.js";
import {
  getInterestedJobOffers,
  getPendingJobOffers,
} from "../jobs/jobOfferService.js";
import { normalizeJobRecord } from "../jobs/jobCompatibility.js";

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
  return normalizeJobRecord(snapshot.data(), snapshot.id);
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

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function localWeekStart(date) {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addLocalDays(date, -mondayOffset);
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
  const weekStart = localWeekStart(now);
  const nextWeekStart = addLocalDays(weekStart, 7);
  const weekStartDate = localDateKey(weekStart);
  const weekEndDate = localDateKey(addLocalDays(weekStart, 6));
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    localDateKey(addLocalDays(weekStart, index)),
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
    weeklyScheduledCount,
    weeklyAssignedCount,
    weeklyNeedsAssignmentCount,
    weeklyCompletedCount,
    dailyLoadCounts,
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
    getCountFromServer(
      query(
        jobs,
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getCountFromServer(
      query(
        jobs,
        where("operationalStatus", "==", "ASSIGNED"),
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getCountFromServer(
      query(
        jobs,
        where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]),
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getCountFromServer(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        where("completedAt", ">=", Timestamp.fromDate(weekStart)),
        where("completedAt", "<", Timestamp.fromDate(nextWeekStart)),
        orderBy("completedAt", "desc"),
      ),
    ),
    Promise.all(
      weekDays.map((date) =>
        getCountFromServer(query(jobs, where("scheduledDate", "==", date))),
      ),
    ),
  ]);
  const attentionJobs = attentionSnapshot.docs.map(jobFromSnapshot);
  const inProgressJobs = inProgressSnapshot.docs.map(jobFromSnapshot);
  const recentlyCompletedJobs = recentlyCompletedSnapshot.docs.map(jobFromSnapshot);
  const next48HoursJobs = next48HoursSnapshot.docs
    .map(jobFromSnapshot)
    .filter((job) => isWithinNext48Hours(job, now, windowEnd))
    .sort(sortByScheduledDateTime);
  const offeredAttentionJobs = attentionJobs.filter(
    (job) => job.operationalStatus === "OFFERED",
  );
  const issueCandidateJobs = uniqueJobs([
    ...inProgressJobs,
    ...recentlyCompletedJobs,
  ]);
  const [offeredJobOffers, issueGroups] = await Promise.all([
    Promise.all(
      offeredAttentionJobs.map(async (job) => {
        const [interestedOffers, pendingOffers] = await Promise.all([
          getInterestedJobOffers(job.id),
          getPendingJobOffers(job.id),
        ]);

        return {
          jobId: job.id,
          interestedOffers,
          hasPendingOffer: pendingOffers.length > 0,
        };
      }),
    ),
    Promise.all(
      issueCandidateJobs.map(async (job) => ({
        job,
        issues: await getOpenJobIssues(job.id),
      })),
    ),
  ]);
  const cleanerNamesById = await getCleanerNamesById([
    ...recentlyCompletedJobs.map((job) => job.assignedCleanerId),
    ...next48HoursJobs.map((job) => job.assignedCleanerId),
    ...offeredJobOffers.flatMap(({ interestedOffers }) =>
      interestedOffers.map((offer) => offer.cleanerId),
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
      offeredJobOffers.map(({ jobId, interestedOffers }) => [jobId, interestedOffers]),
    ),
    pendingOffersByJob: Object.fromEntries(
      offeredJobOffers.map(({ jobId, hasPendingOffer }) => [jobId, hasPendingOffer]),
    ),
    cleanerNamesById,
    openIssues: issueGroups.flatMap(({ job, issues }) =>
      issues.map((issue) => ({ ...issue, job })),
    ),
    next48HoursJobs,
    recentlyCompletedJobs,
    weeklySummary: {
      scheduled: weeklyScheduledCount.data().count,
      assigned: weeklyAssignedCount.data().count,
      needsAssignment: weeklyNeedsAssignmentCount.data().count,
      completed: weeklyCompletedCount.data().count,
      dailyLoad: weekDays.map((date, index) => ({
        date,
        count: dailyLoadCounts[index].data().count,
      })),
    },
  };
}
