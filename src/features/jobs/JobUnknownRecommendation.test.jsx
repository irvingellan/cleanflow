import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobDetailV2Pilot } from "./JobDetailV2Pilot.jsx";
import { getServiceLifecycleFixture } from "../../../scripts/serviceLifecycleFixtures.mjs";
vi.mock("../cleaners/cleanerService.js", () => ({ getCleanerContactsById: vi.fn().mockResolvedValue({}) }));
it("unknown state recommends saved information, never forbidden completion", () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  window.history.replaceState(null, "", "/?jobDetail=v2");
  const fixture = getServiceLifecycleFixture("unassigned");
  fixture.job.operationalStatus = "UNRECOGNIZED";
  const { container } = render(<TranslationProvider><JobDetailV2Pilot {...fixture} isLoadingChecklistRun={false} hasChecklistRunError={false} /></TranslationProvider>);
  expect(container.querySelector(".job-intents__next")).toHaveTextContent("View saved service");
  expect(container.querySelector(".job-intents__next")).not.toHaveTextContent("Complete service");
  expect(screen.queryByRole("dialog")).toBeNull();
});
