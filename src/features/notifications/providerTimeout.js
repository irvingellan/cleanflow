export const providerCheckTimeoutMs = 4_000;

export class ProviderTimeoutError extends Error {
  constructor(label) {
    super(`${label} timed out.`);
    this.name = "ProviderTimeoutError";
  }
}

export function withProviderTimeout(promise, label, timeoutMs = providerCheckTimeoutMs) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new ProviderTimeoutError(label)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => window.clearTimeout(timeoutId));
}
