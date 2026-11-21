import { useTranslation } from "../../i18n/translations.js";
import { PRICING_FIXED, PRICING_HOURLY } from "../billing/billingStatementModel.js";
import { defaultHourlyRates } from "../pricing/hourlyDefaults.js";
import { pricingMessage } from "../pricing/pricingMessages.js";
import { serviceTypeMessage } from "./serviceTypeMessages.js";

export function JobPriceFields({ values, onChange, disabled }) {
  const { translate, language } = useTranslation();
  // Switching to hourly prefills the standard rate; a fixed amount is not an hourly rate.
  function changeMode(event, amountKey) {
    onChange(event);
    if (event.target.value === PRICING_HOURLY && values[event.target.name] !== PRICING_HOURLY) {
      const value = defaultHourlyRates[amountKey === "clientPrice" ? "client" : "cleaner"];
      onChange({ target: { name: amountKey, value } });
    }
  }
  return (
    <div className="form-row">
      {[["clientMode", "clientPrice"], ["cleanerMode", "cleanerPayout"]].map(([modeKey, amountKey]) => (
        <div key={modeKey}>
          <label>
            {serviceTypeMessage(language, modeKey)}
            <select name={modeKey} value={values[modeKey]} onChange={(event) => changeMode(event, amountKey)} disabled={disabled}>
              <option value={PRICING_FIXED}>{pricingMessage(language, "fixed")}</option>
              <option value={PRICING_HOURLY}>{pricingMessage(language, "hourly")}</option>
            </select>
          </label>
          <label>
            {values[modeKey] === PRICING_HOURLY
              ? serviceTypeMessage(language, amountKey + "Hourly")
              : amountKey === "cleanerPayout" && values.fixedPerCleaner ? pricingMessage(language, "teamAmount")
              : translate("jobs." + amountKey)}
            <input type="number" name={amountKey} min="0" step="0.01" inputMode="decimal"
              value={values[amountKey]} onChange={onChange} disabled={disabled} />
          </label>
        </div>
      ))}
    </div>
  );
}
