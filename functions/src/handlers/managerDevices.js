import { registerManagerDevice, deactivateManagerDevice } from "../managerDeviceRegistration.js";
import { db, organizationId } from "../runtime/firebase.js";

export async function registerManagerPushDevice(request) {
  return registerManagerDevice({ database: db, organizationId, request });
}

export async function deactivateManagerPushDevice(request) {
  return deactivateManagerDevice({ database: db, organizationId, request });
}
