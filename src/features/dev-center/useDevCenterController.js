import { useEffect, useState } from "react";
import {
  clearDevCenterData,
  generateDevCenterScenario,
  getDevCenterAccess,
  previewManagerReminder,
} from "./devCenterService.js";

export function useDevCenterController({ view }) {
  const [access, setAccess] = useState({ isChecking: true, authorized: false });
  const [isWorking, setIsWorking] = useState(false);
  const [pendingPreviewType, setPendingPreviewType] = useState(null);
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

  async function runMutation(work) {
    if (isWorking) return undefined;

    setIsWorking(true);
    setHasError(false);
    setLastResult(null);

    try {
      return await work();
    } catch (error) {
      setHasError(true);
      throw error;
    } finally {
      setIsWorking(false);
    }
  }

  async function generate(scenario) {
    return runMutation(async () => {
      const result = await generateDevCenterScenario(scenario);
      setAccess((current) => ({ ...current, demoJobCount: result.demoJobCount }));
      setLastResult({ type: "generated", ...result });
      return result;
    });
  }

  async function clear() {
    return runMutation(async () => {
      const result = await clearDevCenterData();
      setAccess((current) => ({ ...current, demoJobCount: result.demoJobCount }));
      setLastResult({ type: "cleared", ...result });
      return result;
    });
  }

  async function previewReminder(type) {
    if (pendingPreviewType === type) return undefined;

    setPendingPreviewType(type);
    setHasError(false);
    setLastResult(null);

    try {
      const result = await previewManagerReminder(type);
      setLastResult({ type: "reminder-preview", ...result });
      return result;
    } catch (error) {
      setHasError(true);
      throw error;
    } finally {
      setPendingPreviewType((current) => (current === type ? null : current));
    }
  }

  return { access, isWorking, pendingPreviewType, hasError, lastResult, generate, clear, previewReminder, refreshAccess };
}
