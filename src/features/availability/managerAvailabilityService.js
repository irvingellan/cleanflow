import { collection, getDocs, limit, query, where } from "firebase/firestore/lite";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import { serverFirestore, withReadDeadline } from "../../services/firebase/serverReads.js";
import { managerOrganizationId } from "../../services/firebase/config.js";
import { localDateKey } from "../cleaner-hub/cleanerAgendaModel.js";
import { unavailabilityPeriodError } from "../../../functions/src/unavailabilityPeriod.js";

function periodFields(data) {
  const period = { startDate: data.startDate, endDate: data.endDate };
  if (Object.hasOwn(data, "startTime")) period.startTime = data.startTime;
  if (Object.hasOwn(data, "endTime")) period.endTime = data.endTime;
  return period;
}

function blockCollection() {
  return collection(serverFirestore(), "organizations", managerOrganizationId, "cleanerUnavailability");
}

function scopedBlock(data, date) {
  return data.organizationId === managerOrganizationId && typeof data.cleanerId === "string" && data.cleanerId.length > 0
    && ["CLEANER", "MANAGER"].includes(data.createdBy) && !unavailabilityPeriodError(data, date);
}

/** All candidates for one picker come from one server query. Matching their Job start is local. */
export async function readAvailabilityForPicker(scheduledDate) {
  const snapshot = await getDocs(query(blockCollection(), where("endDate", ">=", scheduledDate)));
  return snapshot.docs.flatMap(doc => {
    const data = doc.data();
    return scopedBlock(data, scheduledDate) && data.startDate <= scheduledDate
      ? [{ cleanerId: data.cleanerId, ...periodFields(data) }] : [];
  });
}

export function managerAvailabilityForCleaner(cleanerId) {
  return {
    async list() {
      const today = localDateKey();
      const snapshot = await withReadDeadline(getDocs(query(blockCollection(),
        where("organizationId", "==", managerOrganizationId), where("cleanerId", "==", cleanerId),
        where("endDate", ">=", today), limit(30))));
      return { blocks: snapshot.docs.flatMap(doc => {
        const data = doc.data();
        return data.cleanerId === cleanerId && scopedBlock(data, today)
          ? [{ id: doc.id, ...periodFields(data), createdBy: data.createdBy }] : [];
      }) };
    },
    async set(period) {
      const result = await httpsCallable(functions, "setCleanerUnavailability")({ cleanerId, ...periodFields(period) });
      return result.data;
    },
    async remove({ blockId }) {
      const result = await httpsCallable(functions, "removeCleanerUnavailability")({ cleanerId, blockId });
      return result.data;
    },
  };
}
