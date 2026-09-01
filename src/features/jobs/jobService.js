import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";
import {
  buildCurrentJobCreateData,
  isAssignmentAwareJob,
  normalizeJobRecord,
} from "./jobCompatibility.js";

const organizationId = "cleanflow-demo";
const jobWorklistLimit = 100;
const upcomingSummaryLimit = 3;
const activeOperationalStatuses = [
  "UNASSIGNED",
  "OFFERED",
  "ASSIGNED",
  "IN_PROGRESS",
];

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

function jobDocument(jobId) {
  return doc(db, "organizations", organizationId, "jobs", jobId);
}

function jobFromSnapshot(snapshot) {
  return normalizeJobRecord(snapshot.data(), snapshot.id);
}

function currentLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentLocalDayStart() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function propertyIdsInGroups(propertyIds) {
  const groups = [];

  for (let index = 0; index < propertyIds.length; index += 30) {
    groups.push(propertyIds.slice(index, index + 30));
  }

  return groups;
}

function uniqueJobs(jobs) {
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
}

function historySortValue(job) {
  const completedAt = job.completedAt?.toMillis?.();

  if (completedAt) {
    return completedAt;
  }

  const scheduledAt = new Date(`${job.scheduledDate || ""}T00:00:00`).getTime();
  return Number.isNaN(scheduledAt) ? 0 : scheduledAt;
}

function recentJobsFromSnapshots(snapshots) {
  return uniqueJobs(
    snapshots.flatMap((snapshot) => snapshot.docs.map(jobFromSnapshot)),
  )
    .sort((firstJob, secondJob) => historySortValue(secondJob) - historySortValue(firstJob))
    .slice(0, 10);
}

function upcomingJobSortValue(job) {
  return `${job.scheduledDate || ""}T${job.scheduledStart || ""}`;
}

function upcomingJobsFromSnapshots(snapshots) {
  return uniqueJobs(
    snapshots.flatMap((snapshot) => snapshot.docs.map(jobFromSnapshot)),
  ).sort((firstJob, secondJob) =>
    upcomingJobSortValue(firstJob).localeCompare(upcomingJobSortValue(secondJob)),
  );
}

function activeStatusesForFilter(status) {
  if (status === "needs-assignment") return ["UNASSIGNED", "OFFERED"];
  if (status === "offered") return ["OFFERED"];
  if (status === "assigned") return ["ASSIGNED"];
  if (status === "in-progress") return ["IN_PROGRESS"];
  return activeOperationalStatuses;
}

function scheduledDateConstraints(datePreset) {
  const today = currentLocalDate();

  if (datePreset === "today") {
    return [where("scheduledDate", "==", today)];
  }

  if (datePreset === "next-7-days") {
    return [
      where("scheduledDate", ">=", today),
      where("scheduledDate", "<=", currentLocalDate(addLocalDays(new Date(), 7))),
    ];
  }

  if (datePreset === "past-7-days" || datePreset === "past-30-days") {
    const days = datePreset === "past-7-days" ? 7 : 30;
    return [
      where("scheduledDate", ">=", currentLocalDate(addLocalDays(new Date(), -days))),
      where("scheduledDate", "<", today),
    ];
  }

  return [];
}

function completedAtConstraints(datePreset) {
  const dayStart = currentLocalDayStart();

  if (datePreset === "today") {
    return [
      where("completedAt", ">=", Timestamp.fromDate(dayStart)),
      where("completedAt", "<", Timestamp.fromDate(addLocalDays(dayStart, 1))),
    ];
  }

  if (datePreset === "next-7-days") {
    return [
      where("completedAt", ">=", Timestamp.fromDate(addLocalDays(dayStart, 1))),
      where("completedAt", "<", Timestamp.fromDate(addLocalDays(dayStart, 8))),
    ];
  }

  if (datePreset === "past-7-days" || datePreset === "past-30-days") {
    const days = datePreset === "past-7-days" ? 7 : 30;
    return [
      where("completedAt", ">=", Timestamp.fromDate(addLocalDays(dayStart, -days))),
      where("completedAt", "<", Timestamp.fromDate(dayStart)),
    ];
  }

  return [];
}

function pagedJobQuery(constraints, cursor) {
  return query(
    jobsCollection(),
    ...constraints,
    ...(cursor ? [startAfter(cursor)] : []),
    limit(jobWorklistLimit + 1),
  );
}

function pageFromSnapshot(snapshot) {
  const documents = snapshot.docs.slice(0, jobWorklistLimit);

  return {
    jobs: documents.map(jobFromSnapshot),
    cursor: documents.at(-1) || null,
    hasMore: snapshot.docs.length > jobWorklistLimit,
  };
}

