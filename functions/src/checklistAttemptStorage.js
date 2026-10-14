import { Storage } from "@google-cloud/storage";

const clients = new WeakMap();

/** Reuse Firebase's public bucket/auth/endpoint binding, never its retry settings. */
export function getChecklistAttemptStorage(firebaseStorage) {
  if (clients.has(firebaseStorage)) return clients.get(firebaseStorage);
  const bucket = firebaseStorage.bucket();
  const source = bucket.storage;
  const client = new Storage({
    authClient: source.authClient,
    apiEndpoint: source.apiEndpoint,
    projectId: source.projectId,
    retryOptions: { autoRetry: false, maxRetries: 0 },
  });
  // Storage 7.22.0 defaults a constructor maxRetries of zero back to three.
  // Set the dedicated client's public retry policy explicitly; never the shared one.
  client.retryOptions.maxRetries = 0;
  const scoped = { bucket: () => client.bucket(bucket.name) };
  clients.set(firebaseStorage, scoped);
  return scoped;
}
