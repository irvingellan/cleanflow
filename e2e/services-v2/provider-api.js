export * from "../lifecycle/provider-api.js";
const denied = () => { throw new Error("Provider unavailable in synthetic Services preview"); };
export const Timestamp = { fromDate: denied };
export const getDocsFromServer = denied;
export const orderBy = denied;
export const limit = denied;
export const startAfter = denied;
export const deleteField = denied;
