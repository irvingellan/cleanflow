import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { activeApprovedAssignments, approvedAssignmentBillingUpdate } from "./approvedAssignmentBilling.js";
import { validChecklistRunJobId } from "./checklistRunService.js";
import { hourlyAmountCents } from "./hourlyAmount.js";
import { appendJobCorrection, cleanerWasPaid, jobHasPayoutMarker, jobPayoutRecords } from "./jobCorrections.js";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { rosterCleanerIds } from "./offerSlots.js";
import { fixedCleanerShares, resolveJobPricing } from "./pricingModel.js";
import { isServiceType, normalizeServiceType } from "./serviceTypes.js";
import { loadWorkedTimeRate } from "./workedTime.js";

const deleteField = () => FieldValue.delete();

function readPricing(prices, cleanerOnly) {
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) {
    throw new HttpsError("invalid-argument", "Job prices are required.");
  }
  const { clientPrice, cleanerPayout, billing, pay } = prices;
  const pricing = resolveJobPricing({ clientPrice, cleanerPayout, billing, pay });
  if ((!cleanerOnly && (clientPrice != null || billing != null) && pricing.client.state !== "ready")
    || ((cleanerPayout != null || pay != null) && pricing.cleaner.state !== "ready")) {
    throw new HttpsError("invalid-argument", "A valid Job price is required.");
  }
  return pricing;
}

function clientUpdates(job, client) {
  if (client.mode === "HOURLY") {
    return { clientPrice: deleteField(), "billing.mode": "HOURLY", "billing.hourlyRateCents": client.rateCents };
  }
  return {
    clientPrice: client.amountCents == null ? deleteField() : client.amountCents / 100,
    ...(job.billing?.mode && job.billing.mode !== "FIXED" ? { "billing.mode": "FIXED" } : {}),
    ...(Object.hasOwn(job.billing ?? {}, "hourlyRateCents") ? { "billing.hourlyRateCents": deleteField() } : {}),
    ...(job.billing?.mode && job.billing.mode !== "FIXED" && Object.hasOwn(job.billing, "hours")
      ? { "billing.hours": deleteField() } : {}),
  };
}

function cleanerUpdates(job, cleaner) {
  const pay = cleaner.mode === "HOURLY" ? { mode: "HOURLY", rateCents: cleaner.rateCents }
    : cleaner.perCleaner ? { mode: "FIXED", perCleanerCents: cleaner.amountCents } : null;
  return {
    cleanerPayout: cleaner.amountCents == null || cleaner.perCleaner ? deleteField() : cleaner.amountCents / 100,
    ...(pay ? { pay } : job.pay ? { pay: deleteField() } : {}),
  };
}

function amountFor(cleaner, minutes, roster, cleanerId) {
  if (cleaner.mode === "HOURLY") return hourlyAmountCents(cleaner.rateCents, minutes);
  const shares = fixedCleanerShares({ cleaner }, roster.length);
  return (roster[0] === cleanerId ? shares?.firstCents : shares?.otherCents) ?? null;
}

