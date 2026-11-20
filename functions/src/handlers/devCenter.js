import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  buildDemoScenario,
  isDemoSeedRecord,
} from "../devCenterData.js";
import { planDemoCleanup } from "../devCenterCleanup.js";
import {
  isAuthorizedDeveloper,
  requireAuthorizedDeveloper,
} from "../devCenterAuthorization.js";
import { assertDevCenterMutationEnvironment, resolveDevCenterEnvironment } from "../devCenterSafety.js";
import { buildNotificationDiagnostics } from "../notificationDiagnostics.js";
import {
  reportManagerDeviceHealth,
  sendDeveloperTestNotification as dispatchDeveloperTestNotification,
} from "../notificationLab.js";
import { sendCurrentManagerTestNotification as dispatchCurrentManagerTestNotification } from "../currentDeviceNotificationTest.js";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { listNotificationInboxForRequest } from "../notificationInbox.js";
import { eligibleManagerPushDevices } from "../managerFcmDelivery.js";
import { allowedDeveloperUids, devCenterEnvironmentOptions } from "../runtime/devCenter.js";
import { db, liveMessaging, organizationReference } from "../runtime/firebase.js";
// Developer tools are deliberately pinned to the default organization: they must
// never read, seed or clear another company's data, whatever the caller's claim says.
import { defaultOrganizationId as devCenterOrganizationId, organizationIdForRequest } from "../runtime/organization.js";

function devCenterEnvironment() {
  return resolveDevCenterEnvironment(devCenterEnvironmentOptions());
}

async function demoJobCount() {
  const snapshot = await organizationReference(devCenterOrganizationId)
    .collection("jobs")
    .where("demoSeed", "==", true)
    .count()
    .get();

  return snapshot.data().count;
}

async function clearDemoData({ requireComplete = false } = {}) {
  const organization = organizationReference(devCenterOrganizationId);
  const records = [];
  for (const kind of ["jobs", "payouts", "properties", "cleaners", "clients"]) {
    const collection = organization.collection(kind);
    const snapshot = await collection.get();
    const visibleIds = new Set(snapshot.docs.map(document => document.id));
    if ((await collection.listDocuments()).some(reference => !visibleIds.has(reference.id))) {
      // Deleted parent documents may still own history. Preserve rather than
      // recursively traversing/deleting orphaned or concurrently added records.
      records.push({ kind, data: {}, survives: true, hasUnknownHistory: true });
    }
    for (const document of snapshot.docs) {
      const record = { kind, id: document.id, ref: document.ref, createTime: document.createTime, updateTime: document.updateTime, data: document.data() };
      records.push(record);
      // Preserve Runs, Assignments, evidence, capabilities and any unrecognized
      // child collection. Surviving parents' children are protection evidence too,
      // even if they carry seed markers. Never recursively remove unknown history.
      for (const collection of await document.ref.listCollections()) {
        const knownHistory = kind === "jobs" && ["offers", "issues", "assignments"].includes(collection.id);
        if (!knownHistory) record.hasUnknownHistory = true;
        const children = await collection.get();
        if (knownHistory) {
          const visibleChildren = new Set(children.docs.map(child => child.id));
          if ((await collection.listDocuments()).some(reference => !visibleChildren.has(reference.id))) record.hasUnknownHistory = true;
        }
        if (children.empty) {
          // A listed collection can contain missing parent docs with descendants.
          record.hasUnknownHistory = true;
          continue;
        }
        for (const child of children.docs) {
          const childRecord = { kind: collection.id, id: child.ref.path, ref: child.ref, createTime: child.createTime, updateTime: child.updateTime, data: child.data() };
          const hasNestedHistory = (await child.ref.listCollections()).length > 0;
          childRecord.survives = !isDemoSeedRecord(record) || kind !== "jobs"
            || !["offers", "issues"].includes(collection.id) || !isDemoSeedRecord(childRecord)
            || childRecord.data.demoSeedBatch !== record.data.demoSeedBatch || hasNestedHistory;
          if (childRecord.survives) record.hasProtectedChildren = true;
          if (hasNestedHistory) childRecord.hasUnknownHistory = true;
          records.push(childRecord);
        }
      }
    }
  }
  const { targets, skippedBatches } = planDemoCleanup(records);
  if (requireComplete && skippedBatches > 0) {
    throw new HttpsError("failed-precondition", "Reset cannot erase protected demo history. Clear only untouched generated batches.");
  }
  for (let start = 0; start < targets.length; start += 400) {
    const batch = db.batch();
    targets.slice(start, start + 400).forEach(({ ref, updateTime }) => batch.delete(ref, { lastUpdateTime: updateTime }));
    await batch.commit();
  }

  return {
    deleted: targets.length,
    skippedBatches,
    demoJobCount: await demoJobCount(),
  };
}

