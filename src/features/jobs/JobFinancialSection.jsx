import { JobDetailSection } from "./JobDetailSection.jsx";
import { DetailItem } from "../../components/UiPrimitives.jsx";
import { formatPrice } from "../../lib/presentation.js";

import { resolveJobPricing } from "../pricing/pricingModel.js";
import { formatPricingRate, pricingMessage } from "../pricing/pricingMessages.js";
import { JobPriceFields } from "./JobPriceFields.jsx";
import { jobPricesLocked } from "./jobPricingForm.js";
import { serviceTypeMessage } from "./serviceTypeMessages.js";

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
  const { client, cleaner } = resolveJobPricing(job);
  const locked = jobPricesLocked(job);
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.financial")}>
    <section className="service-financial-summary" aria-label={translate("lifecycle.financialSnapshot")}>
      <h3>{translate("lifecycle.financialSnapshot")}</h3>
      <dl className="detail-list">
        <DetailItem label={translate("jobs.clientPrice")} value={formatPricingRate(client, language, translate)} />
        <DetailItem label={cleaner.perCleaner ? pricingMessage(language, "teamAmount") : translate("jobs.cleanerPayout")} value={formatPricingRate(cleaner, language, translate)} />
        <DetailItem label={translate("jobs.grossMargin")} value={grossMargin === null
          ? translate("jobs.notSet") : formatPrice(grossMargin, translate, language)} />
      </dl>
    </section>
    <section className="job-pricing" aria-label={translate("jobs.editPrices")}>
      {!isEditingPrices && (
        <button className="button" type="button" disabled={locked} onClick={startPriceEdit}>
          {translate("jobs.editPrices")}
        </button>
      )}
      {locked && <p className="form-hint">{serviceTypeMessage(language, "paidPrices")}</p>}
      {hasSavedPrices && !isEditingPrices && (
        <p className="form-success" role="status">{translate("jobs.pricesSaved")}</p>
      )}
      {isEditingPrices && !locked && (
        <form className="cleaning-form" noValidate onSubmit={savePrices}>
          <JobPriceFields values={priceValues} disabled={isSavingPrices} onChange={(event) => {
            const { name, value } = event.target;
            setPriceValues((current) => ({ ...current, [name]: value, ...(name === "cleanerMode" ? { fixedPerCleaner: false } : {}) }));
          }} />
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
