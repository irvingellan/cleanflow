import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReport } from "../engine/evidence.ts";
import { createSession, run } from "../engine/session.ts";
import { hasReason, LOCALES } from "../i18n/messages.ts";
import { SCENARIOS, scenarioById } from "../scenarios/registry.ts";
import { App } from "./App.tsx";
import { PREFIX } from "./storage.ts";

function q<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function setSpeed(value: string) {
  fireEvent.change(q("[data-control=speed]"), { target: { value } });
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
});
afterEach(() => vi.restoreAllMocks());

describe("Notification Lab UI", () => {
  it("is labelled SIMULATED, says nothing real is sent, and lists all 33 scenarios", () => {
    render(<App />);
    expect(screen.getByTestId("sim-badge")).toHaveTextContent("SIMULADO");
    expect(screen.getAllByText(/Este laboratório não envia notificações reais nem altera a agenda/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".cat-item[data-scenario]")).toHaveLength(33);
  });

  it("Run (instant) reaches the terminal state and every expectation passes", () => {
    render(<App />);
    fireEvent.click(q('[data-scenario="F04"]'));
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    const results = [...document.querySelectorAll("[data-check]")].map((el) => el.getAttribute("data-result"));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r === "pass")).toBe(true);
    expect(screen.getByTestId("run-status")).toHaveTextContent("Concluído");
  });

  it("Step advances exactly one transition", () => {
    render(<App />);
    fireEvent.click(q('[data-scenario="C03"]'));
    const rows = () => document.querySelectorAll("[data-testid=trail] li").length;
    expect(rows()).toBe(0);
    fireEvent.click(q("[data-control=step]"));
    const after1 = rows();
    expect(after1).toBeGreaterThan(0);
    fireEvent.click(q("[data-control=step]"));
    expect(rows()).toBeGreaterThan(after1);
    expect(q("[data-testid=trail]").textContent).toContain("RECIPIENT_SELECTED");
    expect(q("[data-testid=trail]").textContent).not.toContain("INBOX_STORED");
  });

  it("Replay exactly reproduces the same fingerprint", () => {
    render(<App />);
    fireEvent.click(q('[data-scenario="C04"]'));
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    const before = screen.getByTestId("fingerprint").textContent;
    fireEvent.click(q("[data-control=replay]"));
    expect(screen.getByTestId("fingerprint").textContent).toBe(before);
    expect(screen.getByTestId("toast")).toHaveTextContent("Repetição idêntica");
  });

  it("phone buttons change the simulation: interest on Ana's phone notifies Gabi only", () => {
    render(<App />);
    fireEvent.click(q('[data-scenario="M01"]'));
    const ana = q('[data-testid="phone-ana-iphone"]');
    fireEvent.click(within(ana).getByRole("tab", { name: /App/ }));
    fireEvent.click(within(ana).getByRole("button", { name: "Tenho interesse" }));
    const gabi = q('[data-testid="phone-gabi-iphone"]');
    fireEvent.click(within(gabi).getByRole("tab", { name: /Avisos/ }));
    expect(within(gabi).getAllByTestId("inbox-item")).toHaveLength(1);
    expect(within(gabi).getByText("Interesse em oferta")).toBeInTheDocument();
    // Lock screen shows nothing until display is explicitly simulated.
    fireEvent.click(within(gabi).getByRole("tab", { name: /Tela bloqueada/ }));
    expect(within(gabi).queryByTestId("push-card")).toBeNull();
    fireEvent.click(within(gabi).getByRole("button", { name: /Simular exibição/ }));
    expect(within(gabi).getByTestId("push-card")).toHaveTextContent("SIMULADO");
  });

  it("Export JSON downloads a real local file with the report", async () => {
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:lab-test";
    });
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    fireEvent.click(q('[data-scenario="F09"]'));
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    fireEvent.click(q("[data-top=export]"));
    expect(click).toHaveBeenCalledTimes(1);
    const report = JSON.parse(await blobs[0]!.text());
    expect(report.simulated).toBe(true);
    expect(report.scenario.id).toBe("F09");
    expect(report.push[0].providerResult).toBe("UNKNOWN");
    expect(report.push[0].displayedAt).toBeNull();
    expect(report.expectedVsObserved.every((c: { observed: string }) => c.observed === "PASS")).toBe(true);
  });

  it("Copy Markdown really writes to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App />);
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    fireEvent.click(q('[data-rtab="evidence"]'));
    await act(async () => fireEvent.click(q('[data-action="copy-md"]')));
    expect(writeText).toHaveBeenCalledTimes(1);
    const md = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(md).toContain("# CleanFlow Notification Lab V1 — M01");
    expect(md).toContain("Business rules to confirm (Codex)");
    await act(async () => fireEvent.click(q('[data-action="gabi-summary"]')));
    expect((writeText.mock.calls[1] as unknown as [string])[0]).toContain("Interesse em oferta");
  });

  it("saves and restores a local snapshot; Clear all only removes lab keys", () => {
    window.localStorage.setItem("someone-else", "keep");
    render(<App />);
    fireEvent.click(q('[data-scenario="C05"]'));
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    const print = screen.getByTestId("fingerprint").textContent;
    fireEvent.click(q('[data-rtab="evidence"]'));
    fireEvent.click(q('[data-action="save"]'));
    expect(window.localStorage.getItem(`${PREFIX}snapshot`)).toContain("C05");
    fireEvent.click(q("[data-control=reset]"));
    expect(screen.getByTestId("fingerprint").textContent).not.toBe(print);
    fireEvent.click(q('[data-action="restore"]'));
    expect(screen.getByTestId("fingerprint").textContent).toBe(print);
    fireEvent.click(q('[data-action="clear"]'));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("somente os dados DEMO");
    fireEvent.click(q('[data-action="confirm-clear"]'));
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX))).toEqual([]);
    expect(window.localStorage.getItem("someone-else")).toBe("keep");
  });

  it("switching the account on a phone hides the previous person's notices", () => {
    render(<App />);
    fireEvent.click(q('[data-scenario="C03"]'));
    setSpeed("instant");
    fireEvent.click(q("[data-control=run]"));
    const bia = q('[data-testid="phone-bia-android"]');
    fireEvent.click(within(bia).getByRole("tab", { name: /Avisos/ }));
    expect(within(bia).getAllByTestId("inbox-item")).toHaveLength(1);
    fireEvent.click(q('[data-rtab="state"]'));
    fireEvent.change(q("[data-testid=device-select]"), { target: { value: "bia-android" } });
    fireEvent.click(q('[data-action="switch-account"]'));
    expect(within(bia).queryAllByTestId("inbox-item")).toHaveLength(0);
    expect(bia).toHaveTextContent("Carla · org-demo");
  });

  it("speaks PT, EN and ES and offers Gabi's simple view", () => {
    render(<App />);
    fireEvent.change(q("[data-control=language]"), { target: { value: "en" } });
    expect(screen.getByTestId("sim-badge")).toHaveTextContent("SIMULATED");
    fireEvent.change(q("[data-control=language]"), { target: { value: "es" } });
    expect(screen.getAllByText(/Este laboratorio no envía notificaciones reales/).length).toBeGreaterThan(0);
    fireEvent.click(q('[data-mode-btn="gabi"]'));
    expect(screen.getByRole("button", { name: /Verlo pasar/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".gabi-card").length).toBeGreaterThanOrEqual(6);
  });
});

