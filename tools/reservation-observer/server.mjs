import http from "node:http";
import crypto from "node:crypto";
import { validateConfig } from "./config.mjs";

export function createObserverServer({ config, store, pairingKey = crypto.randomBytes(32).toString("hex"), port = 0 }) {
  validateConfig(config);
  const allowedOrigins = new Set([config.target.origin,
    ...(config.extensionId && /^[a-p]{32}$/.test(config.extensionId) ? [`chrome-extension://${config.extensionId}`] : [])]);
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
    const respond = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    const address = req.socket.remoteAddress;
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (address !== "127.0.0.1" || req.headers.host !== expectedHost) return respond(403, { error: "LOCALHOST_REQUIRED" });
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return respond(403, { error: "ORIGIN_DENIED" });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS" && origin) {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Observer-Pairing");
      return respond(204, {});
    }
    const key = req.headers["x-observer-pairing"];
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) || key.length !== pairingKey.length
      || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(pairingKey))) return respond(403, { error: "PAIRING_REQUIRED" });
    if (req.method === "GET" && req.url === "/health") return respond(200, { result: "SHADOW_ONLY", projectId: config.target.projectId });
    if (req.method === "GET" && req.url === "/candidates") return respond(200, { candidates: Object.values(store.snapshot().candidates) });
    if (req.method === "GET" && req.url === "/observations") return respond(200, { diagnostics: store.snapshot().diagnostics });
    if (req.method === "GET" && /^\/candidates\/[a-f0-9]{64}$/.test(req.url)) {
      const candidate = store.snapshot().candidates[req.url.split("/").at(-1)];
      return respond(candidate ? 200 : 404, candidate || { error: "NOT_FOUND" });
    }
    if (req.method !== "POST" || req.url !== "/observations") return respond(404, { error: "NO_BUSINESS_ACTION_ENDPOINT" });
    if (!String(req.headers["content-type"]).startsWith("application/json")) return respond(415, { error: "JSON_REQUIRED" });
    try {
      let body = ""; for await (const chunk of req) {
        body += chunk.toString("utf8"); if (Buffer.byteLength(body) > 256 * 1024) return respond(413, { error: "PAYLOAD_TOO_LARGE" });
      }
      const poll = JSON.parse(body);
      const source = config.sources.find(source => source.id === poll.sourceId && source.enabled === true && source.type !== "ICAL");
      if (!source || poll.complete !== false || poll.observations?.some(row => row.sourceProvider !== source.provider || row.sourceType !== source.type)) throw new Error();
      if (origin?.startsWith("chrome-extension:") && source.type !== "BROWSER_DOM") throw new Error();
      await store.ingest(poll);
      return respond(200, { result: "SHADOW_OBSERVED" });
    } catch { return respond(400, { error: "INVALID_SHADOW_OBSERVATION" }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, pairingKey, listen: () => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server.address()); });
  }) };
}
