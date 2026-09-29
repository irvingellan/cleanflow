import { useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { maximumGuestNameLength, optionalJobPrice } from "./jobCompatibility.js";
import { createJob } from "./jobService.js";

export function CreateCleaningForm({
  property = null,
  properties = [],
  isLoadingProperties = false,
  hasPropertyError = false,
  onBack,
  onCreated,
}) {
  const { translate } = useTranslation();
  const [selectedProperty, setSelectedProperty] = useState(property);
  const [propertySearch, setPropertySearch] = useState("");
  const [formValues, setFormValues] = useState({
    scheduledDate: "",
    scheduledStart: "11:00",
    clientPrice: property?.defaultClientPrice ?? "",
    cleanerPayout: property?.defaultCleanerPrice ?? "",
    guestName: "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const propertyName = selectedProperty?.name ?? "";
  const clientName = selectedProperty?.clientName ?? "";
  const availableProperties = properties.filter(
    (candidate) => candidate.active !== false && !candidate.archivedAt,
  );
  const normalizedSearch = propertySearch.trim().toLocaleLowerCase();
  const matchingProperties = availableProperties.filter((candidate) =>
    `${candidate.name || ""} ${candidate.address || ""}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const propertyOptions = selectedProperty &&
    !matchingProperties.some((candidate) => candidate.id === selectedProperty.id)
    ? [selectedProperty, ...matchingProperties]
    : matchingProperties;

  function selectProperty(event) {
    const nextProperty = availableProperties.find(
      (candidate) => candidate.id === event.target.value,
    ) || null;
    if (nextProperty?.id !== selectedProperty?.id) {
      setSelectedProperty(nextProperty);
      setFormValues((currentValues) => ({
        ...currentValues,
        clientPrice: nextProperty?.defaultClientPrice ?? "",
        cleanerPayout: nextProperty?.defaultCleanerPrice ?? "",
      }));
    }
    setPropertySearch("");
    setSaveError("");
  }

  function updateField(event) {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!selectedProperty) {
      setSaveError(translate("jobs.propertyRequired"));
      return;
    }

    const clientPrice = optionalJobPrice(formValues.clientPrice);
    const cleanerPayout = optionalJobPrice(formValues.cleanerPayout);
    const notes = formValues.notes.trim();

    if (clientPrice === null || cleanerPayout === null) {
      setSaveError(translate("jobs.priceInvalid"));
      return;
    }

    setIsSaving(true);
    try {
      const job = await createJob({
        propertyId: selectedProperty.id,
        propertyName,
        ...(selectedProperty.clientId ? { clientId: selectedProperty.clientId } : {}),
        clientName,
        scheduledDate: formValues.scheduledDate,
        scheduledStart: formValues.scheduledStart,
        clientPrice,
        cleanerPayout,
        notes,
        guestName: formValues.guestName,
      });

      onCreated(job);
    } catch {
      setSaveError(translate("jobs.createError"));
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

      <form className="cleaning-form" noValidate onSubmit={handleSubmit}>
        <label>
          {translate("properties.search")}
          <input
            type="search"
            value={propertySearch}
            placeholder={translate("properties.searchPlaceholder")}
            onChange={(event) => setPropertySearch(event.target.value)}
            disabled={isSaving || (isLoadingProperties && !selectedProperty)}
          />
        </label>

        <label>
          {translate("common.property")}
          <select
            name="propertyId"
            value={selectedProperty?.id ?? ""}
            onChange={selectProperty}
            disabled={isSaving || (!selectedProperty && (isLoadingProperties || hasPropertyError))}
            required
          >
            <option value="">{translate("jobs.chooseProperty")}</option>
            {propertyOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name || translate("properties.unnamed")}
                {candidate.address ? ` — ${candidate.address}` : ""}
              </option>
            ))}
          </select>
        </label>

        {!selectedProperty && isLoadingProperties && (
          <p role="status">{translate("properties.loading")}</p>
        )}
        {!selectedProperty && hasPropertyError && (
          <p role="alert">{translate("properties.error")}</p>
        )}
        {!selectedProperty && !isLoadingProperties && !hasPropertyError && availableProperties.length === 0 && (
          <p role="status">{translate("jobs.noActiveProperties")}</p>
        )}
        {normalizedSearch && matchingProperties.length === 0 && availableProperties.length > 0 && (
          <p>{translate("properties.noMatchingSearch")}</p>
        )}

        <label>
          {translate("common.client")}
          <input
            type="text"
            value={selectedProperty ? clientName || translate("common.notProvided") : ""}
            readOnly
          />
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

        <label>
          {translate("jobs.scheduledTime")}
          <input
            type="time"
            name="scheduledStart"
            value={formValues.scheduledStart}
            onChange={updateField}
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
              inputMode="decimal"
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
              inputMode="decimal"
              value={formValues.cleanerPayout}
              onChange={updateField}
            />
          </label>
        </div>
        {selectedProperty && (
          <p className="form-helper">{translate("jobs.propertyPriceHint")}</p>
        )}

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

        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving || (!selectedProperty && (isLoadingProperties || hasPropertyError))}
          >
            {isSaving ? translate("jobs.creating") : translate("jobs.create")}
          </button>
        </div>
      </form>
    </section>
  );
}
