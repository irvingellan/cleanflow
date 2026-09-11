import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDevCenterController } from "./useDevCenterController.js";

const services = vi.hoisted(() => ({
  clearDevCenterData: vi.fn(),
  generateDevCenterScenario: vi.fn(),
  getDevCenterAccess: vi.fn(),
  getManagerNotificationDiagnostics: vi.fn(),
  previewManagerReminder: vi.fn(),
}));

vi.mock("./devCenterService.js", () => services);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDevCenterController", () => {
  it("clears the preview pending state after a preview error", async () => {
    services.getDevCenterAccess.mockResolvedValue({ authorized: true, environment: "emulator" });
    services.getManagerNotificationDiagnostics.mockResolvedValue({ devices: [], deliveries: [] });
    let rejectPreview;
    services.previewManagerReminder.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectPreview = reject;
    }));

    const { result } = renderHook(() => useDevCenterController({ view: "dev-center" }));
    await waitFor(() => expect(result.current.access.authorized).toBe(true));

    let request;
    act(() => {
      request = result.current.previewReminder("TODAY_07");
    });
    expect(result.current.pendingPreviewType).toBe("TODAY_07");

    await act(async () => {
      rejectPreview(new Error("Preview unavailable"));
      await expect(request).rejects.toThrow("Preview unavailable");
    });

    expect(result.current.pendingPreviewType).toBeNull();
    expect(result.current.hasError).toBe(true);
  });
});
