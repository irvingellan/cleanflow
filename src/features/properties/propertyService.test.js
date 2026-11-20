import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: firebase.addDoc,
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
    firebase.collection.mockReturnValue("properties-collection");
    firebase.deleteField.mockReturnValue("delete-price");
  });

  it("updates approved Property fields and removes blank optional values", async () => {
    const { updateProperty } = await import("./propertyService.js");

    await expect(updateProperty("property-1", {
      name: "Updated Property",
      client: { id: "client-2", name: "Sara" },
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
      address: "123 Main St",
      garageParking: undefined,
      cleanerInstructions: "Use side entrance",
      additionalNotes: undefined,
      keyCodeInfo: "Updated lockbox details",
      accessInstructions: undefined,
    })).resolves.toEqual({
      id: "property-1",
      name: "Updated Property",
      clientId: "client-2",
      clientName: "Sara",
      defaultClientPrice: undefined,
      defaultCleanerPrice: 125,
      address: "123 Main St",
      garageParking: undefined,
      cleanerInstructions: "Use side entrance",
      additionalNotes: undefined,
      keyCodeInfo: "Updated lockbox details",
      accessInstructions: undefined,
    });

    expect(firebase.updateDoc).toHaveBeenCalledWith("property-reference", {
      name: "Updated Property",
      defaultClientPrice: "delete-price",
      defaultCleanerPrice: 125,
      address: "123 Main St",
      garageParking: "delete-price",
      cleanerInstructions: "Use side entrance",
      additionalNotes: "delete-price",
      keyCodeInfo: "Updated lockbox details",
      accessInstructions: "delete-price",
      clientId: "client-2",
      clientName: "Sara",
    });
  });

  it("persists only edited service rows, and supports clearing a row", async () => {
    const { createProperty, updateProperty } = await import("./propertyService.js");
    const row = { cleaner: { mode: "HOURLY", amountCents: 3850 } };
    firebase.addDoc.mockResolvedValue({ id: "property-1" });
    await createProperty({ name: "Example", serviceRates: { DEEP_CLEANING: row }, active: true });
    expect(firebase.addDoc).toHaveBeenCalledWith("properties-collection", expect.objectContaining({
      serviceRates: { DEEP_CLEANING: row },
    }));
    await updateProperty("property-1", {
      name: "Example", serviceRates: { DEEP_CLEANING: row }, changedRateTypes: ["DEEP_CLEANING", "STANDARD"],
    });
    const patch = firebase.updateDoc.mock.calls[0][1];
    expect(patch["serviceRates.DEEP_CLEANING"]).toEqual(row);
    expect(patch["serviceRates.STANDARD"]).toEqual("delete-price");
    expect(patch).not.toHaveProperty("serviceRates");
  });

  it("creates a Property with optional access fields only when provided", async () => {
    const { createProperty } = await import("./propertyService.js");
    firebase.addDoc.mockResolvedValue({ id: "property-1" });

    await createProperty({
      name: "New Property",
      clientId: "client-1",
      clientName: "Carl",
      defaultClientPrice: undefined,
      defaultCleanerPrice: undefined,
      keyCodeInfo: "Key at front desk",
      accessInstructions: "Use entry keypad",
      active: true,
    });

    const createdProperty = firebase.addDoc.mock.calls[0][1];
    expect(createdProperty).toMatchObject({
      name: "New Property",
      keyCodeInfo: "Key at front desk",
      accessInstructions: "Use entry keypad",
    });
    expect(createdProperty).not.toHaveProperty("address");
  });
});
