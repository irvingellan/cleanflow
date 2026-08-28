import { useEffect, useState } from "react";
import {
  clearDevCenterData,
  generateDevCenterScenario,
  getDevCenterAccess,
} from "./devCenterService.js";

export function useDevCenterController({ view }) {
  const [access, setAccess] = useState({ isChecking: true, authorized: false });
  const [isWorking, setIsWorking] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  async function refreshAccess() {
    setHasError(false);

    try {
      const result = await getDevCenterAccess();
      setAccess({ isChecking: false, ...result });
    } catch {
      setAccess({ isChecking: false, authorized: false });
    }
  }

  useEffect(() => {
    refreshAccess();
  }, []);

  useEffect(() => {
    if (view === "dev-center" && access.authorized) {
      refreshAccess();
    }
  }, [view, access.authorized]);

  async function generate(scenario) {
    setIsWorking(true);
    setHasError(false);
    setLastResult(null);

    try {
      const result = await generateDevCenterScenario(scenario);
      setAccess((current) => ({ ...current, demoJobCount: result.demoJobCount }));
      setLastResult({ type: "generated", ...result });
      return result;
    } catch (error) {
      setHasError(true);
      throw error;
    } finally {
      setIsWorking(false);
    }
  }

  async function clear() {
    setIsWorking(true);
    setHasError(false);
    setLastResult(null);

    try {
      const result = await clearDevCenterData();
      setAccess((current) => ({ ...current, demoJobCount: result.demoJobCount }));
      setLastResult({ type: "cleared", ...result });
      return result;
    } catch (error) {
      setHasError(true);
      throw error;
    } finally {
      setIsWorking(false);
    }
  }

  return { access, isWorking, hasError, lastResult, generate, clear, refreshAccess };
}
