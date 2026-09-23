import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: firebase.collection,
  deleteField: firebase.deleteField,
  doc: firebase.doc,
  getDocs: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: firebase.updateDoc,
  where: vi.fn(),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

describe("updateProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.doc.mockReturnValue("property-reference");
    firebase.deleteField.mockReturnValue("delete-price");
  });

  it("updates only the approved Property fields and removes blank optional prices", async () => {
    const { updateProperty } = await import("./propertyService.js");

    await expect(updateProperty("property-1", {
      name: "Updated Property",
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
    })).resolves.toEqual({
      id: "property-1",
      name: "Updated Property",
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
    });

    expect(firebase.updateDoc).toHaveBeenCalledWith("property-reference", {
      name: "Updated Property",
      defaultClientPrice: "delete-price",
      defaultCleanerPrice: 125,
    });
  });
});
