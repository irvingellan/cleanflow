import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgePublicOfferAssignment,
  respondToPublicOffer,
} from "./publicOfferService.js";

afterEach(() => vi.unstubAllGlobals());

describe("public Offer actions", () => {
  it("uses the existing public Offer capability for assignment acknowledgment", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ assignmentAcknowledgment: "CONFIRMED" }),
    });
    vi.stubGlobal("fetch", fetch);

    await expect(acknowledgePublicOfferAssignment({ token: "opaque-token" }))
      .resolves.toEqual({ assignmentAcknowledgment: "CONFIRMED" });
    expect(fetch).toHaveBeenCalledWith("/api/public-offer", expect.objectContaining({
      method: "POST",
      credentials: "omit",
      body: JSON.stringify({ token: "opaque-token", action: "ACKNOWLEDGE_ASSIGNMENT" }),
    }));
  });

  it("keeps interest/decline requests on their existing status payload", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "INTERESTED" }),
    });
    vi.stubGlobal("fetch", fetch);

    await respondToPublicOffer({ token: "opaque-token", status: "INTERESTED" });
    expect(fetch).toHaveBeenCalledWith("/api/public-offer", expect.objectContaining({
      body: JSON.stringify({ token: "opaque-token", status: "INTERESTED" }),
    }));
  });
});
