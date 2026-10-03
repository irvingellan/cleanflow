// The actual Job Detail imports services for pure availability helpers. Preserve
// those helpers, but fail immediately if any service reaches its provider API.
function forbiddenCall(name) {
  return (...args) => {
    globalThis.__lifecycleProviderCalls ||= [];
    globalThis.__lifecycleProviderCalls.push({ name, argumentCount: args.length });
    throw new Error(`Provider API unavailable in local lifecycle harness: ${name}`);
  };
}

export const addDoc = forbiddenCall("addDoc");
export const collection = forbiddenCall("collection");
export const doc = forbiddenCall("doc");
export const documentId = forbiddenCall("documentId");
export const getDoc = forbiddenCall("getDoc");
export const getDocs = forbiddenCall("getDocs");
export const query = forbiddenCall("query");
export const runTransaction = forbiddenCall("runTransaction");
export const serverTimestamp = forbiddenCall("serverTimestamp");
export const updateDoc = forbiddenCall("updateDoc");
export const where = forbiddenCall("where");
export const httpsCallable = (_functions, name) => forbiddenCall(`httpsCallable:${name}`);
