import { useTranslation } from "../../i18n/translations.js";

export function PublicOfferAssignmentAcknowledgment({ state, isSaving, onConfirm }) {
  const { translate } = useTranslation();
  if (!state) return null;

  if (state === "CONFIRMED") {
    return (
      <p className="public-offer-confirmation" role="status">
        {translate("publicOffer.assignmentAcknowledged")}
      </p>
    );
  }

  if (state !== "AWAITING_CONFIRMATION") return null;

  return (
    <div className="public-offer-actions public-offer-assignment-acknowledgment">
      <p>{translate("publicOffer.assignmentAwaitingConfirmation")}</p>
      <button
        className="button button--primary"
        type="button"
        disabled={isSaving}
        onClick={onConfirm}
      >
        {isSaving
          ? translate("publicOffer.assignmentAcknowledging")
          : translate("publicOffer.assignmentAcknowledge")}
      </button>
    </div>
  );
}
