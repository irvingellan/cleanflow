import { JobDetailSection } from "./JobDetailSection.jsx";
import { JobOfferRow } from "./JobOfferRow.jsx";
import { isJobFilled, maxCleanersPerJob, requiredCleanerCount, rosterCleanerIds } from "./offerSlots.js";
import { StateCard } from "../../components/UiPrimitives.jsx";

/** The Offers section of Job Detail: offer actions, cleaner spots, the offer list and the legacy "simulate cleaner" button. */
export function JobOffersSection({
  job,
  translate,
  language,
  offersSectionRef,
  canOfferToCleaners,
  isLoadingOffers,
  sortedOffers,
  onOfferToCleaners,
  onRefreshOffers,
  isAssignmentAware,
  automaticOfferJob,
  onSetCleanerSpots,
  canEditRoster,
  isSavingSpots,
  changeCleanerSpots,
  offersCreatedCount,
  hasOffersError,
  cleanerNamesById,
  onDecideOffer,
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
  assignmentError,
  canSimulateAssignedCleaner,
  onSimulateAssignedCleaner,
}) {
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.offers")}>
    <section className="offers-section" aria-labelledby="offers-title" ref={offersSectionRef} tabIndex={-1}>
      <div className="offers-section__header">
        <h3 id="offers-title">{translate("offers.title")}</h3>
        <div className="offers-section__actions">
          {canOfferToCleaners && !isLoadingOffers && sortedOffers.length === 0 && (
            <button
              className="button button--primary"
              type="button"
              onClick={onOfferToCleaners}
            >
              {translate("offers.offerCleaningToCleaners")}
            </button>
          )}
          {canOfferToCleaners && !isLoadingOffers && sortedOffers.length > 0 && (
            <button className="button" type="button" onClick={onOfferToCleaners}>
              {translate("offers.sendToMoreCleaners")}
            </button>
          )}
          <button
            className="button"
            type="button"
            onClick={onRefreshOffers}
            disabled={isLoadingOffers}
          >
            {translate("offers.refresh")}
          </button>
        </div>
      </div>

      {isAssignmentAware && automaticOfferJob && sortedOffers.length > 0 && (
        <div className="offer-spots" data-testid="offer-spots">
          <span>{translate(isJobFilled(job) ? "offers.spotsFilled" : "offers.automaticSpots", {
            filled: rosterCleanerIds(job).length, total: requiredCleanerCount(job),
          })}</span>
        </div>
      )}

      {isAssignmentAware && !automaticOfferJob && sortedOffers.length > 0 && (
        <div className="offer-spots" data-testid="offer-spots">
          <span>{translate(isJobFilled(job) ? "offers.spotsFilled" : "offers.spotsOpen", {
            filled: rosterCleanerIds(job).length, total: requiredCleanerCount(job),
          })}</span>
          {onSetCleanerSpots && canEditRoster && (
            <span className="offer-spots__stepper" role="group" aria-label={translate("offers.spotsLabel")}>
              <button className="button" type="button" aria-label={translate("offers.spotsLess")}
                disabled={isSavingSpots || requiredCleanerCount(job) <= Math.max(1, rosterCleanerIds(job).length)}
                onClick={() => changeCleanerSpots(requiredCleanerCount(job) - 1)}>−</button>
              <span className="offer-spots__count" aria-live="polite">{requiredCleanerCount(job)}</span>
              <button className="button" type="button" aria-label={translate("offers.spotsMore")}
                disabled={isSavingSpots || requiredCleanerCount(job) >= maxCleanersPerJob}
                onClick={() => changeCleanerSpots(requiredCleanerCount(job) + 1)}>+</button>
              <span>{translate("offers.spotsLabel")}</span>
            </span>
          )}
        </div>
      )}

      {offersCreatedCount !== null && (
        <p className="offers-section__success" role="status">
          {translate(automaticOfferJob ? "offers.automaticCreated" : "offers.createdReadyToShare", { count: offersCreatedCount })}
        </p>
      )}

      {isLoadingOffers && (
        <StateCard message={translate("offers.loading")} status="status" />
      )}

      {!isLoadingOffers && hasOffersError && (
        <StateCard
          message={translate("offers.error")}
          status="alert"
          isError
        />
      )}

      {!isLoadingOffers && !hasOffersError && sortedOffers.length === 0 && (
        <StateCard message={translate("offers.empty")} />
      )}

      {!isLoadingOffers && !hasOffersError && sortedOffers.length > 0 && (
        <div className="offer-status-list">
          {sortedOffers.map((offer) => (
            <JobOfferRow
              key={offer.id}
              offer={offer}
              job={job}
              translate={translate}
              language={language}
              cleanerNamesById={cleanerNamesById}
              automaticOfferJob={automaticOfferJob}
              isAssignmentAware={isAssignmentAware}
              onDecideOffer={onDecideOffer}
              canEditRoster={canEditRoster}
              onReopenOffer={onReopenOffer}
              editingOfferCompensationFor={editingOfferCompensationFor}
              offerMessageFor={offerMessageFor}
              cleanerPhonesById={cleanerPhonesById}
              canManageOffers={canManageOffers}
              isCreatingPublicOfferLinkFor={isCreatingPublicOfferLinkFor}
              createOfferLink={createOfferLink}
              openOfferLinkForm={openOfferLinkForm}
              onRevokeAutomaticOffer={onRevokeAutomaticOffer}
              revokingOfferId={revokingOfferId}
              revokeOffer={revokeOffer}
              assignedCleanerIds={assignedCleanerIds}
              isAssigned={isAssigned}
              assigningCleanerId={assigningCleanerId}
              decidingOfferId={decidingOfferId}
              assignCleaner={assignCleaner}
              decideOffer={decideOffer}
              addCleanerSpotAndAssign={addCleanerSpotAndAssign}
              reopenOffer={reopenOffer}
              offerCompensationInput={offerCompensationInput}
              setOfferCompensationInput={setOfferCompensationInput}
              setOfferCompensationErrorFor={setOfferCompensationErrorFor}
              offerCompensationErrorFor={offerCompensationErrorFor}
              setEditingOfferCompensationFor={setEditingOfferCompensationFor}
              revokeOfferErrorId={revokeOfferErrorId}
              publicOfferLink={publicOfferLink}
              cleanerLanguageLabelFor={cleanerLanguageLabelFor}
              copyOfferMessage={copyOfferMessage}
              copiedOfferMessageId={copiedOfferMessageId}
              offerMessageCopyErrorId={offerMessageCopyErrorId}
              publicOfferLinkError={publicOfferLinkError}
            />
          ))}
        </div>
      )}

      {!isAssignmentAware && assignmentError && (
        <p className="form-error assignment-error" role="alert">
          {assignmentError}
        </p>
      )}
    </section>

    <div className="button-row">
      {canSimulateAssignedCleaner && (
        <button
          className="button"
          type="button"
          onClick={onSimulateAssignedCleaner}
        >
          {translate("offers.simulateAssignedCleaner")}
        </button>
      )}
    </div>
    </JobDetailSection>
  );
}
