import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

const mocks = vi.hoisted(() => ({
  info: vi.fn(), error: vi.fn(), resolve: vi.fn(), load: vi.fn(), upload: vi.fn(), view: vi.fn(),
}));
vi.mock("firebase-functions", () => ({ logger: { info: mocks.info, error: mocks.error } }));
vi.mock("../runtime/firebase.js", () => ({ db: {}, organizationId: "example" }));
vi.mock("../checklistCapabilityService.js", () => ({ loadPublicChecklistCapability: mocks.load }));
vi.mock("../checklistMultiPhotoService.js", () => ({}));
vi.mock("../checklistEvidenceService.js", () => ({
  resolveActiveCapability: mocks.resolve, loadPublicChecklistEvidenceView: mocks.view,
  uploadPublicChecklistEvidence: mocks.upload,
}));

import { publicChecklist } from "./publicChecklist.js";

const token = "a".repeat(43);
const identity = { sessionId: "b".repeat(36), result: "error" };
const requests = [
  ["LOAD_DIAGNOSTIC", { ...identity, routeOpened: true, totalReadyMs: 23 }],
  ["PHOTO_UPLOAD_DIAGNOSTIC", { ...identity, requestId: "c".repeat(36), durationMs: 11 }],
];

async function send(fields) {
  const response = {
    set: vi.fn(), status(code) { this.code = code; return this; },
    end() {}, json(body) { this.body = body; },
  };
  await publicChecklist({ get: () => undefined, query: {}, ...fields }, response);
  return response;
}

beforeEach(() => vi.resetAllMocks());

describe("public checklist diagnostics", () => {
  it.each(requests)("acknowledges %s across checklist link states", async (action, diagnostic) => {
    const post = token => send({ method: "POST", body: { action, token, diagnostic } });
    expect((await post(undefined)).code).toBe(204);
    expect(mocks.resolve).not.toHaveBeenCalled();
    for (const code of ["not-found", "failed-precondition"]) {
      mocks.resolve.mockRejectedValueOnce(new HttpsError(code, "Example"));
      expect((await post(token)).code).toBe(204);
    }
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect((await post(token)).code).toBe(204);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(token);
  });

  it.each([["not-found", 404], ["expired", 410], ["revoked", 410], ["stale", 410]])(
    "preserves the %s checklist response",
    async (state, status) => {
      mocks.load.mockResolvedValue({ state });
      expect((await send({ method: "GET", query: { token } })).code).toBe(status);
      expect(mocks.info).not.toHaveBeenCalled();
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );

  it("preserves upload responses across checklist states", async () => {
    const put = token => send({ method: "PUT", query: { token } });
    expect((await put(undefined)).code).toBe(404);
    mocks.upload.mockRejectedValueOnce(new HttpsError("invalid-argument", "Example"));
    expect((await put(token)).code).toBe(400);
    mocks.upload.mockRejectedValueOnce(new HttpsError("not-found", "Example"));
    expect((await put(token)).code).toBe(404);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();

    mocks.upload.mockImplementationOnce(async (_, options) => {
      options.onCapabilityResolved();
      throw new HttpsError("already-exists", "Example");
    });
    expect((await put(token)).code).toBe(409);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(token);

    mocks.upload.mockResolvedValueOnce({ evidence: [] });
    mocks.info.mockImplementationOnce(() => { throw new Error("Synthetic logging failure."); });
    expect((await put(token)).code).toBe(200);
  });

  it("keeps server failure details for an active checklist upload", async () => {
    mocks.upload.mockImplementationOnce(async (_, options) => {
      options.onCapabilityResolved();
      throw Object.assign(new Error("Synthetic storage failure."), { checklistPhotoDiagnosticStage: "storage-write" });
    });
    expect((await send({ method: "PUT", query: { token } })).code).toBe(500);
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("Unable to process public checklist request.",
      { stage: "evidence-upload", code: "internal" });
  });

  it("acknowledges diagnostics when the request cannot be processed", async () => {
    const [[action, diagnostic]] = requests;
    mocks.resolve.mockRejectedValueOnce(new Error("Synthetic service failure."));
    expect((await send({ method: "POST", body: { action, token, diagnostic } })).code).toBe(204);
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("Unable to record public checklist diagnostic.", {});
  });
});
