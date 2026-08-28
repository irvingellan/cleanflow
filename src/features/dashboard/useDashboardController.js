import { useEffect, useState } from "react";
import { getOperationalDashboard } from "./dashboardService.js";

export function useDashboardController({ view }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function refresh() {
    setIsLoading(true);
    setHasError(false);

    try {
      const loadedDashboard = await getOperationalDashboard();
      setDashboardData(loadedDashboard);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (view === "dashboard") {
      refresh();
    }
  }, [view]);

  return { dashboardData, isLoading, hasError, refresh };
}
