import { useEffect, useState } from "react";
import { hasValue } from "../../lib/presentation.js";
import { optionalJobPrice } from "./jobCompatibility.js";

/** State of the price edit form in Job Detail's Financial section. Resets when another Job is shown. */
export function useJobPriceEdit({ job, translate, onUpdatePrices }) {
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceValues, setPriceValues] = useState(() => ({
    clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
    cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
  }));
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [priceSaveError, setPriceSaveError] = useState("");
  const [hasSavedPrices, setHasSavedPrices] = useState(false);

  useEffect(() => {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setIsEditingPrices(false);
    setIsSavingPrices(false);
    setPriceSaveError("");
    setHasSavedPrices(false);
  }, [job.id]);

  function startPriceEdit() {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setPriceSaveError("");
    setHasSavedPrices(false);
    setIsEditingPrices(true);
  }

  async function savePrices(event) {
    event.preventDefault();
    const clientPrice = optionalJobPrice(priceValues.clientPrice);
    const cleanerPayout = optionalJobPrice(priceValues.cleanerPayout);

    if (clientPrice === null || cleanerPayout === null) {
      setPriceSaveError(translate("jobs.priceInvalid"));
      return;
    }

    setIsSavingPrices(true);
    setPriceSaveError("");
    setHasSavedPrices(false);

    try {
      await onUpdatePrices({ clientPrice, cleanerPayout });
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
