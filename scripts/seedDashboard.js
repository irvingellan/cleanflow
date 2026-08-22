import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, Timestamp, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

const organizationId = "cleanflow-demo";

const properties = {
  secondAve: {
    id: "2031-second-ave",
    name: "2031 Second Ave",
    clientName: "Carl",
    clientPrice: 350,
    cleanerPayout: 200,
  },
  oliverAve: {
    id: "1964-oliver-ave",
    name: "1964 Oliver Ave",
    clientName: "Carl",
    clientPrice: 200,
    cleanerPayout: 100,
  },
  newboldCt: {
    id: "6816-newbold-ct",
    name: "6816 Newbold Ct",
    clientName: "Carl",
    clientPrice: 275,
    cleanerPayout: 150,
  },
  echoDrive: {
    id: "8845-echo-drive",
    name: "8845 Echo Drive",
    clientName: "Sara",
    clientPrice: 400,
    cleanerPayout: 220,
  },
  ryleiSt: {
    id: "5548-rylei-st",
    name: "5548 Rylei St",
    clientName: "Rafael",
    clientPrice: 325,
    cleanerPayout: 180,
  },
};

const cleaners = {
  agnes: { id: "agnes", name: "Agnes" },
  carla: { id: "carla", name: "Carla" },
  douglas: { id: "douglas", name: "Douglas" },
  eloisa: { id: "eloisa", name: "Eloisa" },
  erika: { id: "erika", name: "Erika" },
  ingrid: { id: "ingrid", name: "Ingrid" },
  mary: { id: "mary", name: "Mary" },
  mayara: { id: "mayara", name: "Mayara" },
};

function timestamp(dateTime) {
  return Timestamp.fromDate(new Date(`${dateTime}Z`));
}

function timestampAfter(dateTime, minutes) {
  return Timestamp.fromMillis(new Date(dateTime).getTime() + minutes * 60_000);
}

function job(id, property, scheduledDate, operationalStatus, lifecycle = {}) {
  return {
    id,
    data: {
      organizationId,
      propertyId: property.id,
      propertyName: property.name,
      clientName: property.clientName,
      scheduledDate,
      clientPrice: property.clientPrice,
      cleanerPayout: property.cleanerPayout,
      notes: `DASHBOARD DEMO - ${operationalStatus.replace("_", " ")}`,
      operationalStatus,
      createdAt: timestamp("2026-08-21T16:00:00"),
      ...lifecycle,
    },
  };
}

function assignment(cleaner, assignedAt) {
  return {
    offeredAt: timestamp("2026-08-21T13:00:00"),
    assignedCleanerId: cleaner.id,
    assignedCleanerName: cleaner.name,
    assignedAt: timestamp(assignedAt),
  };
}

