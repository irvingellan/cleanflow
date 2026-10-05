// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { openLocalStore } from "../../../tools/reservation-observer/localStore.mjs";
import { createObserverServer } from "../../../tools/reservation-observer/server.mjs";
import { validateConfig, redactUrl, safeDiagnostic } from "../../../tools/reservation-observer/config.mjs";
import { importManualObservations } from "../../../tools/reservation-observer/import.mjs";
const config = { target: { projectId: "clean-flow-sandbox-irving", origin: "https://clean-flow-sandbox-irving.web.app" },
  organizationId: "synthetic-org", sources: [{ id: "synthetic-browser", provider: "BROWSER_DOM_GUESTY", type: "BROWSER_DOM", enabled: true }] };
const poll = { sourceId: "synthetic-browser", result: "SUCCESS", complete: false, observedAt: "2026-10-04T12:00:00Z",
  observations: [{ sourceId: "synthetic-browser", sourceProvider: "BROWSER_DOM_GUESTY", sourceType: "BROWSER_DOM", externalReservationId: "demo-booking",
    observedAt: "2026-10-04T12:00:00Z", checkIn: "2026-10-10", checkOut: "2026-10-12" }] };
const directories = [], servers = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function store() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cleanflow-shadow-test-")); directories.push(directory); return { directory, store: openLocalStore(directory, config) }; }
describe("local-only observer security and restart", () => {
  it("manual import cannot race the running observer's local writer", async () => {
    const first = store(); fs.writeFileSync(path.join(first.directory, "observer.lock"), "");
    const manualConfig = { ...config, sources: [{ id: "manual", provider: "GUESTY", type: "MANUAL_IMPORT", enabled: true }] };
    await expect(importManualObservations(manualConfig, [{ ...poll.observations[0], sourceId: "manual", sourceProvider: "GUESTY", sourceType: "MANUAL_IMPORT" }], first.directory)).rejects.toThrow("LOCAL_OBSERVER_BUSY");
    expect(fs.existsSync(path.join(first.directory, "shadow-state.json"))).toBe(false);
  });
  it("idempotent restart with no business actions or Firebase client", async () => {
    const first = store(); await first.store.ingest(poll); await first.store.ingest(poll);
    const restored = openLocalStore(first.directory, config);
    expect(Object.keys(restored.snapshot().candidates)).toHaveLength(1);
    expect(restored.snapshot().binding.projectId).toBe("clean-flow-sandbox-irving");
  });
  it("corrupted state or changed organization fails closed without erasure", async () => {
    const first = store(); await first.store.ingest(poll);
    expect(() => openLocalStore(first.directory, { ...config, organizationId: "other" })).toThrow("LOCAL_STATE_CORRUPTED");
    fs.writeFileSync(path.join(first.directory, "shadow-state.json"), "{broken");
    expect(() => openLocalStore(first.directory, config)).toThrow("LOCAL_STATE_CORRUPTED");
    expect(fs.readFileSync(path.join(first.directory, "shadow-state.json"), "utf8")).toBe("{broken");
  });
  it("loopback server rejects unknown origin/host/pairing/schema; accepted ingestion creates shadow only", async () => {
    const local = store(); const service = createObserverServer({ config, store: local.store, pairingKey: "a".repeat(64) });
    const address = await service.listen(); servers.push(service.server);
    expect(address.address).toBe("127.0.0.1");
    const url = `http://127.0.0.1:${address.port}`;
    const headers = { "Content-Type": "application/json", "X-Observer-Pairing": "a".repeat(64) };
    expect((await fetch(url + "/health")).status).toBe(403);
    expect((await fetch(url + "/health", { headers: { ...headers, Origin: "https://evil.example" } })).status).toBe(403);
    const wrongHostStatus = await new Promise(resolve => {
      http.get(url + "/health", { headers: { ...headers, Host: "evil.example" } }, response => { response.resume(); resolve(response.statusCode); });
    });
    expect(wrongHostStatus).toBe(403);
    expect((await fetch(url + "/observations", { method: "POST", headers, body: JSON.stringify({ ...poll, observations: [{ ...poll.observations[0], token: "forbidden" }] }) })).status).toBe(400);
    expect((await fetch(url + "/observations", { method: "POST", headers, body: JSON.stringify(poll) })).status).toBe(200);
    const snapshot = await (await fetch(url + "/candidates", { headers })).json(); expect(snapshot.candidates).toHaveLength(1);
    for (const endpoint of ["/jobs", "/assign", "/send-message", "/cancel-reservation"]) expect((await fetch(url + endpoint, { method: "POST", headers, body: "{}" })).status).toBe(404);
  });
  it("production/unknown target reject before store/server creation", () => {
    for (const projectId of ["clean-flow-prototipo", "unknown"]) expect(() => validateConfig({ ...config, target: { ...config.target, projectId } })).toThrow("SHADOW_TARGET_DENIED");
  });
  it("privacy-minimal diagnostic and URL redaction discard secrets", () => {
    expect(redactUrl("https://secret.example/token?a=private")).not.toContain("secret.example");
    expect(JSON.stringify(safeDiagnostic({ sourceProvider: "GUESTY", result: "ERROR", token: "secret", url: "private", errorCategory: "https://secret" }))).not.toMatch(/secret|private/);
  });
  it("extension has no cookie/auth/webRequest/remote-control permissions", () => {
    const root = "tools/reservation-observer/extension/";
    const manifest = JSON.parse(fs.readFileSync(root + "manifest.json", "utf8"));
    expect(manifest.permissions).toEqual(["storage"]); expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
    for (const filename of ["content.js", "parser.js", "background.js"]) {
      const code = fs.readFileSync(root + filename, "utf8");
      expect(code).not.toMatch(/document\.cookie|localStorage|sessionStorage|\.click\(|\.submit\(|\.reload\(|\.innerHTML|outerHTML|Authorization/);
    }
  });
});
