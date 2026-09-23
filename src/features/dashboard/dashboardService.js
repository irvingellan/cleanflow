import {
  collection,
  getDocs,
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

function propertiesCollection() {
  return collection(db, "organizations", organizationId, "properties");
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

/** Dashboard operational views never include archived Jobs or orphaned/archived Properties. */
export function filterVisibleActiveJobs(jobs, propertiesById) {
  return jobs.filter((job) => {
    const property = propertiesById[job.propertyId];
    return !job.archivedAt && Boolean(property) && !property.archivedAt;
  });
}

export function visibleDashboardCounts({ todayJobs, openJobs, inProgressJobs, completedTodayJobs }) {
  return {
    today: todayJobs.length,
    needsAssignment: openJobs.length,
    inProgress: inProgressJobs.length,
    completedToday: completedTodayJobs.length,
  };
}

export function composeAttentionJobCandidates(attentionJobs, next48HoursJobs) {
  // The stale-status query intentionally retains older open work, while the bounded
  // next-48-hours query guarantees current assignment gaps are available to rank.
  return uniqueJobs([
    ...attentionJobs,
    ...next48HoursJobs.filter((job) =>
      ["UNASSIGNED", "OFFERED"].includes(job.operationalStatus),
    ),
  ]);
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
    propertiesSnapshot,
    openJobsSnapshot,
    inProgressSnapshot,
    next48HoursSnapshot,
    recentlyCompletedSnapshot,
    weeklyScheduledSnapshot,
    weeklyCompletedSnapshot,
  ] = await Promise.all([
    getDocs(propertiesCollection()),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "IN_PROGRESS"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "in", activeOperationalStatuses),
        where("scheduledDate", ">=", today),
        where("scheduledDate", "<=", endDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("scheduledDate", ">=", weekStartDate),
        where("scheduledDate", "<=", weekEndDate),
        orderBy("scheduledDate", "asc"),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("operationalStatus", "==", "COMPLETED"),
        where("completedAt", ">=", Timestamp.fromDate(weekStart)),
        where("completedAt", "<", Timestamp.fromDate(nextWeekStart)),
        orderBy("completedAt", "desc"),
      ),
    ),
  ]);
  const propertiesById = Object.fromEntries(propertiesSnapshot.docs.map((property) => [
    property.id,
    property.data(),
  ]));
  const visibleJobs = (snapshot) => filterVisibleActiveJobs(
    snapshot.docs.map(jobFromSnapshot),
    propertiesById,
  );
  const openJobs = visibleJobs(openJobsSnapshot).sort(sortByScheduledDateTime);
  const inProgressJobs = visibleJobs(inProgressSnapshot).sort(sortByScheduledDateTime);
  const recentlyCompletedJobs = visibleJobs(recentlyCompletedSnapshot)
    .slice(0, recentlyCompletedJobLimit);
  const next48HoursJobs = visibleJobs(next48HoursSnapshot)
    .filter((job) => isWithinNext48Hours(job, now, windowEnd))
    .sort(sortByScheduledDateTime)
    .slice(0, next48HoursJobLimit);
  const weeklyScheduledJobs = visibleJobs(weeklyScheduledSnapshot);
  const weeklyCompletedJobs = visibleJobs(weeklyCompletedSnapshot);
  const todayJobs = weeklyScheduledJobs.filter((job) => job.scheduledDate === today);
  const completedTodayJobs = weeklyCompletedJobs.filter((job) => {
    const completedAt = job.completedAt?.toDate?.();
    return completedAt && completedAt >= todayStart && completedAt < tomorrowStart;
  });
  const attentionJobs = composeAttentionJobCandidates(
    openJobs.slice(0, attentionJobLimit),
    next48HoursJobs,
  );
  const offeredAttentionJobs = attentionJobs.filter(
    (job) => job.operationalStatus === "OFFERED",
  );
  const issueCandidateJobs = uniqueJobs([
    ...inProgressJobs.slice(0, issueCandidateJobLimit),
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
      ...visibleDashboardCounts({
        todayJobs,
        openJobs,
        inProgressJobs,
        completedTodayJobs,
      }),
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
      scheduled: weeklyScheduledJobs.length,
      assigned: weeklyScheduledJobs.filter((job) => job.operationalStatus === "ASSIGNED").length,
      needsAssignment: weeklyScheduledJobs.filter((job) =>
        ["UNASSIGNED", "OFFERED"].includes(job.operationalStatus),
      ).length,
      completed: weeklyCompletedJobs.length,
      dailyLoad: weekDays.map((date) => ({
        date,
        count: weeklyScheduledJobs.filter((job) => job.scheduledDate === date).length,
      })),
    },
  };
}