const jobs = [
  job("dashboard-demo-unassigned-1", properties.oliverAve, "2026-08-22", "UNASSIGNED"),
  job("dashboard-demo-unassigned-2", properties.ryleiSt, "2026-08-23", "UNASSIGNED"),
  job("dashboard-demo-unassigned-3", properties.echoDrive, "2026-08-27", "UNASSIGNED"),
  job("dashboard-demo-offered-1", properties.secondAve, "2026-08-22", "OFFERED", {
    offeredAt: timestamp("2026-08-21T17:00:00"),
  }),
  job("dashboard-demo-offered-2", properties.newboldCt, "2026-08-23", "OFFERED", {
    offeredAt: timestamp("2026-08-21T17:15:00"),
  }),
  job("dashboard-demo-offered-3", properties.ryleiSt, "2026-08-28", "OFFERED", {
    offeredAt: timestamp("2026-08-21T17:30:00"),
  }),
  job("dashboard-demo-assigned-1", properties.echoDrive, "2026-08-24", "ASSIGNED", assignment(cleaners.agnes, "2026-08-21T18:00:00")),
  job("dashboard-demo-assigned-2", properties.oliverAve, "2026-08-25", "ASSIGNED", assignment(cleaners.eloisa, "2026-08-21T18:15:00")),
  job("dashboard-demo-assigned-3", properties.newboldCt, "2026-08-27", "ASSIGNED", assignment(cleaners.erika, "2026-08-21T18:30:00")),
  job("dashboard-demo-in-progress-1", properties.secondAve, "2026-08-24", "IN_PROGRESS", {
    ...assignment(cleaners.mary, "2026-08-22T08:00:00"),
    startedAt: timestamp("2026-08-22T09:15:00"),
  }),
  job("dashboard-demo-in-progress-2", properties.ryleiSt, "2026-08-25", "IN_PROGRESS", {
    ...assignment(cleaners.douglas, "2026-08-22T08:30:00"),
    startedAt: timestamp("2026-08-22T10:00:00"),
  }),
  job("dashboard-demo-in-progress-3", properties.echoDrive, "2026-08-28", "IN_PROGRESS", {
    ...assignment(cleaners.ingrid, "2026-08-22T09:00:00"),
    startedAt: timestamp("2026-08-22T10:30:00"),
  }),
  job("dashboard-demo-completed-1", properties.oliverAve, "2026-08-22", "COMPLETED", {
    ...assignment(cleaners.carla, "2026-08-21T14:30:00"),
    startedAt: timestamp("2026-08-22T07:30:00"),
    completedAt: timestamp("2026-08-22T09:45:00"),
  }),
  job("dashboard-demo-completed-2", properties.newboldCt, "2026-08-23", "COMPLETED", {
    ...assignment(cleaners.mayara, "2026-08-21T15:00:00"),
    startedAt: timestamp("2026-08-23T08:00:00"),
    completedAt: timestamp("2026-08-23T10:30:00"),
  }),
  job("dashboard-demo-completed-3", properties.ryleiSt, "2026-08-24", "COMPLETED", {
    ...assignment(cleaners.agnes, "2026-08-21T15:30:00"),
    startedAt: timestamp("2026-08-24T09:00:00"),
    completedAt: timestamp("2026-08-24T11:15:00"),
  }),
];

const offers = [
  ["dashboard-demo-offered-1", cleaners.agnes, "PENDING"],
  ["dashboard-demo-offered-1", cleaners.carla, "INTERESTED"],
  ["dashboard-demo-offered-1", cleaners.douglas, "DECLINED"],
  ["dashboard-demo-offered-2", cleaners.eloisa, "INTERESTED"],
  ["dashboard-demo-offered-2", cleaners.erika, "PENDING"],
  ["dashboard-demo-offered-2", cleaners.ingrid, "DECLINED"],
  ["dashboard-demo-offered-3", cleaners.mayara, "PENDING"],
  ["dashboard-demo-offered-3", cleaners.mary, "INTERESTED"],
  ["dashboard-demo-offered-3", cleaners.douglas, "DECLINED"],
  ["dashboard-demo-assigned-1", cleaners.agnes, "INTERESTED"],
  ["dashboard-demo-assigned-1", cleaners.carla, "DECLINED"],
  ["dashboard-demo-assigned-2", cleaners.eloisa, "INTERESTED"],
  ["dashboard-demo-assigned-2", cleaners.mary, "DECLINED"],
  ["dashboard-demo-assigned-3", cleaners.erika, "INTERESTED"],
  ["dashboard-demo-assigned-3", cleaners.ingrid, "DECLINED"],
  ["dashboard-demo-in-progress-1", cleaners.mary, "INTERESTED"],
  ["dashboard-demo-in-progress-1", cleaners.mayara, "INTERESTED"],
  ["dashboard-demo-in-progress-2", cleaners.douglas, "INTERESTED"],
  ["dashboard-demo-in-progress-2", cleaners.agnes, "DECLINED"],
  ["dashboard-demo-in-progress-3", cleaners.ingrid, "INTERESTED"],
  ["dashboard-demo-in-progress-3", cleaners.erika, "INTERESTED"],
  ["dashboard-demo-completed-1", cleaners.carla, "INTERESTED"],
  ["dashboard-demo-completed-1", cleaners.mary, "DECLINED"],
  ["dashboard-demo-completed-2", cleaners.mayara, "INTERESTED"],
  ["dashboard-demo-completed-2", cleaners.douglas, "DECLINED"],
  ["dashboard-demo-completed-3", cleaners.agnes, "INTERESTED"],
  ["dashboard-demo-completed-3", cleaners.eloisa, "INTERESTED"],
];

