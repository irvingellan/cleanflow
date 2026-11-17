import { registerManagerDevice, deactivateManagerDevice } from "../managerDeviceRegistration.js";
import { db } from "../runtime/firebase.js";
import { organizationIdForRequest } from "../runtime/organization.js";

export async function registerManagerPushDevice(request) {
  const organizationId = organizationIdForRequest(request);
  return registerManagerDevice({ database: db, organizationId, request });
}

export async function deactivateManagerPushDevice(request) {
  const organizationId = organizationIdForRequest(request);
  return deactivateManagerDevice({ database: db, organizationId, request });
}
