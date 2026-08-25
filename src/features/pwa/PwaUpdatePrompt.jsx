import { useEffect, useState } from "react";
import { appBuildId } from "../../buildInfo.js";
import { useTranslation } from "../../i18n/translations.js";

const versionMarkerPath = "/version.json";

export function PwaUpdatePrompt() {
  const { translate } = useTranslation();
  const [availableBuild, setAvailableBuild] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
      return undefined;
    }

    let isCurrent = true;

    async function checkForUpdate() {
      try {
        const response = await fetch(versionMarkerPath, { cache: "no-store" });
        const buildInfo = await response.json();

        if (isCurrent && typeof buildInfo.buildId === "string" && buildInfo.buildId !== appBuildId) {
          setAvailableBuild(buildInfo.buildId);
        }
      } catch {
        // Version checks are advisory. Normal manager workflows remain available offline or on failure.
      }
    }

    function handleWorkerMessage(event) {
      if (event.data?.type !== "CLEANFLOW_UPDATE_AVAILABLE") {
        return;
      }

      event.source?.postMessage({ type: "CLEANFLOW_UPDATE_CLIENT_READY" });
      checkForUpdate();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    }

    navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "CLEANFLOW_UPDATE_CLIENT_READY" });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    checkForUpdate();

    return () => {
      isCurrent = false;
      navigator.serviceWorker.removeEventListener("message", handleWorkerMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function updateNow() {
    if (!availableBuild) {
      return;
    }

    setIsUpdating(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage({ type: "CLEANFLOW_SKIP_WAITING" });
    } finally {
      // An acknowledged client is never automatically reloaded by the worker. This single,
      // explicit reload applies the newly activated worker and its fresh app document.
      window.location.reload();
    }
  }

  if (!availableBuild || isUpdating) {
    return null;
  }

  return (
    <aside className="pwa-update-prompt" role="status">
      <span>{translate("pwa.updateAvailable")}</span>
      <button className="button button--primary" type="button" onClick={updateNow}>
        {translate("pwa.updateNow")}
      </button>
    </aside>
  );
}
