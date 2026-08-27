import { deleteApp, initializeApp } from "firebase/app";
import { doc, getFirestore, Timestamp, writeBatch } from "firebase/firestore";
import { loadEnv } from "vite";
import { createFirebaseConfig } from "../src/services/firebase/config.js";

const organizationId = "cleanflow-demo";

// All dashboard fixtures are intentionally fictional and safe for public demos.
const properties = {
  harborLoft: { id: "harbor-loft", name: "Harbor Loft", clientName: "Northstar Stays", clientPrice: 350, cleanerPayout: 200 },
  cedarHouse: { id: "cedar-house", name: "Cedar House", clientName: "Northstar Stays", clientPrice: 200, cleanerPayout: 100 },
  sunsetBungalow: { id: "sunset-bungalow", name: "Sunset Bungalow", clientName: "Northstar Stays", clientPrice: 275, cleanerPayout: 150 },
  canyonRetreat: { id: "canyon-retreat", name: "Canyon Retreat", clientName: "Bluebird Rentals", clientPrice: 400, cleanerPayout: 220 },
  palmCottage: { id: "palm-cottage", name: "Palm Cottage", clientName: "Coastal Key Management", clientPrice: 325, cleanerPayout: 180 },
};

const cleaners = {
  alex: { id: "demo-alex", name: "Alex Rivera" },
  jordan: { id: "demo-jordan", name: "Jordan Lee" },
  sam: { id: "demo-sam", name: "Sam Morgan" },
  taylor: { id: "demo-taylor", name: "Taylor Kim" },
  casey: { id: "demo-casey", name: "Casey Patel" },
  riley: { id: "demo-riley", name: "Riley Chen" },
  morgan: { id: "demo-morgan", name: "Morgan Brooks" },
  jamie: { id: "demo-jamie", name: "Jamie Santos" },
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
      notes: `FICTIONAL DASHBOARD DEMO - ${operationalStatus.replace("_", " ")}`,
      operationalStatus,
      fixture: true,
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
  job("dashboard-demo-unassigned-1", properties.cedarHouse, "2026-08-22", "UNASSIGNED"),
  job("dashboard-demo-unassigned-2", properties.palmCottage, "2026-08-23", "UNASSIGNED"),
  job("dashboard-demo-unassigned-3", properties.canyonRetreat, "2026-08-27", "UNASSIGNED"),
  job("dashboard-demo-offered-1", properties.harborLoft, "2026-08-22", "OFFERED", { offeredAt: timestamp("2026-08-21T17:00:00") }),
  job("dashboard-demo-offered-2", properties.sunsetBungalow, "2026-08-23", "OFFERED", { offeredAt: timestamp("2026-08-21T17:15:00") }),
  job("dashboard-demo-offered-3", properties.palmCottage, "2026-08-28", "OFFERED", { offeredAt: timestamp("2026-08-21T17:30:00") }),
  job("dashboard-demo-assigned-1", properties.canyonRetreat, "2026-08-24", "ASSIGNED", assignment(cleaners.alex, "2026-08-21T18:00:00")),
  job("dashboard-demo-assigned-2", properties.cedarHouse, "2026-08-25", "ASSIGNED", assignment(cleaners.jordan, "2026-08-21T18:15:00")),
  job("dashboard-demo-assigned-3", properties.sunsetBungalow, "2026-08-27", "ASSIGNED", assignment(cleaners.taylor, "2026-08-21T18:30:00")),
  job("dashboard-demo-in-progress-1", properties.harborLoft, "2026-08-24", "IN_PROGRESS", {
    ...assignment(cleaners.casey, "2026-08-22T08:00:00"),
    startedAt: timestamp("2026-08-22T09:15:00"),
  }),
  job("dashboard-demo-in-progress-2", properties.palmCottage, "2026-08-25", "IN_PROGRESS", {
    ...assignment(cleaners.morgan, "2026-08-22T08:30:00"),
    startedAt: timestamp("2026-08-22T10:00:00"),
  }),
  job("dashboard-demo-in-progress-3", properties.canyonRetreat, "2026-08-28", "IN_PROGRESS", {
    ...assignment(cleaners.riley, "2026-08-22T09:00:00"),
    startedAt: timestamp("2026-08-22T10:30:00"),
  }),
  job("dashboard-demo-completed-1", properties.cedarHouse, "2026-08-22", "COMPLETED", {
    ...assignment(cleaners.sam, "2026-08-21T14:30:00"),
    startedAt: timestamp("2026-08-22T07:30:00"),
    completedAt: timestamp("2026-08-22T09:45:00"),
  }),
  job("dashboard-demo-completed-2", properties.sunsetBungalow, "2026-08-23", "COMPLETED", {
    ...assignment(cleaners.jamie, "2026-08-21T15:00:00"),
    startedAt: timestamp("2026-08-23T08:00:00"),
    completedAt: timestamp("2026-08-23T10:30:00"),
  }),
  job("dashboard-demo-completed-3", properties.palmCottage, "2026-08-24", "COMPLETED", {
    ...assignment(cleaners.alex, "2026-08-21T15:30:00"),
    startedAt: timestamp("2026-08-24T09:00:00"),
    completedAt: timestamp("2026-08-24T11:15:00"),
  }),
];

