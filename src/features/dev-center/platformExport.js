const countColumns = [
  ["managers", "people", "activeManagers"], ["cleaners", "people", "activeCleaners"],
  ["archivedCleaners", "people", "archivedCleaners"], ["activeClients", "clients", "active"],
  ["archivedClients", "clients", "archived"], ["activeProperties", "properties", "active"],
  ["archivedProperties", "properties", "archived"], ["totalJobs", "jobs", "total"],
  ["created30d", "jobs", "created30d"], ["scheduled7d", "jobs", "scheduled7d"], ["completed30d", "jobs", "completed30d"],
  ["openIssues", "attention", "openIssues"], ["waitingOffers", "attention", "waitingOffers"],
];

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001F]*[=+@＝＋＠－-]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function overviewCsv(organizations, translate) {
  const rows = [
    ["company", ...countColumns.map(([label]) => label)].map(label => translate("platform." + label)),
    ...organizations.map(org => [
      typeof org.displayName === "string" ? org.displayName : "",
      ...countColumns.map(([, group, metric]) => {
        const value = org[group]?.[metric];
        return Number.isSafeInteger(value) && value >= 0 ? value : "";
      }),
    ]),
  ];
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadOverview(organizations, translate) {
  const url = URL.createObjectURL(new Blob([overviewCsv(organizations, translate)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "cleanflow-platform.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
