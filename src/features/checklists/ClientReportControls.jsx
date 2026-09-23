import { useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  createClientReport,
  getClientReportCapability,
  revokeClientReport,
} from "./clientReportService.js";

export function ClientReportControls({
  jobId,
  getCapability = getClientReportCapability,
  issueReport = createClientReport,
  revokeReport = revokeClientReport,
}) {
  const { translate } = useTranslation();
  const [capability, setCapability] = useState({ state: "LOADING" });
  const [reportUrl, setReportUrl] = useState("");
  const [action, setAction] = useState(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    setCapability({ state: "LOADING" });
    setReportUrl("");
    setHasLoadError(false);
    getCapability(jobId).then((result) => {
      if (current) setCapability(result || { state: "NONE" });
    }).catch(() => {
      if (current) setHasLoadError(true);
    });
    return () => { current = false; };
  }, [getCapability, jobId]);

  async function createOrReplace(replaceExisting) {
    setAction("create");
    setHasActionError(false);
    try {
      const result = await issueReport(jobId, { replaceExisting });
      setCapability(result.capability || { state: "NONE" });
      setReportUrl(result.url || "");
      setCopied(false);
    } catch {
      setHasActionError(true);
    } finally {
      setAction(null);
    }
  }

  async function revoke() {
    setAction("revoke");
    setHasActionError(false);
    try {
      setCapability(await revokeReport(jobId));
      setReportUrl("");
      setCopied(false);
    } catch {
      setHasActionError(true);
    } finally {
      setAction(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setHasActionError(true);
    }
  }

  const active = capability.state === "ACTIVE";
  const canCreate = !active;
  const createLabel = active ? "clientReport.replaceLink" : "clientReport.create";

  return (
    <section className="checklist-run__section client-report-controls" aria-labelledby="client-report-controls-title">
      <h3 id="client-report-controls-title">{translate("clientReport.managerTitle")}</h3>
      <p>{translate("clientReport.managerDescription")}</p>
      {hasLoadError && <StateCard message={translate("clientReport.loadError")} status="alert" isError />}
      {!hasLoadError && capability.state !== "LOADING" && (
        <p role="status">{translate("clientReport.state" + capability.state)}</p>
      )}
      {capability.state === "LOADING" && <StateCard message={translate("clientReport.loading")} status="status" />}

      {reportUrl && (
        <div className="button-row">
          <button className="button button--primary" type="button" onClick={copyLink}>
            {translate(copied ? "clientReport.linkCopied" : "clientReport.copyLink")}
          </button>
          <a className="button button--secondary" href={reportUrl} target="_blank" rel="noopener noreferrer">
            {translate("clientReport.openReport")}
          </a>
        </div>
      )}

      {!hasLoadError && capability.state !== "LOADING" && (
        <div className="button-row">
          <button
            className={canCreate ? "button button--primary" : "button"}
            type="button"
            disabled={Boolean(action)}
            onClick={() => createOrReplace(active)}
          >
            {action === "create" ? translate("clientReport.creating") : translate(createLabel)}
          </button>
          {active && (
            <button className="button button--secondary" type="button" disabled={Boolean(action)} onClick={revoke}>
              {action === "revoke" ? translate("clientReport.revoking") : translate("clientReport.revokeLink")}
            </button>
          )}
        </div>
      )}
      {hasActionError && <p className="form-error" role="alert">{translate("clientReport.actionError")}</p>}
    </section>
  );
}
