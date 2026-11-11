import { defineConfig } from "@playwright/test";
import managerConfig from "./playwright.config.js";

export default defineConfig({
  ...managerConfig,
  testMatch: "startup-recovery.spec.js",
  globalSetup: process.env.CLEANFLOW_P0_STRESS === "1" ? managerConfig.globalSetup : "./e2e/startupGlobalSetup.js",
  workers: 1,
  projects: [
    { name: "webkit-mac-1280", use: { browserName: "webkit", viewport: { width: 1280, height: 720 } } },
    { name: "webkit-mobile", use: { browserName: "webkit", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