const offers = [
  ["dashboard-demo-offered-1", cleaners.alex, "PENDING"],
  ["dashboard-demo-offered-1", cleaners.sam, "INTERESTED"],
  ["dashboard-demo-offered-1", cleaners.morgan, "DECLINED"],
  ["dashboard-demo-offered-2", cleaners.jordan, "INTERESTED"],
  ["dashboard-demo-offered-2", cleaners.taylor, "PENDING"],
  ["dashboard-demo-offered-2", cleaners.riley, "DECLINED"],
  ["dashboard-demo-offered-3", cleaners.jamie, "PENDING"],
  ["dashboard-demo-offered-3", cleaners.casey, "INTERESTED"],
  ["dashboard-demo-offered-3", cleaners.morgan, "DECLINED"],
  ["dashboard-demo-assigned-1", cleaners.alex, "INTERESTED"],
  ["dashboard-demo-assigned-1", cleaners.sam, "DECLINED"],
  ["dashboard-demo-assigned-2", cleaners.jordan, "INTERESTED"],
  ["dashboard-demo-assigned-2", cleaners.casey, "DECLINED"],
  ["dashboard-demo-assigned-3", cleaners.taylor, "INTERESTED"],
  ["dashboard-demo-assigned-3", cleaners.riley, "DECLINED"],
];

const issues = [
  {
    id: "dashboard-demo-issue-1",
    jobId: "dashboard-demo-in-progress-1",
    property: properties.harborLoft,
    cleaner: cleaners.casey,
    category: "ACCESS",
    description: "Demo access code is not working",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-2",
    jobId: "dashboard-demo-in-progress-2",
    property: properties.palmCottage,
    cleaner: cleaners.morgan,
    category: "SUPPLIES",
    description: "Paper towels are running low",
    status: "OPEN",
  },
  {
    id: "dashboard-demo-issue-3",
    jobId: "dashboard-demo-completed-1",
    property: properties.cedarHouse,
    cleaner: cleaners.sam,
    category: "BROKEN_ITEM",
    description: "Coffee maker requires maintenance",
    status: "RESOLVED",
    resolutionNote: "Demo client notified",
  },
];

function offerData(jobId, cleaner, status, index) {
  const createdAt = timestampAfter("2026-08-21T17:00:00Z", index * 10);
  const data = {
    jobId,
    cleanerId: cleaner.id,
    cleanerName: cleaner.name,
    status,
    fixture: true,
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
    throw new Error(`Missing Firebase configuration values: ${missingConfigValues.join(", ")}`);
  }

  const firebaseApp = initializeApp(firebaseConfig, "dashboard-seed");
  const db = getFirestore(firebaseApp);

  try {
    const batch = writeBatch(db);

    for (const dashboardJob of jobs) {
      batch.set(doc(db, "organizations", organizationId, "jobs", dashboardJob.id), dashboardJob.data);
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
        fixture: true,
        createdAt: timestamp("2026-08-22T11:00:00"),
      };

      if (issue.status === "RESOLVED") {
        issueData.resolvedAt = timestamp("2026-08-22T12:00:00");
        issueData.resolutionNote = issue.resolutionNote;
      }

      batch.set(
        doc(db, "organizations", organizationId, "jobs", issue.jobId, "issues", issue.id),
        issueData,
      );
    }

    await batch.commit();
    console.log(`Seeded ${jobs.length} fictional dashboard jobs, ${offers.length} offers, and ${issues.length} issues.`);
  } finally {
    await deleteApp(firebaseApp);
  }
}

seedDashboard().catch((error) => {
  console.error("Unable to seed dashboard:", error.message);
  process.exitCode = 1;
});
