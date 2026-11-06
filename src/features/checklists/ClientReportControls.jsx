import { useEffect, useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { getClientContact } from "../clients/clientService.js";
import {
  createClientReport,
  getClientReportCapability,
  revokeClientReport,
  updateClientReport,
} from "./clientReportService.js";
import {
  buildClientReportMessage,
  buildClientReportSubject,
  clientReportEmailUrl,
  clientReportMessageLanguages,
  clientReportWhatsappUrl,
} from "./clientReportShare.js";

const noteMaximum = 1000;
const emptyPresentation = { managerNote: "", includeCleanerNotes: true };

function formatSentAt(value, language) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * The manager prepares the client report (optional note, cleaner notes on or
 * off), sends it from her own WhatsApp or email and records that she sent it.
 * Opening WhatsApp or email does not count as sent.
 */
export function ClientReportControls({
  jobId,
  job = {},
  getCapability = getClientReportCapability,
  issueReport = createClientReport,
  revokeReport = revokeClientReport,
  updateReport = updateClientReport,
  getContact = getClientContact,
}) {
  const { language, translate } = useTranslation();
  const [capability, setCapability] = useState({ state: "LOADING" });
  const [reportUrl, setReportUrl] = useState("");
  const [action, setAction] = useState(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isReplaceConfirmationVisible, setIsReplaceConfirmationVisible] = useState(false);
  const [form, setForm] = useState(emptyPresentation);
  const [isEditing, setIsEditing] = useState(false);
  const [contact, setContact] = useState(null);
  const [messageLanguage, setMessageLanguage] = useState("en");
  const [openedChannel, setOpenedChannel] = useState(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let current = true;
    setCapability({ state: "LOADING" });
    setReportUrl("");
    setHasLoadError(false);
    setIsReplaceConfirmationVisible(false);
    setOpenedChannel(null);
    getCapability(jobId).then((result) => {
      if (!current) return;
      const next = result || { state: "NONE" };
      setCapability(next);
      setForm({ ...emptyPresentation, ...(next.presentation || {}) });
    }).catch(() => {
      if (current) setHasLoadError(true);
    });
    return () => { current = false; };
  }, [getCapability, jobId]);

  useEffect(() => {
    let current = true;
    setContact(null);
    if (job.clientId) {
      Promise.resolve(getContact(job.clientId)).then((result) => {
        if (current) setContact(result || null);
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [getContact, job.clientId]);

  const active = capability.state === "ACTIVE";
  const presentation = {
    managerNote: form.managerNote.trim().slice(0, noteMaximum),
    includeCleanerNotes: form.includeCleanerNotes,
  };
  const saved = { ...emptyPresentation, ...(capability.presentation || {}) };
  const hasUnsavedChanges = presentation.managerNote !== saved.managerNote
    || presentation.includeCleanerNotes !== saved.includeCleanerNotes;

  async function run(kind, task) {
    setAction(kind);
    setHasActionError(false);
    setSavedNotice(false);
    try {
      await task();
    } catch {
      setHasActionError(true);
    } finally {
      setAction(null);
    }
  }

  const createOrReplace = (replaceExisting) => run("create", async () => {
    const result = await issueReport(jobId, { replaceExisting, presentation });
    setCapability(result.capability || { state: "NONE" });
    setReportUrl(result.url || "");
    setCopied(false);
    setIsReplaceConfirmationVisible(false);
    setIsEditing(false);
    setOpenedChannel(null);
  });

  const savePresentation = () => run("save", async () => {
    setCapability(await updateReport(jobId, { presentation }));
    setIsEditing(false);
    setSavedNotice(true);
  });

  const markSent = (channel) => run("sent", async () => {
    setCapability(await updateReport(jobId, { markSent: { channel } }));
    setOpenedChannel(null);
  });

  const revoke = () => run("revoke", async () => {
    setCapability(await revokeReport(jobId));
    setReportUrl("");
    setCopied(false);
    setIsReplaceConfirmationVisible(false);
    setOpenedChannel(null);
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setHasActionError(true);
    }
  }

  const message = reportUrl ? buildClientReportMessage({
    language: messageLanguage,
    clientName: contact?.name || job.clientName,
    propertyName: job.propertyName,
    serviceDate: job.scheduledDate ? formatDate(job.scheduledDate, translate, messageLanguage) : "",
    url: reportUrl,
  }) : "";
  const subject = buildClientReportSubject({ language: messageLanguage, propertyName: job.propertyName });
  const clientLabel = contact?.name || job.clientName || "";
  const sentAt = capability.lastSent ? formatSentAt(capability.lastSent.at, language) : "";

  const presentationForm = (
    <div className="client-report-controls__form">
      <label className="client-report-controls__field">
        <span>{translate("clientReport.noteLabel")}</span>
        <textarea
          rows={3}
          maxLength={noteMaximum}
          value={form.managerNote}
          placeholder={translate("clientReport.notePlaceholder")}
          onChange={(event) => setForm((current) => ({ ...current, managerNote: event.target.value }))}
        />
      </label>
      <label className="client-report-controls__toggle">
        <input
          type="checkbox"
          checked={form.includeCleanerNotes}
          onChange={(event) => setForm((current) => ({ ...current, includeCleanerNotes: event.target.checked }))}
        />
        <span>
          <strong>{translate("clientReport.includeCleanerNotes")}</strong>
          <span>{translate("clientReport.includeCleanerNotesHelp")}</span>
        </span>
      </label>
      <p className="cf-block__subtitle">{translate("clientReport.photosHint")}</p>
    </div>
  );

  return (
    <section className="checklist-run__section client-report-controls" aria-labelledby="client-report-controls-title">
      <h3 id="client-report-controls-title">{translate("clientReport.managerTitle")}</h3>
      <p>{translate("clientReport.managerDescription")}</p>
      {hasLoadError && <StateCard message={translate("clientReport.loadError")} status="alert" isError />}
      {capability.state === "LOADING" && <StateCard message={translate("clientReport.loading")} status="status" />}

      {!hasLoadError && capability.state !== "LOADING" && (
        <p role="status" className="client-report-controls__state">
          {translate("clientReport.state" + capability.state)}
          {active && sentAt && <> · {translate("clientReport.sentVia" + capability.lastSent.channel, { date: sentAt })}</>}
          {active && !capability.lastSent && <> · {translate("clientReport.notSentYet")}</>}
        </p>
      )}

      {!hasLoadError && capability.state !== "LOADING" && !active && (
        <>
          {presentationForm}
          <div className="button-row">
            <button className="button button--primary" type="button" disabled={Boolean(action)} onClick={() => createOrReplace(false)}>
              {action === "create" ? translate("clientReport.creating") : translate("clientReport.create")}
            </button>
          </div>
        </>
      )}

      {active && reportUrl && (
        <div className="client-report-controls__send" data-testid="client-report-send">
          <p className="client-report-controls__send-title">
            {clientLabel ? translate("clientReport.sendTo", { name: clientLabel }) : translate("clientReport.sendTitle")}
          </p>
          <label className="client-report-controls__field client-report-controls__field--inline">
            <span>{translate("clientReport.messageLanguage")}</span>
            <select value={messageLanguage} onChange={(event) => setMessageLanguage(event.target.value)}>
              {clientReportMessageLanguages.map((code) => (
                <option key={code} value={code}>{translate("clientReport.language." + code)}</option>
              ))}
            </select>
          </label>
          <p className="client-report-controls__message">{message}</p>
          <div className="button-row">
            <a
              className="button button--primary"
              href={clientReportWhatsappUrl({ phone: contact?.phone, message })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpenedChannel("WHATSAPP")}
            >
              {translate("clientReport.sendWhatsapp")}
            </a>
            <a
              className="button button--secondary"
              href={clientReportEmailUrl({ email: contact?.email, subject, message })}
              onClick={() => setOpenedChannel("EMAIL")}
            >
              {translate("clientReport.sendEmail")}
            </a>
            <button className="button" type="button" onClick={() => { copyLink(); setOpenedChannel("OTHER"); }}>
              {translate(copied ? "clientReport.linkCopied" : "clientReport.copyLink")}
            </button>
            <a className="button button--text" href={reportUrl} target="_blank" rel="noopener noreferrer">
              {translate("clientReport.openReport")}
            </a>
          </div>
          {!contact?.phone && <p className="cf-block__subtitle">{translate("clientReport.noPhone")}</p>}
          {openedChannel && (
            <div className="completion-confirmation">
              <p>{translate("clientReport.confirmSentQuestion")}</p>
              <div className="button-row">
                <button className="button button--primary" type="button" disabled={Boolean(action)} onClick={() => markSent(openedChannel)}>
                  {action === "sent" ? translate("clientReport.savingSent") : translate("clientReport.markSent")}
                </button>
                <button className="button" type="button" onClick={() => setOpenedChannel(null)}>
                  {translate("clientReport.notYet")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {active && !reportUrl && <p>{translate("clientReport.activeLinkHint")}</p>}

      {active && (
        <div className="client-report-controls__manage">
          {isEditing ? (
            <>
              {presentationForm}
              <div className="button-row">
                <button className="button button--primary" type="button" disabled={Boolean(action) || !hasUnsavedChanges} onClick={savePresentation}>
                  {action === "save" ? translate("clientReport.saving") : translate("clientReport.saveChanges")}
                </button>
                <button className="button" type="button" disabled={Boolean(action)} onClick={() => { setForm(saved); setIsEditing(false); }}>
                  {translate("common.cancel")}
                </button>
              </div>
              <p className="cf-block__subtitle">{translate("clientReport.sameLinkHint")}</p>
            </>
          ) : (
            <>
              {saved.managerNote && <p className="client-report-controls__saved-note">“{saved.managerNote}”</p>}
              <div className="button-row">
                <button className="button" type="button" disabled={Boolean(action)} onClick={() => setIsEditing(true)}>
                  {translate("clientReport.editMessage")}
                </button>
                <button className="button" type="button" disabled={Boolean(action)} onClick={() => setIsReplaceConfirmationVisible(true)}>
                  {translate("clientReport.replaceLink")}
                </button>
                <button className="button button--secondary" type="button" disabled={Boolean(action)} onClick={revoke}>
                  {action === "revoke" ? translate("clientReport.revoking") : translate("clientReport.revokeLink")}
                </button>
              </div>
            </>
          )}
          {savedNotice && <p role="status" className="property-history-state">{translate("clientReport.changesSaved")}</p>}
        </div>
      )}

      {isReplaceConfirmationVisible && active && (
        <div className="completion-confirmation">
          <p role="alert">{translate("clientReport.replaceWarning")}</p>
          <div className="button-row">
            <button className="button" type="button" disabled={Boolean(action)} onClick={() => setIsReplaceConfirmationVisible(false)}>
              {translate("clientReport.keepLink")}
            </button>
            <button className="button button--primary" type="button" disabled={Boolean(action)} onClick={() => createOrReplace(true)}>
              {action === "create" ? translate("clientReport.creating") : translate("clientReport.confirmReplace")}
            </button>
          </div>
        </div>
      )}
      {hasActionError && <p className="form-error" role="alert">{translate("clientReport.actionError")}</p>}
    </section>
  );
}
