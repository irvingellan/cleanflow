import { useEffect } from "react";
import { associateOneSignalUser } from "./oneSignalService.js";

export function useOneSignalIdentity(userId) {
  useEffect(() => {
    if (!userId) return undefined;

    // Initialization is promise-deduplicated in the service for React StrictMode.
    associateOneSignalUser(userId).catch(() => undefined);
    return undefined;
  }, [userId]);
}
