import { appBuildId } from "../buildInfo.js";
import { cleanflowEnvironment } from "../environment.js";

function shortBuildId(buildId) {
  return String(buildId || "unknown").slice(0, 12);
}

export function EnvironmentBanner({
  environment = cleanflowEnvironment,
  buildId = appBuildId,
}) {
  if (environment !== "sandbox") return null;

  return (
    <aside className="environment-banner" role="status" aria-label="Sandbox environment">
      <strong>SANDBOX</strong>
      <span>TEST DATA</span>
      <span>Build {shortBuildId(buildId)}</span>
    </aside>
  );
}
