import { useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { formatDate } from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { maximumGuestNameLength } from "./jobCompatibility.js";
import { createJob } from "./jobService.js";

export function CreateCleaningForm({ property, onBack, onCreated }) {
  const { translate } = useTranslation();
  const propertyName = property.name ?? "";
  const clientName = property.clientName ?? "";
  const displayPropertyName = propertyName || translate("properties.unnamed");
  const displayClientName = clientName || translate("common.notProvided");
  const [formValues, setFormValues] = useState({
    scheduledDate: "",
    clientPrice: property.defaultClientPrice ?? "",
    cleanerPayout: property.defaultCleanerPrice ?? "",
    guestName: "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setHasSaveError(false);

    const clientPrice =
      formValues.clientPrice === "" ? null : Number(formValues.clientPrice);
    const cleanerPayout =
      formValues.cleanerPayout === ""
        ? null
        : Number(formValues.cleanerPayout);
    const notes = formValues.notes.trim();

    try {
      const job = await createJob({
        propertyId: property.id,
        propertyName,
        ...(property.clientId ? { clientId: property.clientId } : {}),
        clientName,
        scheduledDate: formValues.scheduledDate,
        clientPrice,
        cleanerPayout,
        notes,
        guestName: formValues.guestName,
      });

      onCreated(job);
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="create-cleaning-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("jobs.new")}</p>
      <h2 id="create-cleaning-title" className="panel__title">
        {translate("jobs.create")}
      </h2>

      <form className="cleaning-form" onSubmit={handleSubmit}>
        <label>
          {translate("common.property")}
          <input type="text" value={displayPropertyName} readOnly />
        </label>

        <label>
          {translate("common.client")}
          <input type="text" value={displayClientName} readOnly />
        </label>

        <label>
          {translate("common.date")}
          <input
            type="date"
            name="scheduledDate"
            value={formValues.scheduledDate}
            onChange={updateField}
            required
          />
        </label>

        <div className="form-row">
          <label>
            {translate("jobs.clientPrice")}
            <input
              type="number"
              name="clientPrice"
              min="0"
              step="0.01"
              value={formValues.clientPrice}
              onChange={updateField}
            />
          </label>

          <label>
            {translate("jobs.cleanerPayout")}
            <input
              type="number"
              name="cleanerPayout"
              min="0"
              step="0.01"
              value={formValues.cleanerPayout}
              onChange={updateField}
            />
          </label>
        </div>

        <label>
          {translate("jobs.guestName")}
          <input
            type="text"
            name="guestName"
            value={formValues.guestName}
            maxLength={maximumGuestNameLength}
            onChange={updateField}
          />
        </label>

        <label>
          {translate("common.notes")}
          <textarea
            name="notes"
            rows="4"
            value={formValues.notes}
            onChange={updateField}
          />
        </label>

        <label>
          {translate("common.status")}
          <input type="text" value={translate("status.unassigned")} readOnly />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {translate("jobs.createError")}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? translate("jobs.creating") : translate("jobs.create")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function CleaningSuccess({ job, onBack, onViewJob }) {
  const { language, translate } = useTranslation();

  return (
    <section className="panel success-panel" aria-labelledby="success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("jobs.saved")}</p>
      <h2 id="success-title" className="panel__title">
        {translate("jobs.created")}
      </h2>
      <p className="success-panel__detail">
        {job.propertyName || translate("properties.unnamed")}
      </p>
      <p className="success-panel__date">
        {formatDate(job.scheduledDate, translate, language)}
      </p>

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onViewJob}
        >
          {translate("jobs.viewJob")}
        </button>
        <button className="button" type="button" onClick={onBack}>
          {translate("jobs.backToProperties")}
        </button>
      </div>
    </section>
  );
}
