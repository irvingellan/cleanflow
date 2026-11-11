import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, normalizePath } from "vite";
import baseConfig from "../../vite.config.js";

const managerClient = normalizePath(fileURLToPath(new URL("../../src/services/firebase/client.js", import.meta.url)));
const managerFirestore = "\0definitive-ui-manager-firestore";

// Playwright WebKit on loopback can complete Auth and open WebChannel but stall
// before Manager dashboard queries settle. Keep real Firebase operations and
// change only the Manager SDK transport in the isolated browser test build.
export default defineConfig((environment) => {
  if (environment.command !== "build" || environment.mode !== "emulator") {
    throw new Error("Definitive UI WebKit transport is for local emulator builds only.");
  }

  return mergeConfig(baseConfig(environment), {
    plugins: [{
      name: "definitive-ui-webkit-manager-transport",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "firebase/firestore" && importer === managerClient) return managerFirestore;
      },
      load(id) {
        if (id !== managerFirestore) return;
        return `
          import { initializeFirestore } from "firebase/firestore";
          export { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";
          export const getFirestore = (app) => initializeFirestore(app, { experimentalForceLongPolling: true });
        `;
      },
    }],
  });
});
