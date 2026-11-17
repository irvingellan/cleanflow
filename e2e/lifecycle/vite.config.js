import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const providerApiPath = path.join(fixtureDirectory, "provider-api.js");
const sourceDirectory = path.resolve(fixtureDirectory, "../../src");
const providerClientPath = path.join(sourceDirectory, "services/firebase/client.js");

// Every name the app imports from the provider SDK. The list is read from the
// source so that a new import in any service cannot stop this page from loading.
function providerImportNames(directory, names = new Set()) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) providerImportNames(file, names);
    else if (/\.jsx?$/.test(entry.name)) {
      const imports = fs.readFileSync(file, "utf8").matchAll(/import\s*\{([^}]*)\}\s*from\s*"firebase\/[^"]+"/g);
      for (const [, list] of imports) {
        for (const item of list.split(",")) {
          const name = item.trim().split(/\s+as\s+/)[0];
          if (name) names.add(name);
        }
      }
    }
  }
  return names;
}

export default defineConfig({
  // This presentation harness has no credentials, SDK configuration or backend.
  envDir: false,
  cacheDir: "node_modules/.vite-lifecycle",
  optimizeDeps: { entries: ["e2e/lifecycle/job-detail.html", "e2e/lifecycle/compact.html"] },
  define: { __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-lifecycle-harness") },
  plugins: [
    react(),
    {
      name: "local-lifecycle-provider-boundary",
      enforce: "pre",
      resolveId(source, importer) {
        // Compare the resolved file: a module next to the client imports it as "./client.js".
        const file = source.startsWith(".") && importer
          ? path.resolve(path.dirname(importer.split("?")[0]), source) : source;
        if (file === providerClientPath || source.endsWith("/services/firebase/client.js")) {
          return path.join(fixtureDirectory, "provider-client.js");
        }
        if (source.startsWith("firebase/")) {
          return providerApiPath;
        }
        return null;
      },
      // provider-api.js declares the special cases; every other imported name
      // becomes a call that is recorded and refused.
      transform(code, id) {
        if (id !== providerApiPath) return null;
        const declared = new Set([...code.matchAll(/export (?:const|function) (\w+)/g)].map(([, name]) => name));
        const generated = [...providerImportNames(sourceDirectory)].filter((name) => !declared.has(name)).sort()
          .map((name) => `export const ${name} = forbiddenCall(${JSON.stringify(name)});`);
        return { code: `${code}\n${generated.join("\n")}\n`, map: null };
      },
    },
  ],
});
