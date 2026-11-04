import { useTranslation } from "../../i18n/translations.js";

// FB03 (Gabi pilot feedback 2026-11-04). When cleaners answered "interested",
// the manager's decision is shown first instead of a generic "Assign cleaner".
// Interest never assigns: only the manager's explicit confirmation does, through
// the same onAssignCleaner(offer) handler as the Offers section. Manual direct
// assignment stays available as a secondary, explicit exception.

const automaticDistributionMode = "FIRST_ACCEPT_WINS"; // Issue #86 opt-in mode

/**
 * Interested Offers the manager can confirm right now. Mirrors the availability
 * of the existing Offers "Assign" button exactly; it never widens it.
 */
export function decidableInterestedOffers({
  job, offers = [], isAssignmentAware, assignedCleanerIds = [], isAssigned,
  canManageOffers, canEditRoster, isLoadingOffers, hasOffersError,
}) {
  if (!canManageOffers || isLoadingOffers || hasOffersError || job?.archivedAt) return [];
  // An automatic (#86) batch awards on first acceptance: no second approval.
  if (job?.offerDistributionMode === automaticDistributionMode) return [];
  return offers.filter((offer) => offer.status === "INTERESTED" && offer.cleanerId
    && (isAssignmentAware ? canEditRoster && !assignedCleanerIds.includes(offer.cleanerId) : !isAssigned));
}

export function InterestDecisionPanel({
  ref, offers, cleanerName, respondedAt, assigningCleanerId, error,
  onConfirm, onSeeAllOffers, onAssignManually,
}) {
  const { translate } = useTranslation();
  const single = offers.length === 1;
  return <section ref={ref} tabIndex={-1} className="interest-decision" aria-labelledby="interest-decision-title" data-testid="interest-decision">
    <p className="eyebrow">{translate("interest.eyebrow")}</p>
    <h3 id="interest-decision-title">{translate("interest.title", { count: offers.length })}</h3>
    <p className="interest-decision__body">{translate("interest.body")}</p>
    <ul className="interest-decision__list">
      {offers.map((offer) => {
        const name = cleanerName(offer);
        const time = respondedAt(offer);
        return <li key={offer.id} data-offer-id={offer.id}>
          <div>
            <strong>{name}</strong>
            <span className="status-badge">{translate("status.interested")}</span>
            {time && <span className="interest-decision__time">{translate("interest.responded", { time })}</span>}
          </div>
          <button className={`button${single ? " button--primary" : ""}`} type="button"
            disabled={assigningCleanerId !== null} onClick={() => onConfirm(offer)}>
            {assigningCleanerId === offer.cleanerId ? translate("offers.assigning") : translate("interest.confirm", { name })}
          </button>
        </li>;
      })}
    </ul>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="interest-decision__secondary">
      <button className="button button--text" type="button" onClick={onSeeAllOffers}>{translate("interest.seeAll")}</button>
      {onAssignManually && <span>
        <button className="button button--text" type="button" onClick={onAssignManually}>{translate("interest.manual")}</button>
        <small>{translate("interest.manualNote")}</small>
      </span>}
    </div>
  </section>;
}
