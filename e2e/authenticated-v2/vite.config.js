import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const here = path.dirname(fileURLToPath(import.meta.url));
const rcExperience = process.env.CLEANFLOW_RC_QA_EXPERIENCE;
if (rcExperience && !["current", "v2"].includes(rcExperience)) throw Error("Invalid synthetic RC QA experience");
export default defineConfig({
  envDir: false, publicDir: false, cacheDir: "node_modules/.vite-authenticated-v2", plugins: [react(), {
    name: "real-app-synthetic-boundary", enforce: "pre",
    resolveId(source) {
      if (source.endsWith("/services/firebase/client.js")) return path.resolve(here, "../lifecycle/provider-client.js");
      if (source.startsWith("firebase/")) return path.join(here, "provider-api.js");
      return null;
    },
  }], define: {
    __CLEANFLOW_BUILD_ID__: JSON.stringify("synthetic-authenticated-app"),
    __CLEANFLOW_MANAGER_EXPERIENCE__: JSON.stringify(rcExperience || "current"),
    "import.meta.env.MODE": JSON.stringify(rcExperience ? "production" : "sandbox"),
    "import.meta.env.VITE_CLEANFLOW_ENV": JSON.stringify(rcExperience ? "production" : "sandbox"),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(rcExperience ? "clean-flow-prototipo" : "clean-flow-sandbox-irving"),
    "import.meta.env.VITE_CLEANFLOW_SANDBOX_PROJECT_ID": JSON.stringify("clean-flow-sandbox-irving"),
    "import.meta.env.VITE_CLEANFLOW_ENV_NAVIGATION_EMAILS": JSON.stringify("manager@cleanflow.e2e"),
    "import.meta.env.VITE_ONESIGNAL_APP_ID": '""',
    "import.meta.env.VITE_FIREBASE_VAPID_KEY": '""',
  },
});
