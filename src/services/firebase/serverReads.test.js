import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.js", () => ({ emulatorPorts: {}, firebaseApp: {}, useFirebaseEmulators: false }));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db, ...path) => ({ path: path.join("/") }),
  connectFirestoreEmulator: vi.fn(),
  documentId: vi.fn(),
  getDocs: vi.fn(),
  getFirestore: () => ({}),
  query: vi.fn(),
  setLogLevel: vi.fn(),
  where: vi.fn(),
}));

const { getServerCollection, withReadDeadline } = await import("./serverReads.js");

afterEach(() => vi.useRealTimers());

describe("withReadDeadline", () => {
  it("passes through a read that settles in time", async () => {
    await expect(withReadDeadline(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects a read that never answers, instead of waiting forever", async () => {
    vi.useFakeTimers();
    const pending = withReadDeadline(new Promise(() => {}), 15_000);
    const assertion = expect(pending).rejects.toMatchObject({ code: "deadline-exceeded" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});

describe("getServerCollection", () => {
  it("reads one organization collection with a one-shot server read", async () => {
    const read = vi.fn().mockResolvedValue({ docs: [{ id: "c1" }] });
    await expect(getServerCollection("org-a", "cleaners", read)).resolves.toEqual([{ id: "c1" }]);
    expect(read).toHaveBeenCalledWith({ path: "organizations/org-a/cleaners" });
  });
});