async function managerEmailsByUserId(userIds) {
  if (userIds.length === 0) return new Map();

  try {
    const emails = new Map();
    for (let start = 0; start < userIds.length; start += 100) {
      const users = await getAuth().getUsers(userIds.slice(start, start + 100).map((uid) => ({ uid })));
      users.users.forEach((user) => emails.set(user.uid, user.email || null));
    }
    return emails;
  } catch (error) {
    logger.warn("Manager notification diagnostics could not resolve account emails.", {
      failureCode: error?.code || "unknown",
    });
    return new Map();
  }
}

export async function getDevCenterAccess(request) {
  if (!request.auth || !isAuthorizedDeveloper(request, allowedDeveloperUids())) {
    return { authorized: false };
  }

  return {
    authorized: true,
    environment: devCenterEnvironment(),
    demoJobCount: await demoJobCount(),
  };
}

export async function getManagerNotificationDiagnostics(request) {
  requireAuthorizedDeveloper(request, allowedDeveloperUids());

  const deviceSampleLimit = 100;
  const [devicesSnapshot, deliveriesSnapshot] = await Promise.all([
    db.collection("managerPushDevices").where("organizationId", "==", devCenterOrganizationId).limit(deviceSampleLimit).get(),
    organizationReference(devCenterOrganizationId)
      .collection("managerReminderDeliveries")
      .orderBy("attemptedAt", "desc")
      .limit(20)
      .get(),
  ]);
  const [healthSnapshot, reviewSnapshot, developerTestsSnapshot, currentDeviceTestsSnapshot, cleanerDeliveries] = await Promise.all([
    organizationReference(devCenterOrganizationId).collection("managerNotificationDeviceHealth").limit(100).get(),
    // The pilot has a small bounded outbox. Avoid a new collection-group index
    // solely for a developer diagnostic; filter to this organization below.
    db.collectionGroup("managerNotificationDeliveries").limit(100).get(),
    organizationReference(devCenterOrganizationId)
      .collection("developerNotificationTests")
      .orderBy("attemptedAt", "desc")
      .limit(20)
      .get(),
    organizationReference(devCenterOrganizationId).collection("currentDeviceNotificationTests")
      .orderBy("attemptedAt", "desc").limit(20).get(),
    organizationReference(devCenterOrganizationId).collection("cleanerNotificationDeliveries")
      .orderBy("recordedAt", "desc").limit(20).get(),
  ]);
  const devices = devicesSnapshot.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
  const healthReports = healthSnapshot.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
  const viewerUserId = request.auth.uid;
  const userIds = [...new Set([viewerUserId, ...[...devices, ...healthReports].map(({ data }) => data.userId)])]
    .filter((uid) => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !uid.includes("/"));
  const [emailsByUserId, eligibleRegistrationIds, latestInbox] = await Promise.all([
    managerEmailsByUserId(userIds),
    eligibleManagerPushDevices(db, devCenterOrganizationId, devicesSnapshot.docs)
      .then((entries) => new Set(entries.map((entry) => entry.id))).catch(() => null),
    listNotificationInboxForRequest(db, { organizationId: devCenterOrganizationId, request: { auth: request.auth,
      data: { role: "MANAGER", pageSize: 1 } } }).then(({ items }) => ({
        state: items.length ? "available" : "empty", item: items[0],
      })).catch(() => ({ state: "unavailable" })),
  ]);

  return buildNotificationDiagnostics({
    devices,
    deliveries: deliveriesSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
    healthReports,
    reviewDeliveries: reviewSnapshot.docs
      .filter((snapshot) => snapshot.ref.path.startsWith(`organizations/${devCenterOrganizationId}/jobs/`))
      .map((snapshot) => ({ data: snapshot.data() }))
      .sort((a, b) => (b.data.createdAt?.toMillis?.() || 0) - (a.data.createdAt?.toMillis?.() || 0))
      .slice(0, 20),
    developerTests: developerTestsSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
    currentDeviceTests: currentDeviceTestsSnapshot.docs.map((snapshot) => ({ data: snapshot.data() })),
    cleanerDeliveries: cleanerDeliveries.docs.map((snapshot) => ({ data: snapshot.data() })),
    readMetadata: {
      devices: { readCount: devicesSnapshot.size, returnedCount: devices.length, readCap: deviceSampleLimit, ordering: "unordered" },
      healthReports: { readCount: healthSnapshot.size, returnedCount: healthReports.length, readCap: 100, ordering: "unordered" },
      deliveries: { readCount: deliveriesSnapshot.size, returnedCount: deliveriesSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
      reviewDeliveries: { readCount: reviewSnapshot.size,
        returnedCount: Math.min(20, reviewSnapshot.docs.filter((snapshot) => snapshot.ref.path.startsWith(`organizations/${devCenterOrganizationId}/jobs/`)).length),
        readCap: 100, ordering: "unordered-global-sample" },
      developerTests: { readCount: developerTestsSnapshot.size, returnedCount: developerTestsSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
      currentDeviceTests: { readCount: currentDeviceTestsSnapshot.size, returnedCount: currentDeviceTestsSnapshot.size, readCap: 20, ordering: "attemptedAt-desc" },
    },
    emailsByUserId,
    eligibleRegistrationIds,
    viewerUserId,
    latestInbox,
  });
}

export async function reportManagerNotificationHealth(request) {
  const organizationId = organizationIdForRequest(request);
  await requireOrganizationManager(db, request, organizationId);
  return reportManagerDeviceHealth({
    database: db,
    organizationId,
    userId: request.auth.uid,
    input: request.data,
  });
}

export async function sendDeveloperTestNotification(request) {
  requireAuthorizedDeveloper(request, allowedDeveloperUids());
  await requireOrganizationManager(db, request, devCenterOrganizationId);
  const data = request.data;
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).sort().join(",") !== "confirm,targetRegistrationId") {
    throw new HttpsError("invalid-argument", "Developer notification test request is invalid.");
  }
  return dispatchDeveloperTestNotification({
    database: db,
    organizationId: devCenterOrganizationId,
    developerUid: request.auth.uid,
    targetRegistrationId: data.targetRegistrationId,
    confirm: data.confirm,
    sendFcm: (message) => liveMessaging().send(message),
    logger,
  });
}

