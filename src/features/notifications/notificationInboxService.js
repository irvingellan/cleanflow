import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import { cleanerHubFirebase } from "../cleaner-hub/cleanerHubFirebase.js";

async function callInbox(name, role, fields) {
  const client = role === "CLEANER" ? cleanerHubFirebase().functions : functions;
  const { data } = await httpsCallable(client, name, { timeout: 15_000 })({ role, ...fields });
  return data;
}

export const notificationInboxService = {
  list: (role, fields) => callInbox("listNotificationInbox", role, fields),
  mark: (role, id) => callInbox("markNotificationRead", role, { id }),
  open: (role, id) => callInbox("openNotificationInboxItem", role, { id }),
  respondToReschedule: (role, eventId, fields) => callInbox("respondToMyReschedule", role, { eventId, ...fields }),
};
