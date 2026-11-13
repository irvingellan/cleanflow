import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { operatingDate } from "./cleanerJobAccess.js";
import {
  clientReportReleasedForJob, downloadReleasedClientReportPhoto, loadReleasedClientReport,
} from "./clientReportService.js";

/**
 * Client portal: one private, read-only link per client. Through it a property
 * owner sees their own properties, the coming cleanings and the reports the
 * manager has released. It never carries cleaner names, access instructions,
 * prices or internal notes.
 */
export const clientPortalAccessId = "active";
export const clientPortalLifetimeMilliseconds = 180 * 24 * 60 * 60 * 1000;
export const clientPortalPastDays = 120;
export const clientPortalComingDays = 60;
const maximumJobs = 150;
const maximumReports = 40;
const tokenHashPattern = /^[a-f0-9]{64}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function reportDateAllowed(value, today) {
  if (!datePattern.test(value || "")) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    && value >= shiftDate(today, -clientPortalPastDays) && value <= today;
}

function validPathId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("/");
}

function toIso(value) {
  return value?.toDate?.()?.toISOString?.() || null;
}

function organization(database, organizationId) {
  return database.doc(`organizations/${organizationId}`);
}

function clientReference(database, organizationId, clientId) {
  return organization(database, organizationId).collection("clients").doc(clientId);
}

function accessReference(database, organizationId, clientId) {
  return clientReference(database, organizationId, clientId).collection("portalAccess").doc(clientPortalAccessId);
}

function lookupReference(database, tokenHash) {
  return database.collection("clientPortalTokenLookups").doc(tokenHash);
}

export function clientPortalAccessState(access, now = new Date()) {
  if (!access) return "NONE";
  if (access.status === "REVOKED") return "REVOKED";
  if (access.status !== "ACTIVE" || !access.expiresAt?.toMillis) return "UNAVAILABLE";
  return access.expiresAt.toMillis() <= now.getTime() ? "EXPIRED" : "ACTIVE";
}

function projectAccess(access, now) {
  if (!access) return { state: "NONE" };
  return { state: clientPortalAccessState(access, now), expiresAt: toIso(access.expiresAt), issuedAt: toIso(access.createdAt) };
}

function assertManagerRequest({ clientId, actorUid }) {
  if (!validPathId(clientId) || typeof actorUid !== "string" || !actorUid) {
    throw new HttpsError("invalid-argument", "Client portal request is invalid.");
  }
}

export async function getClientPortalForManager(database, { organizationId, clientId, now = new Date() }) {
  if (!validPathId(clientId)) throw new HttpsError("invalid-argument", "Client portal request is invalid.");
  return projectAccess((await accessReference(database, organizationId, clientId).get()).data(), now);
}

/**
 * Creates the client's portal link, replacing an earlier one. Only the hash of
 * the token is stored; the link is shown to the manager once.
 */
export async function issueClientPortalForManager(database, {
  organizationId, clientId, actorUid, token, tokenHash, now = new Date(),
}) {
  assertManagerRequest({ clientId, actorUid });
  if (typeof token !== "string" || !tokenHashPattern.test(tokenHash || "")
    || createHash("sha256").update(token).digest("hex") !== tokenHash) {
    throw new HttpsError("invalid-argument", "Client portal request is invalid.");
  }
  const clientRef = clientReference(database, organizationId, clientId);
  const accessRef = accessReference(database, organizationId, clientId);
  const newLookupRef = lookupReference(database, tokenHash);
  const expiresAt = Timestamp.fromMillis(now.getTime() + clientPortalLifetimeMilliseconds);
  await database.runTransaction(async (transaction) => {
    const [client, current] = await Promise.all([transaction.get(clientRef), transaction.get(accessRef)]);
    if (!client.exists || client.data().archivedAt) throw new HttpsError("failed-precondition", "An active client is required.");
    const oldHash = current.data()?.tokenHash;
    const oldLookupRef = tokenHashPattern.test(oldHash || "") && oldHash !== tokenHash ? lookupReference(database, oldHash) : null;
    const oldLookup = oldLookupRef ? await transaction.get(oldLookupRef) : null;
    if (oldLookup?.exists) transaction.update(oldLookupRef, { status: "REPLACED", replacedAt: FieldValue.serverTimestamp() });
    transaction.set(accessRef, {
      status: "ACTIVE", tokenHash, expiresAt, createdAt: FieldValue.serverTimestamp(), createdByUid: actorUid,
    });
    transaction.create(newLookupRef, { organizationId, clientId, status: "ACTIVE", expiresAt });
  });
  return { state: "ACTIVE", expiresAt: expiresAt.toDate().toISOString(), issuedAt: now.toISOString(), token };
}

export async function revokeClientPortalForManager(database, { organizationId, clientId, actorUid }) {
  assertManagerRequest({ clientId, actorUid });
  const accessRef = accessReference(database, organizationId, clientId);
  return database.runTransaction(async (transaction) => {
    const access = await transaction.get(accessRef);
    if (!access.exists) return { state: "NONE" };
    const hash = access.data().tokenHash;
    const lookupRef = tokenHashPattern.test(hash || "") ? lookupReference(database, hash) : null;
    const lookup = lookupRef ? await transaction.get(lookupRef) : null;
    transaction.update(accessRef, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp(), revokedByUid: actorUid });
    if (lookup?.exists) transaction.update(lookupRef, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() });
    return { state: "REVOKED" };
  });
}

