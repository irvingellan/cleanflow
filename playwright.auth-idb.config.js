import { defineConfig } from "@playwright/test";

const expectation = process.env.CLEANFLOW_AUTH_IDB_EXPECT;
if (expectation !== "baseline" && expectation !== "fixed") {
  throw new Error("Set CLEANFLOW_AUTH_IDB_EXPECT to baseline or fixed.");
}

export default defineConfig({
  testDir: "./e2e/auth-idb",
  testMatch: "auth-idb.qualification.js",
  timeout: 45_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4237",
    browserName: "webkit",
    headless: true,
    locale: "en-US",
    viewport: { width: 1280, height: 720 },
  },
});
