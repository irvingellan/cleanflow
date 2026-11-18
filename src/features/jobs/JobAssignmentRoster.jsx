import { StateCard } from "../../components/UiPrimitives.jsx";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import {
  CleanerSelectionOption,
  CleanerSelectionStatus,
  cleanerReplacementOption,
  sortByCleanerExperience,
} from "./CleanerSelectionContext.jsx";
import { getAssignmentAcknowledgmentState } from "./assignmentPresentation.js";
import { FIRST_ACCEPT_WINS } from "./automaticOffers.js";
import { canAssignCleanerDirectly } from "./assignmentService.js";
import { formatCreatedAt, formatOperationalStatus } from "../../lib/presentation.js";

/** The assignment roster of Job Detail's Cleaner section: assigned cleaners, direct assignment and replacement. */
export function JobAssignmentRoster({
  job,
  translate,
  language,
  isAssignmentAware,
  assignmentSectionRef,
  assignedCleanerIds,
  canDirectAssign,
  isDirectAssignmentOpen,
  setIsDirectAssignmentOpen,
  assignCleanerDirectly,
  isLoadingCleaners,
  offers,
  hasCleanerError,
  isAssigningDirectly,
  setDirectCleanerId,
  setDirectCleanerSearch,
  directCleanerSearch,
  directCleanerOptions,
  directCleanerId,
  cleanerSelection,
  availableCleaners,
  isLoadingAssignments,
  hasAssignmentsError,
  activeAssignments,
  cleanerNamesById,
  replacementTargetId,
  automaticOfferJob,
  openReminderPreview,
  copiedCleanerId,
  canEditRoster,
  removingAssignmentId,
  replacingAssignmentId,
  removeCleanerAssignment,
  eligibleReplacementOffers,
  setReplacementTargetId,
  replacementOfferId,
  setReplacementOfferId,
  replaceCleanerAssignment,
  hasAssignmentAcknowledgment,
  assignmentError,
}) {
  return (
    <>
      {isAssignmentAware && (
        <section ref={assignmentSectionRef} tabIndex={-1} className="assignment-roster" aria-labelledby="assigned-cleaners-title">
          <div className="assignment-roster__header">
            <div>
              <h3 id="assigned-cleaners-title">{translate("jobs.assignedCleaners")}</h3>
              <span>
                {assignedCleanerIds.length === 1
                  ? translate("jobs.cleanerAssignedOne", { count: assignedCleanerIds.length })
                  : translate("jobs.cleanersAssignedMany", { count: assignedCleanerIds.length })}
              </span>
            </div>
            {canDirectAssign && !isDirectAssignmentOpen && (
              <button className="button" type="button" onClick={() => setIsDirectAssignmentOpen((open) => !open)}>
                {translate("jobs.assignCleanerDirectly")}
              </button>
            )}
          </div>

          {canDirectAssign && isDirectAssignmentOpen && (
            <form className="cleaning-form" onSubmit={assignCleanerDirectly}>
              <p className="form-hint">{translate("jobs.directAssignmentExplanation")}</p>
              {isLoadingCleaners && <StateCard message={translate("offers.loadingCleaners")} status="status" />}
              {hasCleanerError && <StateCard message={translate("offers.cleanerError")} status="alert" isError />}
              {(isLoadingCleaners || hasCleanerError) && (
                <button className="button" type="button" disabled={isAssigningDirectly}
                  onClick={() => { setIsDirectAssignmentOpen(false); setDirectCleanerId(""); setDirectCleanerSearch(""); }}>{translate("common.cancel")}</button>
              )}
              {!isLoadingCleaners && !hasCleanerError && (
                <>
                  <label className="cleaner-name-search">
                    {translate("cleaners.search")}
                    <input type="search" value={directCleanerSearch}
                      onChange={(event) => setDirectCleanerSearch(event.target.value)} />
                  </label>
                  <CleanerSelectionStatus {...cleanerSelection} language={language} />
                  <fieldset className="direct-cleaner-picker">
                    <legend>{translate("jobs.cleanerPickerResults")}</legend>
                      {directCleanerOptions.map((cleaner) => (
                        <CleanerSelectionOption key={cleaner.id}
                          className={`direct-cleaner-picker__option${directCleanerId === cleaner.id ? " direct-cleaner-picker__option--selected" : ""}`}
                          cleanerId={cleaner.id} name={cleaner.name || translate("common.notProvided")}
                          context={cleanerSelection.result} language={language} type="radio" inputName="direct-cleaner" value={cleaner.id}
                          checked={directCleanerId === cleaner.id} disabled={isAssigningDirectly}
                          onChange={() => setDirectCleanerId(cleaner.id)} />
                      ))}
                  </fieldset>
                  {directCleanerId && (
                    <div role="status">
                      <p className="form-hint">{translate("jobs.cleanerPickerSelected", {
                        name: availableCleaners.find((cleaner) => cleaner.id === directCleanerId)?.name || translate("common.notProvided"),
                      })}</p>
                      <p className="form-hint">{translate("jobs.cleanerPickerPending")}</p>
                    </div>
                  )}
                  {directCleanerOptions.length === 0 && (
                    <p className="form-hint">{translate("cleaners.searchNoResults")}</p>
                  )}
                  <div className="button-row">
                    <button className="button" type="button" disabled={isAssigningDirectly}
                      onClick={() => { setIsDirectAssignmentOpen(false); setDirectCleanerId(""); setDirectCleanerSearch(""); }}>{translate("common.cancel")}</button>
                    <button className="button button--primary" type="submit"
                      disabled={!directCleanerId || isAssigningDirectly || !canAssignCleanerDirectly(
                        job, availableCleaners.find((cleaner) => cleaner.id === directCleanerId))}>
                      {isAssigningDirectly ? translate("jobs.assigningCleanerDirectly")
                        : translate("jobs.confirmDirectAssignment")}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {isLoadingAssignments && (
            <StateCard message={translate("jobs.rosterLoading")} status="status" />
          )}
          {!isLoadingAssignments && hasAssignmentsError && (
            <StateCard message={translate("jobs.rosterError")} status="alert" isError />
          )}
          {!isLoadingAssignments && !hasAssignmentsError && activeAssignments.length === 0
            && !(isDirectAssignmentOpen && directCleanerId) && (
            <StateCard message={translate("jobs.noAssignedCleaners")} />
          )}
          {!isLoadingAssignments && !hasAssignmentsError && activeAssignments.length > 0 && (
            <div className="assignment-roster__list">
              {activeAssignments.map((assignment) => {
                const assignmentCleanerName = currentCleanerName(
                  assignment.cleanerId,
                  assignment.cleanerNameSnapshot,
                  cleanerNamesById,
                  translate("common.notProvided"),
                );
                const isReplacing = replacementTargetId === assignment.id;
                const automaticAssignment = assignment.assignmentMethod === FIRST_ACCEPT_WINS;
                const acknowledgmentState = getAssignmentAcknowledgmentState(assignment, offers);
                const methodLabel = automaticAssignment ? "offers.automaticAssignment"
                  : automaticOfferJob ? "offers.manualAssignment" : null;

                return (
                  <article key={assignment.id} className="assignment-roster__item">
                    <strong>{assignmentCleanerName}</strong>
                    <span className="status-badge">
                      {formatOperationalStatus(assignment.executionStatus, translate)}
                    </span>
                    {methodLabel && (
                      <span className="status-badge">{translate(methodLabel)}</span>
                    )}
                    {automaticAssignment && assignment.assignedAt && (
                      <span>{formatCreatedAt(assignment.assignedAt, language)}</span>
                    )}
                    {!methodLabel && acknowledgmentState && (
                      <span className="status-badge" data-testid={`assignment-acknowledgment-${assignment.id}`}>
                        {translate(acknowledgmentState === "ASSIGNED_DIRECTLY"
                          ? "jobs.assignmentAssignedDirectly"
                          : acknowledgmentState === "CONFIRMED"
                          ? "jobs.assignmentConfirmationConfirmed"
                          : "jobs.assignmentConfirmationAwaiting")}
                      </span>
                    )}
                    {job.operationalStatus === "ASSIGNED" && (
                      <div className="assignment-roster__message-action">
                        <button
                          className="button"
                          type="button"
                          onClick={() =>
                            openReminderPreview(assignment.cleanerId, assignmentCleanerName, assignment.id)
                          }
                        >
                          {copiedCleanerId === assignment.cleanerId
                            ? translate("jobs.messageCopied")
                            : translate("jobs.prepareCleanerMessage")}
                        </button>
                      </div>
                    )}
                    {canEditRoster && !isReplacing && (
                      <div className="assignment-roster__actions">
                        <button
                          className="button"
                          type="button"
                          disabled={removingAssignmentId !== null || replacingAssignmentId !== null}
                          onClick={() => removeCleanerAssignment(assignment.id)}
                        >
                          {removingAssignmentId === assignment.id
                            ? translate("jobs.removingCleaner")
                            : translate("jobs.removeCleaner")}
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={removingAssignmentId !== null || replacingAssignmentId !== null || eligibleReplacementOffers.length === 0}
                          onClick={() => setReplacementTargetId(assignment.id)}
                        >
                          {translate("jobs.replaceCleaner")}
                        </button>
                      </div>
                    )}
                    {canEditRoster && isReplacing && (
                      <div className="assignment-replacement">
                        <CleanerSelectionStatus {...cleanerSelection} language={language} />
                        <label>
                          {translate("jobs.replacementCleaner")}
                          <select
                            value={replacementOfferId}
                            onChange={(event) => setReplacementOfferId(event.target.value)}
                          >
                            <option value="">{translate("common.notProvided")}</option>
                            {sortByCleanerExperience(eligibleReplacementOffers, cleanerSelection.result, (offer) => offer.cleanerId).map((offer) => (
                              <option key={offer.id} value={offer.id}>
                                {cleanerReplacementOption(currentCleanerName(
                                  offer.cleanerId,
                                  offer.cleanerName,
                                  cleanerNamesById,
                                  translate("common.notProvided"),
                                ), offer.cleanerId, cleanerSelection.result, language)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="button-row">
                          <button className="button" type="button" disabled={replacingAssignmentId !== null} onClick={() => {
                            setReplacementTargetId(null);
                            setReplacementOfferId("");
                          }}>
                            {translate("common.cancel")}
                          </button>
                          <button
                            className="button button--primary"
                            type="button"
                            disabled={!replacementOfferId || replacingAssignmentId !== null}
                            onClick={() => replaceCleanerAssignment(assignment.id)}
                          >
                            {replacingAssignmentId === assignment.id
                              ? translate("jobs.replacingCleaner")
                              : translate("jobs.confirmReplacement")}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {hasAssignmentAcknowledgment && (
            <p className="form-hint">{translate("jobs.assignmentConfirmationDisclaimer")}</p>
          )}
          {assignmentError && <p className="form-error assignment-error" role="alert">{assignmentError}</p>}
        </section>
      )}
    </>
  );
}