/** The client a portal link belongs to, or an error that reveals nothing about why. */
async function resolveClientPortal(database, { organizationId, tokenHash, now = new Date() }) {
  if (!tokenHashPattern.test(tokenHash || "")) throw new HttpsError("not-found", "Portal not found.");
  const lookup = (await lookupReference(database, tokenHash).get()).data();
  if (!lookup || lookup.organizationId !== organizationId || !validPathId(lookup.clientId)) {
    throw new HttpsError("not-found", "Portal not found.");
  }
  const [client, access] = await Promise.all([
    clientReference(database, organizationId, lookup.clientId).get(),
    accessReference(database, organizationId, lookup.clientId).get(),
  ]);
  const lookupExpiry = lookup.expiresAt?.toMillis?.();
  if (lookup.status !== "ACTIVE" || !lookupExpiry || lookupExpiry <= now.getTime() || !client.exists || client.data().archivedAt
    || access.data()?.tokenHash !== tokenHash || clientPortalAccessState(access.data(), now) !== "ACTIVE") {
    throw new HttpsError("failed-precondition", "Portal is unavailable.");
  }
  return { clientId: lookup.clientId, client: client.data() };
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function text(value, maximum = 120) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

/** Owner-safe projection: what the owner sees, built from allow-listed fields only. */
export function projectClientPortal({ client, properties, jobs, releasedJobIds, today }) {
  const visibleProperties = properties.filter((property) => !property.archivedAt)
    .map((property) => ({ id: property.id, name: text(property.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const propertyNames = new Map(visibleProperties.map((property) => [property.id, property.name]));
  const visibleJobs = jobs.filter((job) => !job.archivedAt && datePattern.test(job.scheduledDate || "") && propertyNames.has(job.propertyId));
  const entry = (job) => ({
    propertyId: job.propertyId,
    propertyName: propertyNames.get(job.propertyId),
    date: job.scheduledDate,
    ...(timePattern.test(job.scheduledStart || "") ? { start: job.scheduledStart } : {}),
  });
  return {
    clientName: text(client?.name),
    properties: visibleProperties,
    coming: visibleJobs.filter((job) => job.scheduledDate >= today && job.operationalStatus !== "COMPLETED")
      .sort((a, b) => `${a.scheduledDate}${a.scheduledStart || ""}`.localeCompare(`${b.scheduledDate}${b.scheduledStart || ""}`))
      .map(entry),
    reports: visibleJobs.filter((job) => releasedJobIds.has(job.id))
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
      .map((job) => ({ jobId: job.id, ...entry(job) })),
  };
}

async function clientJobs(database, { organizationId, clientId, today }) {
  const snapshot = await organization(database, organizationId).collection("jobs")
    .where("clientId", "==", clientId)
    .where("scheduledDate", ">=", shiftDate(today, -clientPortalPastDays))
    .where("scheduledDate", "<=", shiftDate(today, clientPortalComingDays))
    .orderBy("scheduledDate", "desc").limit(maximumJobs).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function loadPublicClientPortal(database, { organizationId, tokenHash, now = new Date() }) {
  const { clientId, client } = await resolveClientPortal(database, { organizationId, tokenHash, now });
  const today = operatingDate(now.getTime());
  const [propertySnapshot, jobs] = await Promise.all([
    organization(database, organizationId).collection("properties").where("clientId", "==", clientId).get(),
    clientJobs(database, { organizationId, clientId, today }),
  ]);
  const properties = propertySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const allowedPropertyIds = new Set(properties.filter((property) => !property.archivedAt).map((property) => property.id));
  const candidates = jobs.filter((job) => !job.archivedAt && allowedPropertyIds.has(job.propertyId)
    && reportDateAllowed(job.scheduledDate, today)).slice(0, maximumReports);
  const released = await Promise.all(candidates.map((job) => clientReportReleasedForJob(database, { organizationId, jobId: job.id })
    .catch(() => false)));
  return projectClientPortal({
    client, jobs, today,
    properties,
    releasedJobIds: new Set(candidates.filter((_, index) => released[index]).map((job) => job.id)),
  });
}

/** Direct report/photo requests obey the same current ownership and date scope as the list. */
async function authorizeClientPortalJob(database, { organizationId, tokenHash, jobId, now }) {
  const { clientId } = await resolveClientPortal(database, { organizationId, tokenHash, now });
  if (!validPathId(jobId)) throw new HttpsError("not-found", "Report not found.");
  const job = (await organization(database, organizationId).collection("jobs").doc(jobId).get()).data();
  if (!job || job.archivedAt || job.clientId !== clientId || !validPathId(job.propertyId)
    || !reportDateAllowed(job.scheduledDate, operatingDate(now.getTime()))) {
    throw new HttpsError("not-found", "Report not found.");
  }
  const property = (await organization(database, organizationId).collection("properties").doc(job.propertyId).get()).data();
  if (!property || property.archivedAt || property.clientId !== clientId) {
    throw new HttpsError("not-found", "Report not found.");
  }
}

export async function loadPublicClientPortalReport(database, { organizationId, tokenHash, jobId, now = new Date() }) {
  await authorizeClientPortalJob(database, { organizationId, tokenHash, jobId, now });
  return (await loadReleasedClientReport(database, { organizationId, jobId })).report;
}

export async function downloadPublicClientPortalPhoto(database, {
  organizationId, tokenHash, jobId, evidenceId, variant, now = new Date(), storage,
}) {
  await authorizeClientPortalJob(database, { organizationId, tokenHash, jobId, now });
  return downloadReleasedClientReportPhoto(database, { organizationId, jobId, evidenceId, variant, storage });
}
