import { buildIntegratedContext } from "../integrated-v2/fixtures.js";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw Error("Local synthetic QA only");
globalThis.__integratedContext = buildIntegratedContext();
globalThis.__integratedBlocked = [];
globalThis.__workspaceReads = [];
await import("../../src/main.jsx");
