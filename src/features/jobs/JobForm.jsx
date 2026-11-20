import { useState } from "react";
import { defaultServiceType } from "../../../functions/src/serviceTypes.js";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { maximumGuestNameLength } from "./jobCompatibility.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { jobPriceFormValues, readJobPriceForm } from "./jobPricingForm.js";
import { JobPriceFields } from "./JobPriceFields.jsx";
import { serviceTypeMessage } from "./serviceTypeMessages.js";
import { createJob } from "./jobService.js";
import { JobServiceTypeSelect } from "./JobServiceTypeSelect.jsx";

export function CreateCleaningForm({
  property = null,
  properties = [],
  isLoadingProperties = false,
  hasPropertyError = false,
  onBack,
  onCreated,
}) {
  const { translate, language } = useTranslation();
  const [selectedProperty, setSelectedProperty] = useState(property);
  const [propertySearch, setPropertySearch] = useState("");
  const [formValues, setFormValues] = useState(() => ({
    serviceType: defaultServiceType,
    scheduledDate: "",
    scheduledStart: "11:00",
    ...jobPriceFormValues(resolveJobPricing({ serviceType: defaultServiceType }, { property })),
    guestName: "",
    notes: "",
    requiredCleanerCount: "1",
  }));
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

  const propertyRates = resolveJobPricing({ serviceType: formValues.serviceType }, {
    property: selectedProperty, cleanerCount: Number(formValues.requiredCleanerCount),
  });
  const missingRate = propertyRates.client.state !== "ready" || propertyRates.cleaner.state !== "ready";
  const legacyType = !selectedProperty?.serviceRates && formValues.serviceType !== defaultServiceType;

  function selectProperty(event) {
    const nextProperty = availableProperties.find(
      (candidate) => candidate.id === event.target.value,
    ) || null;
    if (nextProperty?.id !== selectedProperty?.id) {
      setSelectedProperty(nextProperty);
      setFormValues((currentValues) => ({
        ...currentValues,
        ...jobPriceFormValues(resolveJobPricing({ serviceType: currentValues.serviceType }, {
          property: nextProperty, cleanerCount: Number(currentValues.requiredCleanerCount),
        })),
      }));
    }
    setPropertySearch("");
    setSaveError("");
  }

  function updateField(event) {
    const { name, value } = event.target;

    setFormValues((current) => {
      const next = { ...current, [name]: value };
      if (name === "cleanerMode") next.fixedPerCleaner = false;
      if (name === "serviceType" || name === "requiredCleanerCount") {
        const pricing = jobPriceFormValues(resolveJobPricing({ serviceType: next.serviceType }, {
          property: selectedProperty, cleanerCount: Number(next.requiredCleanerCount),
        }));
        if (name === "serviceType") {
          // Legacy forms kept the entered amounts when changing type before a rate table existed.
          if (selectedProperty?.serviceRates || value === defaultServiceType) return { ...next, ...pricing };
        } else if (selectedProperty?.serviceRates?.[next.serviceType]?.cleaner?.byCleanerCount) {
          return { ...next, cleanerPayout: pricing.cleanerPayout, cleanerMode: pricing.cleanerMode, fixedPerCleaner: pricing.fixedPerCleaner };
        }
      }
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");

    if (!selectedProperty) {
      setSaveError(translate("jobs.propertyRequired"));
      return;
    }

    const prices = readJobPriceForm(formValues);
    const notes = formValues.notes.trim();

    if (!prices) {
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
        serviceType: formValues.serviceType,
        scheduledDate: formValues.scheduledDate,
        scheduledStart: formValues.scheduledStart,
        ...prices,
        notes,
        guestName: formValues.guestName,
        ...(Number(formValues.requiredCleanerCount) > 1
          ? { requiredCleanerCount: Number(formValues.requiredCleanerCount) } : {}),
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

        <JobServiceTypeSelect value={formValues.serviceType} onChange={updateField} disabled={isSaving} />

        <label>
          {translate("jobs.cleanersNeeded")}
          <select name="requiredCleanerCount" value={formValues.requiredCleanerCount} onChange={updateField} disabled={isSaving}>
            {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
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

        <JobPriceFields values={formValues} onChange={updateField} disabled={isSaving} />
        {selectedProperty && (
          <p className="form-helper" aria-live="polite">{missingRate
            ? serviceTypeMessage(language, legacyType ? "legacyTypeRate" : "missingTypeRate")
            : translate("jobs.propertyPriceHint")}</p>
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
