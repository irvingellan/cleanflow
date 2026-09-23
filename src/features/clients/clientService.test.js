import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({ deleteField: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: firebase.deleteField,
  doc: firebase.doc,
  getDocs: vi.fn(),
  query: vi.fn(),
  serverTimestamp: firebase.serverTimestamp,
  updateDoc: firebase.updateDoc,
  where: vi.fn(),
}));
vi.mock("../../services/firebase/client.js", () => ({ db: {} }));

describe("updateClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.doc.mockReturnValue("client-reference");
    firebase.deleteField.mockReturnValue("delete-field");
    firebase.serverTimestamp.mockReturnValue("updated-time");
  });

  it("preserves Client identity while updating contact fields and clearing blanks", async () => {
    const { updateClient } = await import("./clientService.js");

    await expect(updateClient("client-1", {
      name: "Updated Client",
      email: "client@example.com",
      phone: undefined,
      whatsapp: "+15551234567",
      preferredCommunicationChannel: "WHATSAPP",
      notes: undefined,
    })).resolves.toEqual({
      id: "client-1",
      name: "Updated Client",
      email: "client@example.com",
      phone: undefined,
      whatsapp: "+15551234567",
      preferredCommunicationChannel: "WHATSAPP",
      notes: undefined,
    });
    expect(firebase.updateDoc).toHaveBeenCalledWith("client-reference", {
      name: "Updated Client",
      updatedAt: "updated-time",
      email: "client@example.com",
      phone: "delete-field",
      whatsapp: "+15551234567",
      preferredCommunicationChannel: "WHATSAPP",
      notes: "delete-field",
    });
  });
});
