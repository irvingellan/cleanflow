// Manager Notification Center — presentation model (prototype only).
// Production today sends some pushes but keeps NO notification history; the
// inbox below is the proposed contract for Codex (see contracts/notificationCenter.ts).

/** Category catalogue. `status` says whether Production already sends this push. */
export const CATEGORIES = [
  { id: "cleanerInterested", group: "offers", icon: "userCheck", tone: "attention", status: "implemented" },
  { id: "assignmentConfirmed", group: "offers", icon: "checkCircle", tone: "success", status: "implemented" },
  { id: "checklistReceived", group: "checklists", icon: "clipCheck", tone: "attention", status: "implemented" },
  { id: "offerDeclined", group: "offers", icon: "userX", tone: "neutral", status: "proposed" },
  { id: "issueReported", group: "issues", icon: "alert", tone: "risk", status: "proposed" },
  { id: "missingCleaner", group: "planning", icon: "users", tone: "risk", status: "proposed" },
  { id: "todayReminder", group: "planning", icon: "list", tone: "neutral", status: "proposed" },
  { id: "tomorrowPlanning", group: "planning", icon: "calendar", tone: "neutral", status: "proposed" },
  { id: "admin", group: "system", icon: "lock", tone: "neutral", status: "proposed" },
  { id: "deviceTest", group: "system", icon: "bell", tone: "neutral", status: "proposed" },
  // Cleaner-audience events (Cleaner Hub, proposal)
  { id: "cleanerAssigned", group: "schedule", icon: "calendar", tone: "success", status: "proposed", audience: "cleaner" },
  { id: "cleanerOffer", group: "schedule", icon: "send", tone: "attention", status: "proposed", audience: "cleaner" },
  { id: "cleanerReminder", group: "schedule", icon: "clock", tone: "neutral", status: "proposed", audience: "cleaner" },
  { id: "cleanerMoved", group: "schedule", icon: "calendar", tone: "warning", status: "proposed", audience: "cleaner" },
  { id: "cleanerRemoved", group: "schedule", icon: "userX", tone: "risk", status: "proposed", audience: "cleaner" },
];
export const GROUPS = ["offers", "checklists", "issues", "planning", "system"];
export const CLEANER_GROUPS = ["schedule"];
export const FILTERS = ["all", "unread", ...GROUPS];
export const categoryOf = n => CATEGORIES.find(c => c.id === n.category) || CATEGORIES.find(c => c.id === "deviceTest");
export const managerCategories = () => CATEGORIES.filter(c => c.audience !== "cleaner");

/**
 * Delivery steps, in order. Each step is "done", "failed", "unknown" or "notTracked".
 * Nothing is shown as displayed/opened unless it was really confirmed/tracked.
 */
export const STEPS = ["created", "targeted", "accepted", "displayed", "opened"];
export function deliverySteps(n) {
  const d = n.delivery || {};
  const targets = d.targets ?? 0;
  return [
    { key: "created", state: "done", at: n.at },
    { key: "targeted", state: targets > 0 ? "done" : "failed", count: targets },
    { key: "accepted", state: d.accepted === true ? "done" : d.accepted === false ? "failed" : "unknown" },
    { key: "displayed", state: d.displayed === "confirmed" ? "done" : d.displayed === "generic" ? "failed" : "unknown" },
    { key: "opened", state: d.openedAt ? "done" : d.openTracked === false ? "notTracked" : "unknown", at: d.openedAt || null },
  ];
}

export const byNewest = (a, b) => (a.at.date === b.at.date ? b.at.min - a.at.min : a.at.date < b.at.date ? 1 : -1);

export function filterNotifications(list, { filter = "all", query = "", text = n => "" } = {}) {
  const q = query.trim().toLowerCase();
  return list
    .filter(n => filter === "all" || (filter === "unread" ? !n.read : categoryOf(n).group === filter))
    .filter(n => !q || text(n).toLowerCase().includes(q))
    .slice().sort(byNewest);
}

/** Templates used by "Simulate push" in the demo. */
export const PUSH_SAMPLES = [
  { category: "cleanerInterested", jobId: "j17", titleKey: "n.offerInterest", params: { name: "Lúcia" } },
  { category: "checklistReceived", jobId: "j07", titleKey: "n.checklist", params: { name: "Sofia" } },
  { category: "assignmentConfirmed", jobId: "j11", titleKey: "n.assignConfirmed", params: { name: "Lúcia" } },
];

export const DEFAULT_PREFS = Object.fromEntries(CATEGORIES.filter(c => c.audience !== "cleaner").map(c => [c.id, c.id !== "tomorrowPlanning"]));
