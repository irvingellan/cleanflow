import { pricingMessage } from "../pricing/pricingMessages.js";
import { DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatOfferCompensation } from "../jobs/offerCompensation.js";

export function PublicOfferCompensation({ amount, offeredPay, recipientTranslation }) {
  const currentTranslation = useTranslation();
  const { language, translate } = recipientTranslation ?? currentTranslation;

  const label = formatOfferCompensation({ offeredPay, offeredCompensation: amount }, translate, language);
  return (
    <DetailItem
      label={translate("publicOffer.offeredCompensation")}
      value={offeredPay ? <>{label}<br />{pricingMessage(language, "reportHours")}</> : label}
    />
  );
}
