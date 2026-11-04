import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import { seedOperation } from "./fixtures.js";

// Local preview only: seeds one synthetic operation, writes its test login to an
// ignored file and keeps the isolated emulators alive. Never a cloud project.
test("keep a seeded local preview running", async () => {
  const minutes = Number(process.env.DEFINITIVE_UI_PREVIEW_MINUTES || 180);
  test.setTimeout((minutes + 5) * 60_000);
  const fixture = await seedOperation();
  mkdirSync("test-results/definitive-ui", { recursive: true });
  writeFileSync("test-results/definitive-ui/preview-login.json", JSON.stringify({
    url: "http://127.0.0.1:15281/",
    cleanerUrl: "http://127.0.0.1:15281/agenda",
    checklistUrl: `http://127.0.0.1:15281/checklist?t=${encodeURIComponent(fixture.checklistToken)}`,
    managerEmail: fixture.manager.email,
    managerPassword: fixture.manager.password,
    cleanerAccessCode: fixture.cleanerCode,
    note: "Synthetic demo-cleanflow emulator data only.",
  }, null, 2));
  console.log("[preview] ready at http://127.0.0.1:15281/ — login in test-results/definitive-ui/preview-login.json");
  await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));
});