export async function getJobs(
  { status = "all", datePreset = "any" } = {},
  {
    activeCursor = null,
    completedCursor = null,
    activeExhausted = false,
    completedExhausted = false,
  } = {},
) {
  const shouldLoadCompleted = status === "all" || status === "completed";
  const shouldLoadActive = status !== "completed";
  const activeStatuses = activeStatusesForFilter(status);
  const activeQuery = shouldLoadActive && !activeExhausted
    ? getDocs(pagedJobQuery([
        where("operationalStatus", "in", activeStatuses),
        ...scheduledDateConstraints(datePreset),
        orderBy("scheduledDate", "asc"),
      ], activeCursor))
    : Promise.resolve(null);
  // Completed work is filtered and ordered by when it actually completed; active work uses
  // its scheduled date so upcoming and overdue operations remain visible in schedule order.
  const completedQuery = shouldLoadCompleted && !completedExhausted
    ? getDocs(pagedJobQuery([
        where("operationalStatus", "==", "COMPLETED"),
        ...completedAtConstraints(datePreset),
        orderBy("completedAt", "desc"),
      ], completedCursor))
    : Promise.resolve(null);
  const [activeSnapshot, completedSnapshot] = await Promise.all([activeQuery, completedQuery]);
  const activePage = activeSnapshot ? pageFromSnapshot(activeSnapshot) : null;
  const completedPage = completedSnapshot ? pageFromSnapshot(completedSnapshot) : null;

  // Cleaner/property/search controls refine these bounded, status/date-indexed candidates.
  // Combining every optional filter in Firestore would require an unsustainable index matrix.
  return {
    jobs: uniqueJobs([
      ...(activePage?.jobs || []),
      ...(completedPage?.jobs || []),
    ]),
    nextPageCursors: {
      activeCursor: activePage?.hasMore ? activePage.cursor : null,
      completedCursor: completedPage?.hasMore ? completedPage.cursor : null,
      activeExhausted: !shouldLoadActive || !activePage?.hasMore,
      completedExhausted: !shouldLoadCompleted || !completedPage?.hasMore,
    },
    hasMore: Boolean(activePage?.hasMore || completedPage?.hasMore),
  };
}

export async function getPropertyJobHistory(propertyId) {
  const today = currentLocalDate();
  const jobs = jobsCollection();
  const [upcomingSnapshot, scheduledHistorySnapshot, completedHistorySnapshot] = await Promise.all([
    getDocs(
      query(
        jobs,
        where("propertyId", "==", propertyId),
        where("operationalStatus", "in", [
          "UNASSIGNED",
          "OFFERED",
          "ASSIGNED",
          "IN_PROGRESS",
        ]),
        where("scheduledDate", ">=", today),
        orderBy("scheduledDate", "asc"),
        limit(upcomingSummaryLimit + 1),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("propertyId", "==", propertyId),
        where("scheduledDate", "<", today),
        orderBy("scheduledDate", "desc"),
        limit(10),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("propertyId", "==", propertyId),
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
        limit(10),
      ),
    ),
  ]);

  const upcomingJobs = upcomingJobsFromSnapshots([upcomingSnapshot]);

  return {
    upcomingJob: upcomingJobs[0] || null,
    upcomingJobs: upcomingJobs.slice(0, upcomingSummaryLimit),
    hasMoreUpcoming: upcomingJobs.length > upcomingSummaryLimit,
    recentJobs: recentJobsFromSnapshots([
      scheduledHistorySnapshot,
      completedHistorySnapshot,
    ]),
  };
}

export async function getCleanerJobHistory(cleanerId) {
  const today = currentLocalDate();
  const jobs = jobsCollection();
  const [upcomingSnapshot, scheduledHistorySnapshot, completedHistorySnapshot] = await Promise.all([
    getDocs(
      query(
        jobs,
        where("assignedCleanerId", "==", cleanerId),
        where("operationalStatus", "in", ["ASSIGNED", "IN_PROGRESS"]),
        where("scheduledDate", ">=", today),
        orderBy("scheduledDate", "asc"),
        limit(5),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("assignedCleanerId", "==", cleanerId),
        where("scheduledDate", "<", today),
        orderBy("scheduledDate", "desc"),
        limit(10),
      ),
    ),
    getDocs(
      query(
        jobs,
        where("assignedCleanerId", "==", cleanerId),
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
        limit(10),
      ),
    ),
  ]);

  return {
    upcomingJobs: upcomingSnapshot.docs.map(jobFromSnapshot),
    recentJobs: recentJobsFromSnapshots([
      scheduledHistorySnapshot,
      completedHistorySnapshot,
    ]),
  };
}

