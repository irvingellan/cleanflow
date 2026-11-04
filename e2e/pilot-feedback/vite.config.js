// Pilot feedback UX harness (2026-11-04). Renders the real manager Job Detail,
// Cleaner Hub and public checklist with fictitious in-memory data. No Firebase
// SDK, configuration, credentials or network: every provider import resolves to
// a stub that records and throws if it is ever called.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function firebaseImportNames() {
  const names = new Set();
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']firebase\/[a-z/]+["']/g)) {
        match[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((name) => names.add(name));
      }
    }
  });
  walk(path.join(root, "src"));
  return [...names];
}

const stubId = "\0pilot-feedback-firebase-stub";

export default defineConfig({
  root: here,
  envDir: false,
  cacheDir: path.join(root, "node_modules/.vite-pilot-feedback"),
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-pilot-feedback-harness") },
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    react(),
    {
      name: "pilot-feedback-provider-boundary",
      enforce: "pre",
      resolveId(source) {
        if (source.startsWith("firebase/")) return stubId;
        if (source.endsWith("/services/firebase/client.js")) return path.join(here, "providerClient.js");
        if (source.endsWith("checklistCapabilityService.js")) return path.join(here, "syntheticChecklistApi.js");
        return null;
      },
      load(id) {
        if (id !== stubId) return null;
        const names = firebaseImportNames();
        return [
          "const calls = (globalThis.__providerCalls ||= []);",
          "const forbidden = (name) => (...args) => { calls.push(name); throw new Error(`Provider API unavailable in synthetic harness: ${name}`); };",
          // httpsCallable is bound at module load; only invoking the callable is a provider call.
          ...names.map((name) => name === "httpsCallable"
            ? "export const httpsCallable = (_functions, callable) => forbidden(`httpsCallable:${callable}`);"
            : `export const ${name} = forbidden(${JSON.stringify(name)});`),
        ].join("\n");
      },
    },
  ],
  server: { host: "127.0.0.1", port: 4291, strictPort: true, fs: { allow: [root] } },
});
