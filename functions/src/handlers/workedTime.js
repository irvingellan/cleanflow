import { requireActiveCleaner } from "../cleanerHubAccess.js";
import { requireOrganizationManager } from "../managerAuthorization.js";
import { recordWorkedTime } from "../workedTime.js";
import { db, organizationId } from "../runtime/firebase.js";

export async function reportMyWorkedTime(request) {
  const identity = await requireActiveCleaner(db, request, organizationId);
  return recordWorkedTime(db, { organizationId, ...identity, input: request.data });
}

export async function approveWorkedTime(request) {
  await requireOrganizationManager(db, request, organizationId);
  return recordWorkedTime(db, { organizationId, uid: request.auth.uid, manager: true, input: request.data });
}

export async function removeWorkedTimeApproval(request) {
  await requireOrganizationManager(db, request, organizationId);
  return recordWorkedTime(db, { organizationId, uid: request.auth.uid, manager: true,
    input: request.data, removeApproval: true });
}
