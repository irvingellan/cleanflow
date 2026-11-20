import { offerPayForRecipient } from "../../../functions/src/offerPay.js";
import { offerPayNote, pricingMessage } from "../pricing/pricingMessages.js";
import {
  isJobFilled,
  manualOfferAvailability,
  maxCleanersPerJob,
  offerManagerDecisions,
  rosterCleanerIds,
} from "./offerSlots.js";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { automaticOfferDisplayStatus } from "./automaticOffers.js";
import { formatCreatedAt, hasValue } from "../../lib/presentation.js";
import { formatOfferCompensation, getOfferCompensationSuggestion } from "./offerCompensation.js";
import { buildWhatsAppChatUrl } from "./whatsappHandoff.js";

/** One offer in the Offers section of Job Detail: its status, the manager's actions, the public link and the message for the cleaner. */
export function JobOfferRow({
  offer,
  job,
  translate,
  language,
  cleanerNamesById,
  automaticOfferJob,
  isAssignmentAware,
  onDecideOffer,
  canEditRoster,
  onReopenOffer,
  editingOfferCompensationFor,
  offerMessageFor,
  cleanerPhonesById,
  canManageOffers,
  isCreatingPublicOfferLinkFor,
  createOfferLink,
  openOfferLinkForm,
  onRevokeAutomaticOffer,
  revokingOfferId,
  revokeOffer,
  assignedCleanerIds,
  isAssigned,
  assigningCleanerId,
  decidingOfferId,
  assignCleaner,
  decideOffer,
  addCleanerSpotAndAssign,
  reopenOffer,
  offerCompensationInput,
  setOfferCompensationInput,
  setOfferCompensationErrorFor,
  offerCompensationErrorFor,
  setEditingOfferCompensationFor,
  revokeOfferErrorId,
  publicOfferLink,
  cleanerLanguageLabelFor,
  copyOfferMessage,
  copiedOfferMessageId,
  offerMessageCopyErrorId,
  publicOfferLinkError,
}) {
  const respondedAt = formatCreatedAt(offer.respondedAt, language);
  const offerCleanerName = currentCleanerName(
    offer.cleanerId,
    offer.cleanerName,
    cleanerNamesById,
    translate("common.notProvided"),
  );
  const automaticStatus = automaticOfferDisplayStatus(job, offer);
  // FB08/FB09: derived availability of a manual invitation.
  const availability = automaticOfferJob ? null : manualOfferAvailability(job, offer);
  const isOpenOffer = availability === "open";
  const manualStatus = availability === "closed"
    ? offer.managerDecision
    : availability === "filled" && ["PENDING", "INTERESTED"].includes(offer.status) ? "FILLED" : null;
  const canCreatePublicLink = automaticOfferJob
    ? automaticStatus === "AWAITING_ACCEPTANCE"
    : isOpenOffer && offer.status === "PENDING" &&
    (!isAssignmentAware
      ? job.operationalStatus === "OFFERED"
      : ["OFFERED", "ASSIGNED"].includes(job.operationalStatus));
  const canDecideOffer = Boolean(onDecideOffer) && isAssignmentAware && canEditRoster && isOpenOffer;
  const canReopenOffer = Boolean(onReopenOffer) && isAssignmentAware && canEditRoster
    && availability === "closed" && !isJobFilled(job);
  const currentTerms = publicOfferLink?.offerId === offer.id ? { offeredCompensation: null, ...publicOfferLink } : offer;
  const compensationSuggestion = getOfferCompensationSuggestion(job, currentTerms);
  const recipientPay = offerPayForRecipient(currentTerms, job, offer.cleanerId);
  const extra = compensationSuggestion.source === "offer" && offerPayNote(recipientPay, language);
  const isEditingOfferCompensation = editingOfferCompensationFor === offer.id;
  const offerMessage = offerMessageFor(offer, offerCleanerName);
  const phone = cleanerPhonesById[offer.cleanerId];
  const offerWhatsAppUrl = offerMessage && buildWhatsAppChatUrl(phone);

  return (
    <article className="offer-status-item">
      <div>
        <strong>{offerCleanerName}</strong>
        {respondedAt && (
          <span>
            {translate("offers.responded")} {respondedAt}
          </span>
        )}
      </div>
      <span className={`status-badge${manualStatus ? " is-closed" : ""}`}>
        {translate(
          {
            FILLED: "offers.spotFilled",
            NOT_SELECTED: "offers.notSelected",
            WITHDRAWN: "offers.withdrawn",
            PENDING: "status.pending",
            INTERESTED: "status.interested",
            DECLINED: "status.declined",
            ACCEPTED: "offers.accepted",
            AWAITING_ACCEPTANCE: "offers.waitingForAcceptance",
            UNAVAILABLE: "offers.unavailable",
            EXPIRED: "offers.expired",
          }[automaticStatus ?? manualStatus ?? offer.status] || "common.notProvided",
        )}
      </span>
      {canManageOffers && (
        <div className="offer-status-actions">
          {canCreatePublicLink && !isEditingOfferCompensation && (
            <button
              className="button"
              type="button"
              disabled={isCreatingPublicOfferLinkFor !== null}
              onClick={() => automaticOfferJob ? createOfferLink(null, offer) : openOfferLinkForm(offer)}
            >
              {translate("offers.createPublicLink")}
            </button>
          )}
          {automaticStatus === "AWAITING_ACCEPTANCE" && onRevokeAutomaticOffer && (
            <button
              className="button"
              type="button"
              disabled={revokingOfferId !== null}
              onClick={() => revokeOffer(offer.id)}
            >
              {translate("offers.revoke")}
            </button>
          )}
          {!automaticOfferJob && offer.status === "INTERESTED" && isOpenOffer &&
            (isAssignmentAware
              ? canEditRoster && !assignedCleanerIds.includes(offer.cleanerId)
              : !isAssigned) && (
            <button
              className="button button--primary"
              type="button"
              disabled={assigningCleanerId !== null || decidingOfferId !== null}
              onClick={() => assignCleaner(offer)}
            >
              {assigningCleanerId === offer.cleanerId
                ? translate("offers.assigning")
                : translate("offers.assign")}
            </button>
          )}
          {canDecideOffer && offer.status === "INTERESTED" && (
            <button className="button button--text" type="button"
              disabled={assigningCleanerId !== null || decidingOfferId !== null}
              onClick={() => decideOffer(offer, offerManagerDecisions.notSelected)}>
              {decidingOfferId === offer.id ? translate("offers.deciding") : translate("offers.notSelect")}
            </button>
          )}
          {canDecideOffer && offer.status === "PENDING" && (
            <button className="button button--text" type="button"
              disabled={assigningCleanerId !== null || decidingOfferId !== null}
              onClick={() => decideOffer(offer, offerManagerDecisions.withdrawn)}>
              {decidingOfferId === offer.id ? translate("offers.deciding") : translate("offers.withdraw")}
            </button>
          )}
          {manualStatus === "FILLED" && offer.status === "INTERESTED" && isAssignmentAware && canEditRoster
            && rosterCleanerIds(job).length < maxCleanersPerJob && (
            <button className="button button--text" type="button"
              disabled={assigningCleanerId !== null || decidingOfferId !== null}
              onClick={() => addCleanerSpotAndAssign(offer)}>
              {translate("offers.addSpotAndAssign")}
            </button>
          )}
          {canReopenOffer && (
            <button className="button button--text" type="button"
              disabled={decidingOfferId !== null}
              onClick={() => reopenOffer(offer)}>
              {decidingOfferId === offer.id ? translate("offers.deciding") : translate("offers.reopen")}
            </button>
          )}
        </div>
      )}
      {canManageOffers && canCreatePublicLink && isEditingOfferCompensation && (
        <form
          className="offer-compensation-form"
          onSubmit={(event) => createOfferLink(event, offer)}
        >
          {compensationSuggestion.mode === "HOURLY" ? (
            <p>{formatOfferCompensation(recipientPay, translate, language)}<br />{pricingMessage(language, "reportHours")}</p>
          ) : <label>
            {translate("offers.offeredCompensation")}
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              readOnly={compensationSuggestion.source === "offer"}
              value={offerCompensationInput}
              onChange={(event) => {
                setOfferCompensationInput(event.target.value);
                setOfferCompensationErrorFor(null);
              }}
            />
          </label>}
          {extra && <p className="form-hint">{extra}</p>}
          <p className="offer-compensation-form__help">
            {compensationSuggestion.source === "job"
              ? translate("offers.jobAmountSuggestion")
              : translate("offers.amountHelper")}
          </p>
          {!offerCompensationInput.trim() && (
            <p className="offer-compensation-warning" role="status">
              {translate("offers.amountNotSetWarning")}
            </p>
          )}
          {offerCompensationErrorFor === offer.id && (
            <p className="form-error" role="alert">
              {translate("offers.amountInvalid")}
            </p>
          )}
          <div className="offer-compensation-form__actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={isCreatingPublicOfferLinkFor !== null}
            >
              {isCreatingPublicOfferLinkFor === offer.id
                ? translate("offers.creatingPublicLink")
                : translate("offers.createPublicLink")}
            </button>
            <button
              className="button"
              type="button"
              disabled={isCreatingPublicOfferLinkFor === offer.id}
              onClick={() => setEditingOfferCompensationFor(null)}
            >
              {translate("offers.cancel")}
            </button>
          </div>
        </form>
      )}
      {revokeOfferErrorId === offer.id && (
        <p className="form-error" role="alert">{translate("offers.revokeError")}</p>
      )}
      {publicOfferLink?.offerId === offer.id && !isEditingOfferCompensation &&
        (!automaticOfferJob || canCreatePublicLink) && (
        <div className="public-offer-link-actions">
          <a
            className="public-offer-link"
            href={publicOfferLink.url}
            target="_blank"
            rel="noreferrer"
          >
            {translate("offers.openPublicLink")}
          </a>
          <p className="offer-compensation-summary">
            <strong>{translate("offers.offeredCompensation")}:</strong>{" "}
            {formatOfferCompensation(recipientPay, translate, language)}
            {publicOfferLink.offeredPay && <><br />{pricingMessage(language, "reportHours")}</>}
          </p>
          <p className="form-hint">
            {translate("jobs.messageForCleanerLanguage", {
              cleaner: offerCleanerName,
              language: cleanerLanguageLabelFor(offer.cleanerId),
            })}
          </p>
          <div className="offer-message-actions">
            {offerWhatsAppUrl && (
              <a
                className="button button--primary"
                href={offerWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate("whatsapp.openInWhatsApp")}
              </a>
            )}
            <button
              className="button"
              type="button"
              onClick={() => copyOfferMessage(offer, offerCleanerName)}
            >
              {copiedOfferMessageId === offer.id
                ? translate("offers.offerMessageCopied")
                : translate("offers.copyOfferMessage")}
            </button>
          </div>
          {!offerWhatsAppUrl && (
            <p className="form-hint">{translate("whatsapp.phoneNeeded")}</p>
          )}
          <p className="form-hint">{pricingMessage(language, "copyBeforeWhatsApp")}</p>
          {!publicOfferLink.offeredPay && !hasValue(publicOfferLink.offeredCompensation) && (
            <p className="offer-compensation-warning" role="status">
              {translate("offers.amountNotSetWarning")}
            </p>
          )}
          {offerMessageCopyErrorId === offer.id && (
            <p className="form-error" role="alert">
              {translate("offers.offerMessageCopyError")}
            </p>
          )}
        </div>
      )}
      {publicOfferLinkError === offer.id && (
        <p className="form-error" role="alert">
          {translate("offers.publicLinkError")}
        </p>
      )}
    </article>
  );
}
