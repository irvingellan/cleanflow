export function createJobListFilters(overrides = {}) {
  return {
    status: "all",
    datePreset: "any",
    cleanerId: "",
    propertyId: "",
    search: "",
    ...overrides,
  };
}

export function dashboardJobListFilters(filter) {
  if (filter === "today") return createJobListFilters({ datePreset: "today" });
  if (filter === "needs-assignment") {
    return createJobListFilters({ status: "needs-assignment" });
  }
  if (filter === "in-progress") {
    return createJobListFilters({ status: "in-progress" });
  }
  if (filter === "completed-today") {
    return createJobListFilters({ status: "completed", datePreset: "today" });
  }

  return createJobListFilters();
}
