import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({ doc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
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
    firebase.serverTimestamp.mockReturnValue("updated-time");
  });

  it("preserves the Client document identity while updating its name", async () => {
    const { updateClient } = await import("./clientService.js");

    await expect(updateClient("client-1", { name: "Updated Client" })).resolves.toEqual({
      id: "client-1",
      name: "Updated Client",
    });
    expect(firebase.updateDoc).toHaveBeenCalledWith("client-reference", {
      name: "Updated Client",
      updatedAt: "updated-time",
    });
  });
});