describe("translations and evidence hygiene", () => {
  it("every reason code produced by the 33 scenarios is translated in PT/EN/ES", () => {
    const missing = new Set<string>();
    for (const sc of SCENARIOS) {
      const w = run(createSession(sc)).world;
      const codes = [
        ...w.timeline.map((r) => r.reason),
        ...w.attempts.flatMap((a) => [a.blockedReason, a.unknownReason, a.suppressedReason]),
      ].filter((c): c is string => Boolean(c));
      for (const code of codes) for (const l of LOCALES) if (!hasReason(l, code)) missing.add(`${l}:${code}`);
    }
    expect([...missing]).toEqual([]);
  });

  it("reports contain no real-looking personal data or secrets", () => {
    for (const sc of SCENARIOS) {
      const text = JSON.stringify(buildReport(run(createSession(scenarioById(sc.id))), "pt"));
      expect(text, sc.id).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // e-mail
      expect(text, sc.id).not.toMatch(/\(?\b\d{3}\)?[\s.]\d{3}[\s.-]\d{4}\b|\+\d{10,}/); // phone number
      expect(text, sc.id).not.toMatch(/AIza|BEGIN PRIVATE KEY|fcmToken|onesignal/i);
    }
  });
});

describe("offline-only source guard", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(root);

  it.each([
    ["Notification permission API", /Notification\s*\.\s*(requestPermission|permission)|new\s+Notification\s*\(/],
    ["Push API / service worker", /PushManager|pushManager|serviceWorker\s*\.\s*register|showNotification/],
    ["network calls", /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon/],
    ["Firebase / providers", /from\s+["'](firebase|@firebase|react-onesignal|@novu)/],
  ])("source does not use %s", (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
