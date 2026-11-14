// The same UI as the app, with a test-only, read-only service projection.
export async function getCleanerSelectionContext() {
  return {
    byCleanerId: {
      experienced: {
        sameDayStarts: ["08:30", "15:00"],
        completedHereCount: 3,
        lastCompletedHereDate: "2026-11-05",
      },
      returning: {
        sameDayStarts: [],
        completedHereCount: 1,
        lastCompletedHereDate: "2026-10-22",
      },
      scheduled: {
        sameDayStarts: [null],
        completedHereCount: 0,
        lastCompletedHereDate: null,
      },
    },
    historyPartial: false,
    schedulePartial: false,
    historyLimit: 40,
  };
}
