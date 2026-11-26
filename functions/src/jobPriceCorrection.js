import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOrganizationManager } from "./managerAuthorization.js";
import { resolveJobPricing } from "./pricingModel.js";

function clientPriceSnapshot(job) {
  const { client } = resolveJobPricing(job);
  return client.mode === "HOURLY"
    ? { mode: "HOURLY", hourlyRateCents: client.rateCents }
    : { mode: "FIXED", amountCents: client.amountCents };
}

function correctionPricing(input) {
  const mode = input?.mode;
  const amountKey = mode === "HOURLY" ? "hourlyRateCents" : "amountCents";
  const cents = input?.[amountKey];
  if ((mode !== "FIXED" && mode !== "HOURLY") || !Number.isSafeInteger(cents)
    || Object.keys(input).some((key) => key !== "mode" && key !== amountKey)) {
    throw new HttpsError("invalid-argument", "A valid client price is required.");
  }
  const pricing = clientPriceSnapshot(mode === "HOURLY"
    ? { billing: { mode, hourlyRateCents: cents } }
    : { clientPrice: cents / 100 });
  if (pricing[amountKey] !== cents) {
    throw new HttpsError("invalid-argument", "A valid client price is required.");
  }
  return pricing;
}

function clientPriceUpdate(job, after) {
  if (after.mode === "HOURLY") {
    return {
      clientPrice: FieldValue.delete(),
      "billing.mode": "HOURLY",
      "billing.hourlyRateCents": after.hourlyRateCents,
    };
  }
  return {
    clientPrice: after.amountCents / 100,
    ...(job.billing?.mode != null && job.billing.mode !== "FIXED" ? { "billing.mode": "FIXED" } : {}),
    ...(Object.hasOwn(job.billing ?? {}, "hourlyRateCents") ? { "billing.hourlyRateCents": FieldValue.delete() } : {}),
  };
}

export async function correctJobPricesForManager(database, request, organizationId) {
  return database.runTransaction(async (transaction) => {
    await requireOrganizationManager(database, request, organizationId, transaction);
    const { jobId, clientPricing, reason } = request.data ?? {};
    if (typeof jobId !== "string" || !jobId.trim() || jobId.length > 256 || jobId.includes("/")
      || jobId === "." || jobId === ".." || /^__.*__$/.test(jobId)) {
      throw new HttpsError("invalid-argument", "A valid Job ID is required.");
    }
    const note = typeof reason === "string" ? reason.trim() : "";
    if (note.length < 3 || note.length > 200 || /[\p{Cc}\p{Cs}]/u.test(note)) {
      throw new HttpsError("invalid-argument", "A plain-text reason of 3 to 200 characters is required.");
    }
    const after = correctionPricing(clientPricing);

    const org = database.doc(`organizations/${organizationId}`);
    const jobRef = org.collection("jobs").doc(jobId);
    const job = (await transaction.get(jobRef)).data();
    if (!job || job.organizationId !== organizationId) throw new HttpsError("not-found", "Job not found.");

    const before = clientPriceSnapshot(job);
    if (before.mode === after.mode && before.amountCents === after.amountCents
      && before.hourlyRateCents === after.hourlyRateCents) return { unchanged: true };

    const afterPayout = Boolean(job.payoutId || job.payoutPaidAt || Object.keys(job.payoutIdsByCleaner ?? {}).length)
      || !(await transaction.get(org.collection("payouts").where("jobIds", "array-contains", jobId).limit(1))).empty;
    transaction.update(jobRef, clientPriceUpdate(job, after));
    transaction.create(jobRef.collection("corrections").doc(), {
      kind: "CLIENT_PRICE",
      before,
      after,
      reason: note,
      byUid: request.auth.uid,
      at: FieldValue.serverTimestamp(),
      afterPayout,
    });
    return { unchanged: false };
  });
}