const issues = [
  {
    id: "dashboard-demo-issue-1",
    jobId: "dashboard-demo-in-progress-1",
    property: properties.secondAve,
    cleaner: cleaners.mary,
    category: "ACCESS",
    description: "Door code is not working",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-2",
    jobId: "dashboard-demo-in-progress-2",
    property: properties.ryleiSt,
    cleaner: cleaners.douglas,
    category: "SUPPLIES",
    description: "Paper towels are running low",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-3",
    jobId: "dashboard-demo-completed-1",
    property: properties.oliverAve,
    cleaner: cleaners.carla,
    category: "BROKEN_ITEM",
    description: "Broken coffee maker",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-4",
    jobId: "dashboard-demo-completed-2",
    property: properties.newboldCt,
    cleaner: cleaners.mayara,
    category: "HEAVY_CLEANING",
    description: "Cleaning is much heavier than expected",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-5",
    jobId: "dashboard-demo-in-progress-3",
    property: properties.echoDrive,
    cleaner: cleaners.ingrid,
    category: "OTHER",
    description: "Unexpected maintenance crew visit",
    status: "RESOLVED",
    resolutionNote: "Owner notified",
  },
  {
    id: "dashboard-demo-issue-6",
    jobId: "dashboard-demo-completed-1",
    property: properties.oliverAve,
    cleaner: cleaners.carla,
    category: "SUPPLIES",
    description: "Replacement linens were needed",
    status: "RESOLVED",
    resolutionNote: "Replacement requested",
  },
  {
    id: "dashboard-demo-issue-7",
    jobId: "dashboard-demo-completed-3",
    property: properties.ryleiSt,
    cleaner: cleaners.agnes,
    category: "BROKEN_ITEM",
    description: "Living room lamp is not working",
    status: "RESOLVED",
    resolutionNote: "Owner notified",
  },
];

function offerData(jobId, cleaner, status, index) {
  const createdAt = timestampAfter("2026-08-21T17:00:00Z", index * 10);
  const data = {
    jobId,
    cleanerId: cleaner.id,
    cleanerName: cleaner.name,
    status,
    createdAt,
  };

  if (status !== "PENDING") {
    data.respondedAt = timestampAfter("2026-08-21T18:00:00Z", index * 10);
  }

  return data;
}

async function seedDashboard() {
  const environment = loadEnv("development", process.cwd());
  const firebaseConfig = createFirebaseConfig(environment);
  const missingConfigValues = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingConfigValues.length > 0) {
    throw new Error(
      `Missing Firebase configuration values: ${missingConfigValues.join(", ")}`,
    );
  }

  const firebaseApp = initializeApp(firebaseConfig, "dashboard-seed");
  const db = getFirestore(firebaseApp);

  try {
    const batch = writeBatch(db);

    for (const dashboardJob of jobs) {
      batch.set(
        doc(db, "organizations", organizationId, "jobs", dashboardJob.id),
        dashboardJob.data,
      );
    }

    offers.forEach(([jobId, cleaner, status], index) => {
      batch.set(
        doc(db, "organizations", organizationId, "jobs", jobId, "offers", cleaner.id),
        offerData(jobId, cleaner, status, index),
      );
    });

    for (const issue of issues) {
      const issueData = {
        jobId: issue.jobId,
        propertyId: issue.property.id,
        cleanerId: issue.cleaner.id,
        cleanerName: issue.cleaner.name,
        category: issue.category,
        description: issue.description,
        status: issue.status,
        createdAt: timestamp("2026-08-22T11:00:00"),
      };

      if (issue.status === "RESOLVED") {
        issueData.resolvedAt = timestamp("2026-08-22T12:00:00");
        issueData.resolutionNote = issue.resolutionNote;
      }

      batch.set(
        doc(
          db,
          "organizations",
          organizationId,
          "jobs",
          issue.jobId,
          "issues",
          issue.id,
        ),
        issueData,
      );
    }

    await batch.commit();
    console.log(
      `Seeded ${jobs.length} dashboard jobs, ${offers.length} offers, and ${issues.length} issues.`,
    );
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedDashboard().catch((error) => {
  console.error("Unable to seed dashboard:", error.message);
  process.exitCode = 1;
});
