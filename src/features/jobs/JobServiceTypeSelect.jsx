import { serviceTypes } from "../../../functions/src/serviceTypes.js";
import { useTranslation } from "../../i18n/translations.js";
import { serviceTypeLabel, serviceTypeMessage } from "./serviceTypeMessages.js";

export function JobServiceTypeSelect({ value, onChange, disabled }) {
  const { language } = useTranslation();
  return (
    <label>
      {serviceTypeMessage(language, "field")}
      <select name="serviceType" value={value} onChange={onChange} disabled={disabled}>
        {serviceTypes.map((type) => <option key={type} value={type}>{serviceTypeLabel(language, type)}</option>)}
      </select>
    </label>
  );
}
