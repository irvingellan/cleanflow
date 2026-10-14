import { describe, expect, it } from "vitest";
import { Storage } from "@google-cloud/storage";
import { getChecklistAttemptStorage } from "./checklistAttemptStorage.js";

describe("V2 dedicated single-attempt Storage client", () => {
  it("preserves bucket, endpoint and auth binding without mutating the shared client's retries", () => {
    const source = new Storage({ projectId: "demo-cleanflow", apiEndpoint: "http://127.0.0.1:19199", retryOptions: { autoRetry: true, maxRetries: 3 } });
    const firebaseStorage = { bucket: () => source.bucket("demo-cleanflow.appspot.com") };
    const dedicated = getChecklistAttemptStorage(firebaseStorage);
    const bucket = dedicated.bucket();
    expect(bucket.name).toBe("demo-cleanflow.appspot.com");
    expect(bucket.storage).not.toBe(source);
    expect(bucket.storage.authClient).toBe(source.authClient);
    expect(bucket.storage.apiEndpoint).toBe(source.apiEndpoint);
    expect(bucket.storage.projectId).toBe(source.projectId);
    expect(bucket.storage.retryOptions).toMatchObject({ autoRetry: false, maxRetries: 0 });
    expect(source.retryOptions).toMatchObject({ autoRetry: true, maxRetries: 3 });
    expect(getChecklistAttemptStorage(firebaseStorage)).toBe(dedicated);
  });
});
