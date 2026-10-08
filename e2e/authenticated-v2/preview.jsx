import { buildIntegratedContext } from "../integrated-v2/fixtures.js";
if (!import.meta.env.DEV || !["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Local synthetic App QA only");
globalThis.__integratedContext = buildIntegratedContext();
globalThis.__integratedBlocked = [];
await import("../../src/main.jsx");
