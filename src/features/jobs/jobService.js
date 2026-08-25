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
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../services/firebase/client.js";

const organizationId = "cleanflow-demo";

function jobsCollection() {
  return collection(db, "organizations", organizationId, "jobs");
}

function jobDocument(jobId) {
  return doc(db, "organizations", organizationId, "jobs", jobId);
}

function jobFromSnapshot(snapshot) {
  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}

function currentLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentLocalDayStart() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

export async function getJobs(filter = "all") {
  const constraints = [];

  if (filter === "today") {
    constraints.push(where("scheduledDate", "==", currentLocalDate()));
  }

  if (filter === "needs-assignment") {
    constraints.push(where("operationalStatus", "in", ["UNASSIGNED", "OFFERED"]));
  }

  if (filter === "in-progress") {
    constraints.push(where("operationalStatus", "==", "IN_PROGRESS"));
  }

  if (filter === "completed-today") {
    const dayStart = currentLocalDayStart();
    const nextDayStart = new Date(
      dayStart.getFullYear(),
      dayStart.getMonth(),
      dayStart.getDate() + 1,
    );

    constraints.push(
      where("operationalStatus", "==", "COMPLETED"),
      where("completedAt", ">=", Timestamp.fromDate(dayStart)),
      where("completedAt", "<", Timestamp.fromDate(nextDayStart)),
      orderBy("completedAt", "desc"),
    );
  }

  const snapshot = await getDocs(
    constraints.length > 0 ? query(jobsCollection(), ...constraints) : jobsCollection(),
  );

  return snapshot.docs.map(jobFromSnapshot);
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
        limit(1),
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

  return {
    upcomingJob: upcomingSnapshot.empty ? null : jobFromSnapshot(upcomingSnapshot.docs[0]),
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
      limit(1),
    ),
    ...propertyIdGroups.flatMap((propertyIdGroup) =>
      activeStatuses.map((operationalStatus) =>
        query(
          jobs,
          where("propertyId", "in", propertyIdGroup),
          where("operationalStatus", "==", operationalStatus),
          where("scheduledDate", ">=", today),
          orderBy("scheduledDate", "asc"),
          limit(1),
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
  const byScheduledDateAscending = (firstJob, secondJob) =>
    (firstJob.scheduledDate || "").localeCompare(secondJob.scheduledDate || "");
  const upcomingJobs = uniqueJobs(
    upcomingSnapshots.flatMap((snapshot) => snapshot.docs.map(jobFromSnapshot)),
  ).sort(byScheduledDateAscending);
  const recentJobs = recentJobsFromSnapshots([
    ...historySnapshots,
    ...completedHistorySnapshots,
  ]);

  return {
    upcomingJob: upcomingJobs[0] || null,
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
  clientName,
  scheduledDate,
  clientPrice,
  cleanerPayout,
  notes,
}) {
  const jobDocument = await addDoc(
    jobsCollection(),
    {
      organizationId,
      propertyId,
      propertyName,
      clientName,
      scheduledDate,
      clientPrice,
      cleanerPayout,
      notes,
      operationalStatus: "UNASSIGNED",
      createdAt: serverTimestamp(),
    },
  );

  return jobDocument.id;
}
