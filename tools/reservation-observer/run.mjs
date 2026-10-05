import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { validateConfig } from "./config.mjs";
import { openLocalStore } from "./localStore.mjs";
import { createObserverServer } from "./server.mjs";
import { pollIcal } from "./icalAdapter.mjs";

export async function assertPublicFeedHost(hostname) {
  let timer;
  const addresses = await Promise.race([dns.lookup(hostname, { all: true }), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("FEED_NETWORK_DENIED")), 5000);
  })]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(({ address }) => {
    if (net.isIP(address) === 6) return !/^2[0-9a-f]{3}:/i.test(address); // Only global unicast, fail closed.
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
  })) throw new Error("FEED_NETWORK_DENIED");
}

export async function runObserver(configFile, { directory = path.resolve(".reservation-observer"), port = 4789 } = {}) {
  // Never print raw parser, fetch, config or filesystem errors containing source secrets.
  const config = validateConfig(JSON.parse(fs.readFileSync(configFile, "utf8")));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("STATE_DIRECTORY_DENIED");
  const lock = path.join(directory, "observer.lock");
  const lockHandle = fs.openSync(lock, "wx", 0o600);
  const pairingFile = path.join(directory, "pairing.local.json");
  const pairingKey = crypto.randomBytes(32).toString("hex");
  let service, stopped = false; const timers = new Set();
  try {
    const store = openLocalStore(directory, config);
    service = createObserverServer({ config, store, pairingKey, port });
    const address = await service.listen();
    if (fs.existsSync(pairingFile) && fs.lstatSync(pairingFile).isSymbolicLink()) throw new Error("PAIRING_PATH_DENIED");
    fs.writeFileSync(pairingFile, JSON.stringify({ port: address.port, pairingKey }), { mode: 0o600 });
    console.log(JSON.stringify({ result: "LOCAL_SHADOW_READY", address: "127.0.0.1", port: address.port,
      projectId: config.target.projectId, pairingFile: ".reservation-observer/pairing.local.json" }));
    const validators = {};
    async function observe(source) {
      if (stopped) return;
      let poll;
      const observedAt = new Date().toISOString();
      try {
        await assertPublicFeedHost(new URL(source.url).hostname);
        poll = await pollIcal(source, { validators: validators[source.id], observedAt });
      } catch { poll = { sourceId: source.id, observedAt, result: "ERROR", errorCategory: "FEED_NETWORK_DENIED", complete: false, observations: [] }; }
      if (!stopped) {
        try {
          await store.ingest(poll);
          if (poll.validators) validators[source.id] = poll.validators;
          console.log(JSON.stringify({ provider: source.provider, result: poll.result, errorCategory: poll.errorCategory }));
        } catch { console.log(JSON.stringify({ provider: source.provider, result: "LOCAL_STATE_WRITE_FAILED" })); }
        const timer = setTimeout(() => { timers.delete(timer); observe(source); }, source.pollIntervalMs || 300000);
        timers.add(timer);
      }
    }
    for (const source of config.sources.filter(source => source.enabled === true && source.type === "ICAL")) observe(source);
    return { service, stop: async () => {
      stopped = true; for (const timer of timers) clearTimeout(timer);
      await new Promise(resolve => service.server.close(resolve));
      fs.closeSync(lockHandle); fs.unlinkSync(lock);
    } };
  } catch (error) {
    service?.server.close(); fs.closeSync(lockHandle); fs.unlinkSync(lock); throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const observer = await runObserver(process.argv[2] || "reservation-observer.local.json");
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await observer.stop(); process.exit(0); });
  } catch { console.error("LOCAL_OBSERVER_START_FAILED — review config/target/state/port without sharing secrets"); process.exitCode = 1; }
}
