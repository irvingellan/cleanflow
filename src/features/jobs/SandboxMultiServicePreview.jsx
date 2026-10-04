import { useState } from "react";
import { Dashboard } from "../dashboard/Dashboard.jsx";
import { JobsPage, createJobListFilters } from "./JobsPage.jsx";
import { buildCompactLifecycleFixtures } from "../../../scripts/compactLifecycleFixtures.mjs";
import { useTranslation } from "../../i18n/translations.js";

// Imported only by the existing build-gated Sandbox preview. No provider calls.
export function SandboxMultiServicePreview({ surface }) {
  const { translate } = useTranslation();
  const [filters, setFilters] = useState(createJobListFilters);
  const [notice, setNotice] = useState(false);
  const fixture = buildCompactLifecycleFixtures();
  const inspect = () => setNotice(true);
  return <>
    {notice && <p role="status">{translate("lifecycle.previewAction")}</p>}
    {surface === "dashboard" ? <Dashboard dashboardData={fixture.dashboardData} translate={translate}
      onRefresh={inspect} onOpenJob={inspect} onShowJobs={inspect} onShowJobsWithFilter={inspect} />
      : <JobsPage {...fixture} filters={filters} onSelect={inspect} onCreate={inspect}
        onFiltersChange={updates => setFilters(current => ({ ...current, ...updates }))}
        onClearFilters={() => setFilters(createJobListFilters())} />}
  </>;
}
