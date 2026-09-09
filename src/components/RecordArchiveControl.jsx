import { useState } from "react";
import { isArchived } from "../lib/archiveState.js";
import { useTranslation } from "../i18n/translations.js";

export function RecordArchiveControl({ record, canRestore = false, onArchive, onRestore }) {
  const { translate } = useTranslation();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const archived = isArchived(record);

  if (archived) {
    if (!canRestore) return null;
    return (
      <div className="record-archive-control">
        <span className="record-archive-badge">{translate("archive.excluded")}</span>
        <button className="button" type="button" disabled={isSaving} onClick={async () => {
          setIsSaving(true); setHasError(false);
          try { await onRestore(); } catch { setHasError(true); } finally { setIsSaving(false); }
        }}>
          {isSaving ? translate("archive.restoring") : translate("archive.restore")}
        </button>
        {hasError && <p className="form-error" role="alert">{translate("archive.error")}</p>}
      </div>
    );
  }

  if (!isConfirming) {
    return <button className="button button--danger" type="button" onClick={() => setIsConfirming(true)}>{translate("archive.delete")}</button>;
  }

  return (
    <div className="record-archive-control" role="group" aria-label={translate("archive.confirmTitle")}>
      <strong>{translate("archive.confirmTitle")}</strong>
      <p>{translate("archive.confirmMessage")}</p>
      <div className="button-row">
        <button className="button" type="button" disabled={isSaving} onClick={() => setIsConfirming(false)}>{translate("common.cancel")}</button>
        <button className="button button--danger" type="button" disabled={isSaving} onClick={async () => {
          setIsSaving(true); setHasError(false);
          try { await onArchive(); } catch { setHasError(true); } finally { setIsSaving(false); }
        }}>{isSaving ? translate("archive.deleting") : translate("archive.delete")}</button>
      </div>
      {hasError && <p className="form-error" role="alert">{translate("archive.error")}</p>}
    </div>
  );
}