export async function sendCurrentManagerTestNotification(request) {
  return dispatchCurrentManagerTestNotification({
    database: db,
    organizationId: organizationIdForRequest(request),
    request,
    sendFcm: (message) => liveMessaging().send(message),
    logger,
  });
}

export async function generateDevCenterScenario(request) {
  requireAuthorizedDeveloper(request, allowedDeveloperUids());
  try {
    assertDevCenterMutationEnvironment(devCenterEnvironmentOptions());
  } catch (error) {
    throw new HttpsError("failed-precondition", error.message);
  }
  const scenario = request.data?.scenario;
  const batchId = `dev-center-${randomUUID()}`;
  let records;

  try {
    records = buildDemoScenario({
      scenario,
      batch: batchId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    throw new HttpsError("invalid-argument", "Demo scenario is invalid.");
  }

  if (request.data?.resetBaseline === true) {
    await clearDemoData({ requireComplete: true });
  }

  const organization = organizationReference(devCenterOrganizationId);
  const writeBatch = db.batch();
  (records.clients || [records.client]).forEach((client) => {
    writeBatch.set(organization.collection("clients").doc(client.id), client.data);
  });
  records.properties.forEach((property) => {
    writeBatch.set(organization.collection("properties").doc(property.id), property.data);
  });
  records.cleaners.forEach((cleaner) => {
    writeBatch.set(organization.collection("cleaners").doc(cleaner.id), cleaner.data);
  });
  records.jobs.forEach((job) => {
    writeBatch.set(organization.collection("jobs").doc(job.id), job.data);
  });
  records.offers.forEach((offer) => {
    writeBatch.set(
      organization.collection("jobs").doc(offer.jobId).collection("offers").doc(offer.id),
      offer.data,
    );
  });
  (records.issues || []).forEach((issue) => {
    writeBatch.set(
      organization.collection("jobs").doc(issue.jobId).collection("issues").doc(issue.id),
      issue.data,
    );
  });
  (records.payouts || []).forEach((payout) => {
    writeBatch.set(organization.collection("payouts").doc(payout.id), payout.data);
  });
  await writeBatch.commit();

  logger.info("Dev Center scenario generated.", { scenario, batchId, jobs: records.jobs.length });
  return { demoJobCount: await demoJobCount(), generatedJobCount: records.jobs.length };
}

export async function clearDevCenterData(request) {
  requireAuthorizedDeveloper(request, allowedDeveloperUids());
  try {
    assertDevCenterMutationEnvironment(devCenterEnvironmentOptions());
  } catch (error) {
    throw new HttpsError("failed-precondition", error.message);
  }
  const result = await clearDemoData();
  logger.info("Dev Center demo data cleared.", result);
  return result;
}
