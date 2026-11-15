import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";

vi.mock("../../services/firebase/client.js", () => ({ functions: {} }));
const { SystemStatusPanel } = await import("./SystemStatusPanel.jsx");

const sha = "4b9e25de9ac9914852b9c47b64282e43be538a82";
const loadVersion = () => Promise.resolve({
  version: "v0.9.3", buildId: sha, environment: "production", projectId: "clean-flow-prototipo",
  deploymentId: `${sha}-cleaner-push-automatic-offers`,
});

describe("SystemStatusPanel", () => {
  it("shows the live build with its flags and measures Functions", async () => {
    const measure = vi.fn(async (name) => ({ name, ms: name === "getChecklistRun" ? 4100 : 350 }));
    render(<TranslationProvider><SystemStatusPanel loadVersion={loadVersion} measure={measure} /></TranslationProvider>);
    expect(await screen.findByText("4b9e25d")).toBeTruthy();
    expect(screen.getByRole("link", { name: /commit/i }).getAttribute("href")).toContain(sha);
    expect(screen.getByText(/automatic approval: on|aprovação automática: ligado/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /measure|medir/i }));
    expect(await screen.findByText(/4100 ms/)).toBeTruthy();
    expect(screen.getByText("4100 ms · Slow response")).toBeVisible();
    expect(screen.getAllByText("350 ms · Fast response")).toHaveLength(3);
    expect(measure).toHaveBeenCalledTimes(4);
  });

  it("reports when version.json cannot be read", async () => {
    render(<TranslationProvider><SystemStatusPanel loadVersion={() => Promise.reject(new Error("offline"))} measure={vi.fn()} /></TranslationProvider>);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("times out and aborts when the version response body never finishes", async () => {
    vi.useFakeTimers();
    const fetchVersion = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    vi.stubGlobal("fetch", fetchVersion);
    try {
      render(<TranslationProvider><SystemStatusPanel /></TranslationProvider>);
      expect(screen.getByRole("status")).toHaveTextContent("Reading version");

      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

      expect(screen.getByRole("alert")).toHaveTextContent("Could not read version.json");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(fetchVersion.mock.calls[0][1].signal.aborted).toBe(true);
      expect(screen.getByRole("button", { name: "Measure Functions" })).toBeEnabled();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
