import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { PlatformReleases, RecentFailures, SnapshotBar } from "./PlatformOwnerTools.jsx";
import { overviewCsv } from "./platformExport.js";
import { readPlatformReleases } from "./platformReleases.js";

afterEach(() => { vi.restoreAllMocks(); });

it("exports only company names and count columns, guarding spreadsheet formulas", () => {
  const company = { id: "internal-tenant", displayName: '-Demo, "Test"', people: { activeCleaners: 2 },
    jobs: { total: 9, created30d: "private-field" }, lastActivityAt: "private-date", health: { raw: "private-field" } };
  const csv = overviewCsv([company, { ...company, displayName: null }], key => key);
  expect(csv).toContain('"\'-Demo, ""Test"""');
  expect(csv).not.toMatch(/internal-tenant|private-date|private-field/);
  expect(csv.split("\r\n")[2]).toMatch(/^"",/);
  expect(csv).toContain('"2"');
});

it.each(["=2+2", " +3", "@demo", "\t-4", "\u0000=5", "＝6"])("escapes formula-like company names without exporting IDs", name => {
  const csv = overviewCsv([{ displayName: name, id: "private-field" }], key => key);
  expect(csv.split("\r\n")[1].split(",")[0]).toBe(`"'${name}"`);
  expect(csv).not.toContain("private-field");
});

it("uses the server timestamp and sends one explicit refresh", () => {
  const refresh = vi.fn();
  render(<TranslationProvider><SnapshotBar updatedAt="2026-01-01T12:00:00Z" onRefresh={refresh} /></TranslationProvider>);
  expect(screen.getByText(/Updated at/)).toHaveAttribute("datetime", "2026-01-01T12:00:00Z");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("shows only safe event fields and a useful empty state", () => {
  const { rerender } = render(<TranslationProvider><RecentFailures /></TranslationProvider>);
  expect(screen.getByText("No recorded errors.")).toBeVisible();
  rerender(<TranslationProvider><RecentFailures rows={[{ kind: "operation", page: "job-detail", operation: "issues",
    at: "2026-01-01T12:00:00Z", appVersion: "v1.2.3", deviceClass: "mobile" }]} /></TranslationProvider>);
  expect(screen.getByText(/Mobile · v1\.2\.3/)).toBeVisible();
});

it("loads public release metadata on expansion and keeps a fetch failure local to the panel", async () => {
  const load = vi.fn().mockRejectedValue(new Error("rate limit"));
  render(<TranslationProvider><PlatformReleases load={load} /></TranslationProvider>);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Releases"));
  await waitFor(() => expect(screen.getByText("Release information is unavailable.")).toBeVisible());
  expect(screen.queryByRole("alert")).toBeNull();
});

it("lists all open PRs, filters unmerged closures and takes five in merge order", async () => {
  const row = (number, merged_at) => ({ number, title: "Public change " + number, merged_at,
    updated_at: "2026-01-31T00:00:00Z", user: { login: "ignored" } });
  const open = Array.from({ length: 52 }, (_, i) => row(i + 1, null));
  const closed = Array.from({ length: 52 }, (_, i) => row(i + 101, i < 40 ? null : new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
  const fetcher = vi.fn(async (url, init) => {
    expect(init.credentials).toBe("omit");
    expect(init.headers).not.toHaveProperty("Authorization");
    const q = new URL(url).searchParams, offset = (Number(q.get("page")) - 1) * 50;
    return { ok: true, json: () => (q.get("state") === "open" ? open : closed).slice(offset, offset + 50) };
  });
  const result = await readPlatformReleases(new AbortController().signal, fetcher);
  expect(result.open).toHaveLength(52);
  expect(result.merged.map(pr => pr.number)).toEqual([152, 151, 150, 149, 148]);
  expect(result.open[0]).not.toHaveProperty("user");
});
