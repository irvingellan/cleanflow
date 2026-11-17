// The actual Job Detail imports services for pure availability helpers. Preserve
// those helpers, but fail immediately if any service reaches its provider API.
function forbiddenCall(name) {
  return (...args) => {
    globalThis.__lifecycleProviderCalls ||= [];
    globalThis.__lifecycleProviderCalls.push({ name, argumentCount: args.length });
    throw new Error(`Provider API unavailable in local lifecycle harness: ${name}`);
  };
}

// The page's build step (vite.config.js) adds one refused export for every other
// name the app imports from the provider SDK.
export const httpsCallable = (_functions, name) => forbiddenCall(`httpsCallable:${name}`);
