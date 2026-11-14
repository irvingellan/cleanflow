import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClientSummariesById } from "../clients/clientService.js";
import { getPropertySummariesById } from "../properties/propertyService.js";

const firestore = vi.hoisted(() => ({
  collection: vi.fn(), documentId: () => "__name__", where: vi.fn(), query: vi.fn(),
  getServerDocs: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(),
}));
vi.mock("firebase/firestore", () => firestore);
vi.mock("firebase/firestore/lite", () => ({
  ...firestore, getDocs: firestore.getServerDocs, getFirestore: () => ({}), setLogLevel: vi.fn(),
}));
vi.mock("../../services/firebase/client.js", () => ({
  db: {}, firebaseApp: {}, useFirebaseEmulators: false,
}));

describe.each([
  ["clients", getClientSummariesById, { id: "context", name: "Example" }],
  ["properties", getPropertySummariesById, { id: "context", name: "Example", clientId: "linked-client" }],
])("Weekly Close %s context", (collection, read, projected) => {
  beforeEach(() => {
    vi.resetAllMocks();
    firestore.collection.mockImplementation((_db, ...segments) => segments.join("/"));
    firestore.where.mockImplementation((...input) => input);
    firestore.query.mockImplementation((...input) => input);
  });

  it("projects only the context fields on a bounded server query", async () => {
    firestore.getServerDocs.mockResolvedValue({
      docs: [{ id: "context", data: () => ({ name: "Example", clientId: "linked-client", privateNotes: "Excluded" }) }],
    });
    await expect(read(["context"])).resolves.toEqual([projected]);
    expect(firestore.getServerDocs).toHaveBeenCalledExactlyOnceWith([
      `organizations/cleanflow-demo/${collection}`, ["__name__", "in", ["context"]],
    ]);
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.addDoc).not.toHaveBeenCalled();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it("never opens a full collection for zero IDs or an invalid batch", async () => {
    await expect(read([])).resolves.toEqual([]);
    await expect(read(Array.from({ length: 31 }, (_, index) => `id-${index}`))).rejects.toThrow(RangeError);
    expect(firestore.getServerDocs).not.toHaveBeenCalled();
  });

  it("surfaces server failure without reading cached context", async () => {
    firestore.getServerDocs.mockRejectedValue(new Error("unavailable"));
    await expect(read(["context"])).rejects.toThrow("unavailable");
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });
});
