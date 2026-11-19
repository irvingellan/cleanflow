import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAuthorizedDeveloper } from "../devCenterAuthorization.js";
import { organizationKey } from "../platformOverview.js";
import { readOverview, readPeople } from "../platformOverviewStore.js";
import { allowedDeveloperUids } from "../runtime/devCenter.js";
import { db } from "../runtime/firebase.js";

export async function getPlatformOverview(request) {
  let organizationCount = 0;
  try {
    requireAuthorizedDeveloper(request, allowedDeveloperUids());
    if (request.auth.token?.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("permission-denied", "Developer access is required.");
    }
    const key = request.data?.organizationId;
    if (key === undefined) {
      const overview = await readOverview(db);
      organizationCount = overview.organizations.length;
      return overview;
    }
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) {
      throw new HttpsError("invalid-argument", "Invalid organization.");
    }
    // Also resolves legacy roots that exist only through their subcollections.
    const refs = await db.collection("organizations").listDocuments();
    const organization = refs.find((ref) => organizationKey(ref.id) === key);
    if (!organization) throw new HttpsError("not-found", "Organization not found.");
    const detail = await readPeople(organization, getAuth());
    organizationCount = 1;
    return detail;
  } finally {
    logger.info("Platform overview requested.", { uid: request.auth?.uid ?? null, organizationCount });
  }
}
