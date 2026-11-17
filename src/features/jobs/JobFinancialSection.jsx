import { JobDetailSection } from "./JobDetailSection.jsx";
import { DetailItem } from "../../components/UiPrimitives.jsx";
import { formatPrice, hasValue } from "../../lib/presentation.js";

/** The Financial section of Job Detail: the financial snapshot and the price edit form. */
export function JobFinancialSection({
  job,
  translate,
  language,
  grossMargin,
  isEditingPrices,
  startPriceEdit,
  hasSavedPrices,
  savePrices,
  priceValues,
  setPriceValues,
  priceSaveError,
  isSavingPrices,
  setIsEditingPrices,
  setPriceSaveError,
}) {
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.financial")}>
    <section className="service-financial-summary" aria-label={translate("lifecycle.financialSnapshot")}>
      <h3>{translate("lifecycle.financialSnapshot")}</h3>
      <dl className="detail-list">
        <DetailItem label={translate("jobs.clientPrice")} value={hasValue(job.clientPrice)
          ? formatPrice(job.clientPrice, translate, language) : translate("jobs.notSet")} />
        <DetailItem label={translate("jobs.cleanerPayout")} value={hasValue(job.cleanerPayout)
          ? formatPrice(job.cleanerPayout, translate, language) : translate("jobs.notSet")} />
        <DetailItem label={translate("jobs.grossMargin")} value={grossMargin === null
          ? translate("jobs.notSet") : formatPrice(grossMargin, translate, language)} />
      </dl>
    </section>
    <section className="job-pricing" aria-label={translate("jobs.editPrices")}>
      {!isEditingPrices && (
        <button className="button" type="button" onClick={startPriceEdit}>
          {translate("jobs.editPrices")}
        </button>
      )}
      {hasSavedPrices && !isEditingPrices && (
        <p className="form-success" role="status">{translate("jobs.pricesSaved")}</p>
      )}
      {isEditingPrices && (
        <form className="cleaning-form" noValidate onSubmit={savePrices}>
          <div className="form-row">
            <label>
              {translate("jobs.clientPrice")}
              <input
                type="number"
                name="clientPrice"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={priceValues.clientPrice}
                onChange={(event) => setPriceValues((current) => ({
                  ...current,
                  clientPrice: event.target.value,
                }))}
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
                value={priceValues.cleanerPayout}
                onChange={(event) => setPriceValues((current) => ({
                  ...current,
                  cleanerPayout: event.target.value,
                }))}
              />
            </label>
          </div>
          {priceSaveError && <p className="form-error" role="alert">{priceSaveError}</p>}
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isSavingPrices}
              onClick={() => {
                setIsEditingPrices(false);
                setPriceSaveError("");
              }}
            >
              {translate("common.cancel")}
            </button>
            <button className="button button--primary" type="submit" disabled={isSavingPrices}>
              {isSavingPrices ? translate("jobs.savingPrices") : translate("jobs.savePrices")}
            </button>
          </div>
        </form>
      )}
    </section>

    </JobDetailSection>
  );
}
