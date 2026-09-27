import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn(),
  documentId: vi.fn(() => "__name__"),
  getDocs: vi.fn(),
  query: vi.fn((_collection, condition) => ({ condition })),
  where: vi.fn((_field, _operator, ids) => ({ ids })),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: firestore.collection,
  doc: vi.fn(),
  documentId: firestore.documentId,
  getDocs: firestore.getDocs,
  query: firestore.query,
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  where: firestore.where,
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

import { getCleanerContactsById, getCleanerNamesById } from "./cleanerService.js";

describe("Cleaner contact lookup for manager handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.collection.mockReturnValue("cleaners");
    firestore.getDocs.mockResolvedValue({
      docs: [{
        id: "cleaner-a",
        data: () => ({
          name: "Ana",
          phone: "+19495551234",
          paymentContact: "must not escape this lookup",
        }),
      }],
    });
  });

  it("returns only name and phone for referenced cleaners", async () => {
    await expect(getCleanerContactsById(["cleaner-a", "cleaner-a", null])).resolves.toEqual({
      "cleaner-a": { name: "Ana", phone: "+19495551234" },
    });
    expect(firestore.where).toHaveBeenCalledWith("__name__", "in", ["cleaner-a"]);
  });

  it("preserves the existing names-only lookup contract", async () => {
    await expect(getCleanerNamesById(["cleaner-a"])).resolves.toEqual({ "cleaner-a": "Ana" });
  });
});