export async function updateJobPricingForManager(database, request, organizationId) {
  const { jobId, prices, details, cleanerOnly = false } = request.data ?? {};
  if (!validChecklistRunJobId(jobId) || typeof cleanerOnly !== "boolean" || (details != null) === (prices != null)) {
    throw new HttpsError("invalid-argument", "A Job and one pricing or service type update are required.");
  }
  if (details != null && (!isServiceType(details.serviceType) || cleanerOnly
    || (details.guestName != null && (typeof details.guestName !== "string" || details.guestName.length > 120))
    || (details.notes != null && typeof details.notes !== "string"))) {
    throw new HttpsError("invalid-argument", "Valid Job details are required.");
  }
  const organization = database.doc(`organizations/${organizationId}`);
  const jobRef = organization.collection("jobs").doc(jobId);

  return database.runTransaction(async transaction => {
    await requireOrganizationManager(database, request, organizationId, transaction);
    const job = (await transaction.get(jobRef)).data();
    if (!job || (job.organizationId != null && job.organizationId !== organizationId)) {
      throw new HttpsError("not-found", "Job not found.");
    }
    const payouts = await jobPayoutRecords(transaction, organization, jobId);
    const afterPayout = jobHasPayoutMarker(job) || !payouts.empty;
    const roster = rosterCleanerIds(job);
    const current = resolveJobPricing(job);
    let client;
    let cleaner;
    let updates = {};
    if (details) {
      if (job.archivedAt || job.operationalStatus === "COMPLETED") {
        throw new HttpsError("failed-precondition", "Completed or archived Job details are read-only.");
      }
      const { serviceType, guestName, notes } = details;
      updates = { guestName: guestName || deleteField(), notes: notes || deleteField() };
      if (serviceType !== normalizeServiceType(job.serviceType)) {
        const property = (await transaction.get(organization.collection("properties").doc(job.propertyId))).data();
        if (!property || (property.organizationId != null && property.organizationId !== organizationId)) {
          throw new HttpsError("not-found", "Property not found.");
        }
        updates.serviceType = serviceType;
        const pricing = resolveJobPricing({ serviceType, requiredCleanerCount: job.requiredCleanerCount }, { property });
        if (!afterPayout && pricing.client.state === "ready") client = pricing.client;
        if (pricing.cleaner.state === "ready") cleaner = pricing.cleaner;
      }
    } else {
      if (afterPayout && !cleanerOnly) {
        throw new HttpsError("failed-precondition", "Use the client price correction after a payout.");
      }
      const pricing = readPricing(prices, cleanerOnly);
      if (!cleanerOnly) client = pricing.client;
      cleaner = pricing.cleaner;
    }

    if (afterPayout && !roster.some(cleanerId => !cleanerWasPaid(job, cleanerId, payouts))) cleaner = undefined;
    if (client) Object.assign(updates, clientUpdates(job, client));
    if (cleaner) Object.assign(updates, cleanerUpdates(job, cleaner));

    const assignments = client?.mode === "HOURLY" || cleaner
      ? await activeApprovedAssignments(transaction, jobRef, job, { jobId, organizationId }) : [];
    if (client?.mode === "HOURLY" && (assignments.length || job.billing?.hours?.source === "APPROVED_ASSIGNMENTS")) {
      Object.assign(updates, approvedAssignmentBillingUpdate(job, true, assignments.map(doc => ({
        assignmentId: doc.id, cleanerId: doc.data().cleanerId, minutes: doc.data().approvedWork.minutes,
      }))));
    }

    const adjustments = cleaner ? await Promise.all(assignments.map(async doc => {
      const assignment = doc.data();
      const { cleanerId, approvedWork: { minutes } } = assignment;
      if (cleanerWasPaid(job, cleanerId, payouts)) return null;
      const terms = await loadWorkedTimeRate(transaction, jobRef, { jobId, organizationId }, job, assignment);
      if (terms.agreed || terms.unresolved) return null;
      const before = assignment.payoutCents ?? amountFor(current.cleaner, minutes, roster, cleanerId);
      const after = amountFor(cleaner, minutes, roster, cleanerId);
      if (before === after && (cleaner.mode !== "HOURLY" || assignment.payoutCents === after)) return null;
      return { doc, before: before === after ? null : before, after };
    })) : [];

    if (Object.keys(updates).length) transaction.update(jobRef, updates);
    for (const adjustment of adjustments.filter(Boolean)) {
      const { doc, before, after } = adjustment;
      transaction.update(doc.ref, { payoutCents: after ?? deleteField() });
      appendJobCorrection(transaction, jobRef, {
        kind: "CLEANER_PAY", before: { assignmentId: doc.id, payoutCents: before },
        after: { assignmentId: doc.id, payoutCents: after },
        reason: "Manager updated Job pricing.", byUid: request.auth.uid, afterPayout,
      });
    }
    return { updated: Object.keys(updates).length > 0 };
  });
}
