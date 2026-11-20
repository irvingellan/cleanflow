import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAuthorizedDeveloper } from "../devCenterAuthorization.js";
import { organizationKey } from "../platformOverview.js";
import { readOverview, readPeople } from "../platformOverviewStore.js";
import { createSnapshotReader, recentFailures } from "../platformOwnerTools.js";
import { allowedDeveloperUids } from "../runtime/devCenter.js";
import { db } from "../runtime/firebase.js";

const readSnapshot = createSnapshotReader();

async function readDetail(key) {
  // Also resolves legacy roots that exist only through their subcollections.
  const refs = await db.collection("organizations").listDocuments();
  const org = refs.find(ref => organizationKey(ref.id) === key);
  if (!org) throw new HttpsError("not-found", "Organization not found.");
  const [detail, failures] = await Promise.all([readPeople(org, getAuth()), recentFailures(org)]);
  return { ...detail, recentFailures: failures };
}

export async function getPlatformOverview(request) {
  let organizationCount = 0;
  try {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());
    if (request.auth.token?.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("permission-denied", "Developer access is required.");
    }
    const { organizationId, refresh = false } = request.data ?? {};
    if (typeof refresh !== "boolean") throw new HttpsError("invalid-argument", "Invalid refresh option.");
    if (organizationId === undefined) {
      const result = await readSnapshot("overview", refresh, () => readOverview(db));
      organizationCount = result.organizations.length;
      return result;
    }
    if (typeof organizationId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(organizationId)) {
      throw new HttpsError("invalid-argument", "Invalid organization.");
    }
    const detail = await readSnapshot("org:" + organizationId, refresh, () => readDetail(organizationId));
    organizationCount = 1;
    return detail;
  } finally {
    logger.info("Platform overview requested.", { uid: request.auth?.uid ?? null, organizationCount });
  }
}
