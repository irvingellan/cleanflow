import { DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatPrice, hasValue } from "../../lib/presentation.js";

export function PublicOfferCompensation({ amount }) {
  const { language, translate } = useTranslation();

  return (
    <DetailItem
      label={translate("publicOffer.offeredCompensation")}
      value={hasValue(amount)
        ? formatPrice(amount, translate, language)
        : translate("publicOffer.amountNotSet")}
    />
  );
}
