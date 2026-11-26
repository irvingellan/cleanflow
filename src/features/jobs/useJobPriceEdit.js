import { useEffect, useState } from "react";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { jobHasRecordedPayout, jobPriceFormValues, readJobPriceForm } from "./jobPricingForm.js";

/** State of the price edit form in Job Detail's Financial section. Resets when another Job is shown. */
export function useJobPriceEdit({ job, translate, onUpdatePrices }) {
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceValues, setPriceValues] = useState(() => jobPriceFormValues(resolveJobPricing(job), job));
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [priceSaveError, setPriceSaveError] = useState("");
  const [hasSavedPrices, setHasSavedPrices] = useState(false);

  useEffect(() => {
    setPriceValues(jobPriceFormValues(resolveJobPricing(job), job));
    setIsEditingPrices(false);
    setIsSavingPrices(false);
    setPriceSaveError("");
    setHasSavedPrices(false);
  }, [job.id]);

  function startPriceEdit() {
    setPriceValues(jobPriceFormValues(resolveJobPricing(job), job));
    setPriceSaveError("");
    setHasSavedPrices(false);
    setIsEditingPrices(true);
  }

  async function savePrices(event) {
    event.preventDefault();
    const cleanerOnly = jobHasRecordedPayout(job);
    const prices = readJobPriceForm(cleanerOnly
      ? { ...priceValues, clientMode: "FIXED", clientPrice: "" } : priceValues);

    const { client, cleaner } = resolveJobPricing(job);
    if (!prices || (!cleanerOnly && client.reason === "invalid_rate" && !priceValues.clientPrice) ||
        (cleaner.reason === "invalid_rate" && !priceValues.cleanerPayout)) {
      setPriceSaveError(translate("jobs.priceInvalid"));
      return;
    }

    setIsSavingPrices(true);
    setPriceSaveError("");
    setHasSavedPrices(false);

    try {
      await onUpdatePrices(cleanerOnly ? { ...prices, cleanerOnly } : prices);
      setIsEditingPrices(false);
      setHasSavedPrices(true);
    } catch {
      setPriceSaveError(translate("jobs.priceUpdateError"));
    } finally {
      setIsSavingPrices(false);
    }
  }

  return {
    isEditingPrices, setIsEditingPrices, priceValues, setPriceValues, isSavingPrices, priceSaveError, setPriceSaveError,
    hasSavedPrices, startPriceEdit, savePrices,
  };
}
