import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { eligibleCleaner, isActiveCleanerSession } from "./cleanerHubAccess.js";
import { operatingDate } from "./cleanerJobAccess.js";
import { validRosterId } from "./firstAcceptWins.js";
import { isActiveManagerMembership } from "./managerAuthorization.js";
import { unavailabilityPeriodError } from "./unavailabilityPeriod.js";

const maxBlocks = 30;
const actionFields = {
  list: [], set: ["startDate", "endDate", "startTime", "endTime"], remove: ["blockId"],
};

function forbidden() {
  return new HttpsError("permission-denied", "Active organization access is required.");
}

function blockPeriod(data) {
  const { startDate, endDate } = data;
  return Object.hasOwn(data, "startTime") ? { startDate, endDate, startTime: data.startTime, endTime: data.endTime }
    : { startDate, endDate };
}

function publicBlock(id, data) {
  return { id, ...blockPeriod(data), createdBy: data.createdBy };
}

function blockIdForPeriod(organizationId, cleanerId, { startDate, endDate, startTime, endTime }) {
  const identity = [organizationId, cleanerId, startDate, endDate, startTime ?? null, endTime ?? null];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function validateInput(data, role, action, today) {
  const keys = role === "MANAGER" ? [...actionFields[action], "cleanerId"] : actionFields[action];
  if (!data || typeof data !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(data))
    || Object.keys(data).some(key => !keys.includes(key))) {
    throw new HttpsError("invalid-argument", "Invalid availability request.");
  }
  if (role === "MANAGER" && !validRosterId(data.cleanerId)) {
    throw new HttpsError("invalid-argument", "Invalid cleaner identifier.");
  }
  if (action === "remove" && !validRosterId(data.blockId)) {
    throw new HttpsError("invalid-argument", "Invalid block identifier.");
  }
  if (action === "set" && unavailabilityPeriodError(data, today)) {
    throw new HttpsError("invalid-argument", "Invalid availability period.");
  }
}

function belongsToOrganization(data, organizationId) {
  return data && (!Object.hasOwn(data, "organizationId") || data.organizationId === organizationId);
}

function sameOwner(block, organizationId, cleanerId) {
  return block?.organizationId === organizationId && block.cleanerId === cleanerId;
}

function readableBlock(block, today) {
  return ["CLEANER", "MANAGER"].includes(block.createdBy) && !unavailabilityPeriodError(block, today);
}

function currentBlocks(org, cleanerId, today) {
  return org.collection("cleanerUnavailability").where("organizationId", "==", org.id)
    .where("cleanerId", "==", cleanerId).where("endDate", ">=", today).limit(maxBlocks);
}

async function authorize(transaction, org, { uid, role, claims, cleanerId }) {
  const [member, cleaner] = await transaction.getAll(
    org.collection("members").doc(uid), org.collection("cleaners").doc(cleanerId),
  );
  const membership = member.data();
  const profile = cleaner.data();
  const authorized = role === "CLEANER" ? isActiveCleanerSession(membership, claims)
    : isActiveManagerMembership(membership) && belongsToOrganization(membership, org.id);
  if (!authorized || !eligibleCleaner(profile) || !belongsToOrganization(profile, org.id)) throw forbidden();
}

async function listBlocks(transaction, org, cleanerId, today) {
  const snapshot = await transaction.get(currentBlocks(org, cleanerId, today));
  const blocks = snapshot.docs.filter(doc => sameOwner(doc.data(), org.id, cleanerId) && readableBlock(doc.data(), today))
    .map(doc => publicBlock(doc.id, doc.data()));
  blocks.sort((a, b) => a.startDate.localeCompare(b.startDate)
    || (a.startTime || "").localeCompare(b.startTime || "") || a.id.localeCompare(b.id));
  return { blocks };
}

async function changeBlock(transaction, org, { action, role, data, cleanerId, today }) {
  const collection = org.collection("cleanerUnavailability");
  const id = action === "set" ? blockIdForPeriod(org.id, cleanerId, data) : data.blockId;
  const ref = collection.doc(id);
  // A common read/write document serializes count checks even when no block exists yet.
  const guard = org.collection("cleanerUnavailabilityState").doc(cleanerId);
  const [existing] = await transaction.getAll(ref, guard);
  if (action === "remove") {
    if (!sameOwner(existing.data(), org.id, cleanerId)) return { removed: false };
    transaction.set(guard, { updatedAt: FieldValue.serverTimestamp() });
    transaction.delete(ref);
    return { removed: true };
  }
  if (existing.exists) {
    const block = existing.data();
    if (!sameOwner(block, org.id, cleanerId) || !readableBlock(block, today)) throw forbidden();
    return { block: publicBlock(id, block) };
  }
  const current = await transaction.get(currentBlocks(org, cleanerId, today));
  if (current.size >= maxBlocks) throw new HttpsError("resource-exhausted", "Availability block limit reached.");
  const block = { organizationId: org.id, cleanerId, ...blockPeriod(data), createdBy: role };
  transaction.set(guard, { updatedAt: FieldValue.serverTimestamp() });
  transaction.create(ref, { ...block, createdAt: FieldValue.serverTimestamp() });
  return { block: publicBlock(id, block) };
}

/** The callable selects the role and action. Client data supplies only the period or block identifier. */
export async function cleanerUnavailabilityForRequest(database, { organizationId, role, action, request, nowMs = Date.now() }) {
  if (!validRosterId(request.auth?.uid) || request.auth.token?.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "A non-anonymous account is required.");
  }
  const claims = request.auth.token?.cleanerHub;
  if (role === "CLEANER" && (claims?.organizationId !== organizationId || !validRosterId(claims.cleanerId))) {
    throw forbidden();
  }
  const today = operatingDate(nowMs);
  const data = request.data;
  validateInput(data, role, action, today);
  const cleanerId = role === "CLEANER" ? claims.cleanerId : data.cleanerId;
  const org = database.collection("organizations").doc(organizationId);
  return database.runTransaction(async transaction => {
    await authorize(transaction, org, { uid: request.auth.uid, role, claims, cleanerId });
    return action === "list" ? listBlocks(transaction, org, cleanerId, today)
      : changeBlock(transaction, org, { action, role, data, cleanerId, today });
  }, action === "list" ? { readOnly: true } : undefined);
}
