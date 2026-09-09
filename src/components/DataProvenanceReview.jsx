import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/translations.js";
import { normalizeDataProvenance } from "../lib/dataProvenance.js";
import { DataProvenanceBadge } from "./DataProvenanceBadge.jsx";

const reviewOptions = ["REAL", "DEMO", "UNKNOWN"];

/**
 * Lets a manager classify one record without inferring or changing any related records.
 */
export function DataProvenanceReview({ record, onSave }) {
  const { translate } = useTranslation();
  const normalizedProvenance = normalizeDataProvenance(record);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProvenance, setSelectedProvenance] = useState(normalizedProvenance);
  const [displayedProvenance, setDisplayedProvenance] = useState(normalizedProvenance);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    setIsOpen(false);
    setSelectedProvenance(normalizedProvenance);
    setDisplayedProvenance(normalizedProvenance);
    setIsSaving(false);
    setSaveError(false);
    setHasSaved(false);
  }, [record.id]);

  async function save() {
    setIsSaving(true);
    setSaveError(false);
    setHasSaved(false);

    try {
      await onSave(selectedProvenance);
      setDisplayedProvenance(selectedProvenance);
      setHasSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="data-provenance-review" aria-label={translate("provenance.reviewTitle")}>
      <div className="data-provenance-review__summary">
        <DataProvenanceBadge record={{ ...record, dataProvenance: displayedProvenance }} />
        <button
          className="button button--text"
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            setSaveError(false);
            setHasSaved(false);
          }}
        >
          {translate("provenance.review")}
        </button>
      </div>

      {isOpen && (
        <div className="data-provenance-review__panel">
          <div>
            <h3>{translate("provenance.reviewTitle")}</h3>
            <p>{translate("provenance.reviewQuestion")}</p>
          </div>

          <div className="data-provenance-review__options">
            {reviewOptions.map((provenance) => (
              <button
                key={provenance}
                className={
                  selectedProvenance === provenance
                    ? "data-provenance-review__option data-provenance-review__option--selected"
                    : "data-provenance-review__option"
                }
                type="button"
                aria-pressed={selectedProvenance === provenance}
                disabled={isSaving}
                onClick={() => setSelectedProvenance(provenance)}
              >
                <strong>{translate(`provenance.${provenance.toLowerCase()}`)}</strong>
                <span>{translate(`provenance.${provenance.toLowerCase()}Description`)}</span>
              </button>
            ))}
          </div>

          <div className="data-provenance-review__actions">
            <button
              className="button"
              type="button"
              disabled={isSaving}
              onClick={() => setIsOpen(false)}
            >
              {translate("common.cancel")}
            </button>
            <button className="button button--primary" type="button" disabled={isSaving} onClick={save}>
              {isSaving ? translate("provenance.saving") : translate("provenance.save")}
            </button>
          </div>

          {hasSaved && <p className="form-success" role="status">{translate("provenance.saved")}</p>}
          {saveError && <p className="form-error" role="alert">{translate("provenance.saveError")}</p>}
        </div>
      )}
    </section>
  );
}
