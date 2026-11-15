// Pure helpers for the Dev Center "System status" panel.
const repositoryUrl = "https://github.com/irvingellan/cleanflow";

export const measuredFunctions = ["getChecklistRun", "getChecklistCapability", "getJobPhotoCounts", "getChecklistEvidence"];

/** Reads the feature flags a build encodes in its deploymentId suffix. */
export function describeBuild(version) {
  const buildId = typeof version?.buildId === "string" ? version.buildId : "";
  const deploymentId = typeof version?.deploymentId === "string" ? version.deploymentId : buildId;
  const suffix = deploymentId.startsWith(buildId) ? deploymentId.slice(buildId.length) : "";
  const isCommit = /^[0-9a-f]{40}$/.test(buildId);
  return {
    version: version?.version || "",
    environment: version?.environment || "unknown",
    shortId: isCommit ? buildId.slice(0, 7) : buildId,
    commitUrl: isCommit ? `${repositoryUrl}/commit/${buildId}` : null,
    flags: {
      automaticOffers: suffix.includes("-automatic-offers"),
      cleanerPush: suffix.includes("-cleaner-push"),
      inbox: !suffix.includes("-inbox-off"),
    },
  };
}

/** Groups the round-trip latency measured by the browser. */
export function classifyLatency(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "failed";
  return milliseconds >= 1500 ? "cold" : "warm";
}

export function consoleLinks(projectId) {
  const project = encodeURIComponent(projectId || "");
  return {
    functions: `https://console.firebase.google.com/project/${project}/functions/list`,
    firestore: `https://console.firebase.google.com/project/${project}/firestore`,
    hosting: `https://console.firebase.google.com/project/${project}/hosting/sites`,
    pulls: `${repositoryUrl}/pulls?q=is%3Apr`,
    actions: `${repositoryUrl}/actions`,
  };
}