export async function getClientJobHistory(clientId, propertyIds) {
  const today = currentLocalDate();
  const jobs = jobsCollection();
  const activeStatuses = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS"];
  const propertyIdGroups = propertyIdsInGroups(propertyIds);
  const upcomingQueries = [
    query(
      jobs,
      where("clientId", "==", clientId),
      where("operationalStatus", "in", activeStatuses),
      where("scheduledDate", ">=", today),
      orderBy("scheduledDate", "asc"),
      limit(upcomingSummaryLimit + 1),
    ),
    ...propertyIdGroups.flatMap((propertyIdGroup) =>
      activeStatuses.map((operationalStatus) =>
        query(
          jobs,
          where("propertyId", "in", propertyIdGroup),
          where("operationalStatus", "==", operationalStatus),
          where("scheduledDate", ">=", today),
          orderBy("scheduledDate", "asc"),
          limit(upcomingSummaryLimit + 1),
        ),
      ),
    ),
  ];
  const historyQueries = [
    query(
      jobs,
      where("clientId", "==", clientId),
      where("scheduledDate", "<", today),
      orderBy("scheduledDate", "desc"),
      limit(10),
    ),
    ...propertyIdGroups.map((propertyIdGroup) =>
      query(
        jobs,
        where("propertyId", "in", propertyIdGroup),
        where("scheduledDate", "<", today),
        orderBy("scheduledDate", "desc"),
        limit(10),
      ),
    ),
  ];
  const completedHistoryQueries = [
    query(
      jobs,
      where("clientId", "==", clientId),
      where("operationalStatus", "==", "COMPLETED"),
      orderBy("completedAt", "desc"),
      limit(10),
    ),
    ...propertyIdGroups.map((propertyIdGroup) =>
      query(
        jobs,
        where("propertyId", "in", propertyIdGroup),
        where("operationalStatus", "==", "COMPLETED"),
        orderBy("completedAt", "desc"),
        limit(10),
      ),
    ),
  ];
  const [upcomingSnapshots, historySnapshots, completedHistorySnapshots] = await Promise.all([
    Promise.all(upcomingQueries.map((jobQuery) => getDocs(jobQuery))),
    Promise.all(historyQueries.map((jobQuery) => getDocs(jobQuery))),
    Promise.all(completedHistoryQueries.map((jobQuery) => getDocs(jobQuery))),
  ]);
  const upcomingJobs = upcomingJobsFromSnapshots(upcomingSnapshots);
  const recentJobs = recentJobsFromSnapshots([
    ...historySnapshots,
    ...completedHistorySnapshots,
  ]);

  return {
    upcomingJob: upcomingJobs[0] || null,
    upcomingJobs: upcomingJobs.slice(0, upcomingSummaryLimit),
    hasMoreUpcoming: upcomingJobs.length > upcomingSummaryLimit,
    recentJobs,
  };
}

export async function assignCleanerToJob(jobId, cleaner) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (isAssignmentAwareJob(job)) {
      const error = new Error("Assignment-aware Jobs use the team assignment workflow.");
      error.code = "assignment-aware-job";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    if (job.assignedCleanerId || job.operationalStatus === "ASSIGNED") {
      const error = new Error("This job is already assigned.");
      error.code = "job-already-assigned";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    transaction.update(reference, {
      assignedCleanerId: cleaner.id,
      assignedCleanerName: cleaner.name,
      assignedAt: serverTimestamp(),
      operationalStatus: "ASSIGNED",
    });
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function startAssignedJob(jobId) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (isAssignmentAwareJob(job)) {
      const error = new Error("Team Job execution is not available in this slice.");
      error.code = "assignment-aware-execution-deferred";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    if (job.operationalStatus !== "ASSIGNED") {
      const error = new Error("This job cannot be started from its current status.");
      error.code = "invalid-job-transition";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    const updates = {
      operationalStatus: "IN_PROGRESS",
    };

    if (!job.startedAt) {
      updates.startedAt = serverTimestamp();
    }

    transaction.update(reference, updates);
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function completeInProgressJob(jobId) {
  const reference = jobDocument(jobId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists()) {
      const error = new Error("Job not found.");
      error.code = "job-not-found";
      throw error;
    }

    const job = snapshot.data();

    if (isAssignmentAwareJob(job)) {
      const error = new Error("Team Job execution is not available in this slice.");
      error.code = "assignment-aware-execution-deferred";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    if (job.operationalStatus !== "IN_PROGRESS") {
      const error = new Error("This job cannot be completed from its current status.");
      error.code = "invalid-job-transition";
      error.job = jobFromSnapshot(snapshot);
      throw error;
    }

    const updates = {
      operationalStatus: "COMPLETED",
    };

    if (!job.completedAt) {
      updates.completedAt = serverTimestamp();
    }

    transaction.update(reference, updates);
  });

  const snapshot = await getDoc(reference);
  return jobFromSnapshot(snapshot);
}

export async function createJob({
  propertyId,
  propertyName,
  clientId,
  clientName,
  scheduledDate,
  scheduledStart,
  clientPrice,
  cleanerPayout,
  notes,
  guestName,
}) {
  const job = buildCurrentJobCreateData({
    organizationId,
    propertyId,
    propertyName,
    clientId,
    clientName,
    scheduledDate,
    scheduledStart,
    clientPrice,
    cleanerPayout,
    notes,
    guestName,
  });
  const jobDocument = await addDoc(
    jobsCollection(),
    {
      ...job,
      createdAt: serverTimestamp(),
    },
  );

  return normalizeJobRecord(job, jobDocument.id);
}
