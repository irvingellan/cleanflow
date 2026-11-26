import { ChecklistRunDetail } from "../../checklists/ChecklistRunDetail.jsx";
import { JobDetail } from "../../jobs/JobDetail.jsx";
import { CreateCleaningForm } from "../../jobs/JobForm.jsx";
import { JobsPage } from "../../jobs/JobsPage.jsx";
import { createJobListFilters } from "../../jobs/jobListFilters.js";
import { AssignedCleanerJob, IssueForm, IssueSuccess, OfferCleaners } from "../../jobs/JobWorkflowViews.jsx";

/** The Job screens of the manager application: new service, list, detail with the services pane, checklist, offers and the cleaner workflow. */
export function JobViews({
  view,
  selectedProperty,
  properties,
  isLoadingProperties,
  hasPropertyError,
  setView,
  returnToJobs,
  openJob,
  jobs,
  isLoadingJobs,
  hasJobError,
  showNewJob,
  jobListFilters,
  cleaners,
  jobFilterCleaners,
  setJobListFilters,
  hasMoreJobs,
  isLoadingMoreJobs,
  loadMoreJobs,
  jobsScrollRestore,
  setJobsScrollRestore,
  canManageExcludedRecords,
  showExcludedRecords,
  setShowExcludedRecords,
  selectedJob,
  showServicesPane,
  translate,
  jobDetailInitialFocus,
  directoryCleaners,
  isLoadingCleaners,
  hasCleanerError,
  offersCreatedCount,
  jobOffers,
  isLoadingOffers,
  hasOffersError,
  jobAssignments,
  isLoadingAssignments,
  hasAssignmentsError,
  jobIssues,
  isLoadingIssues,
  hasIssuesError,
  checklistRun,
  isLoadingChecklistRun,
  hasChecklistRunError,
  isCreatingChecklistRun,
  hasCreateChecklistRunError,
  checklistCapability,
  isLoadingChecklistCapability,
  hasChecklistCapabilityError,
  isIssuingChecklistCapability,
  hasIssueChecklistCapabilityError,
  isRevokingChecklistCapability,
  hasRevokeChecklistCapabilityError,
  jobDetailOrigin,
  showDashboard,
  returnToPropertyDetail,
  returnToClientDetail,
  returnToCleanerDetail,
  returnToCleanerAgenda,
  returnToWeeklyClose,
  showOfferCleaners,
  refreshJobOffers,
  refreshJobIssues,
  refreshChecklistRun,
  createAndOpenChecklistRun,
  openChecklistRun,
  refreshChecklistCapability,
  issueJobChecklistCapability,
  prepareChecklistReminder,
  revokeJobChecklistCapability,
  createCleanerOfferLink,
  revokeCleanerOffer,
  assignCleaner,
  decideCleanerOffer,
  reopenCleanerOffer,
  setCleanerSpots,
  markReminderSent,
  assignCleanerDirectly,
  removeCleanerAssignment,
  replaceCleanerAssignment,
  startCleaning,
  completeCleaning,
  saveJobPrices,
  saveJobPriceCorrection,
  saveJobDetails,
  saveJobSchedule,
  offerManualReplacement,
  openAssignedCleanerJob,
  resolveJobIssue,
  saveJobDataProvenance,
  archiveJobRecord,
  removeJobFromWorklist,
  restoreJobRecord,
  isRefreshingChecklistRun,
  approveChecklistRun,
  submitChecklistRunForReview,
  abandonChecklistRunAndCompleteJob,
  returnToJobDetail,
  recordOffersCreated,
}) {
  return (
    <>
      {view === "create-cleaning" && (
        <CreateCleaningForm
          property={selectedProperty}
          properties={properties}
          isLoadingProperties={isLoadingProperties}
          hasPropertyError={hasPropertyError}
          onBack={selectedProperty ? () => setView("property-detail") : returnToJobs}
          onCreated={openJob}
        />
      )}

      {view === "job-list" && (
        <JobsPage
          jobs={jobs}
          isLoading={isLoadingJobs}
          hasError={hasJobError}
          onSelect={openJob}
          onCreate={showNewJob}
          filters={jobListFilters}
          cleaners={jobFilterCleaners}
          properties={properties}
          onFiltersChange={(updates) =>
            setJobListFilters((currentFilters) => ({ ...currentFilters, ...updates }))
          }
          onClearFilters={() => setJobListFilters(createJobListFilters())}
          hasMore={hasMoreJobs}
          isLoadingMore={isLoadingMoreJobs}
          onLoadMore={loadMoreJobs}
          restoreScroll={jobsScrollRestore}
          onScrollRestored={() => setJobsScrollRestore(null)}
          canManageExcluded={canManageExcludedRecords}
          showExcluded={showExcludedRecords}
          onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
        />
      )}

      {view === "job-detail" && selectedJob && (
        <div className={`cf-split${showServicesPane ? " cf-split--with-list" : ""}`}>
          {showServicesPane && (
            <aside className="cf-split__list" aria-label={translate("navigation.jobs")}>
            <JobsPage
              variant="pane"
              selectedJobId={selectedJob.id}
              jobs={jobs}
              isLoading={isLoadingJobs}
              hasError={hasJobError}
              onSelect={openJob}
              onCreate={showNewJob}
              filters={jobListFilters}
              cleaners={jobFilterCleaners}
              properties={properties}
              onFiltersChange={(updates) =>
                setJobListFilters((currentFilters) => ({ ...currentFilters, ...updates }))
              }
              onClearFilters={() => setJobListFilters(createJobListFilters())}
              hasMore={hasMoreJobs}
              isLoadingMore={isLoadingMoreJobs}
              onLoadMore={loadMoreJobs}
              canManageExcluded={canManageExcludedRecords}
              showExcluded={showExcludedRecords}
              onToggleExcluded={() => setShowExcludedRecords((current) => !current)}
            />
            </aside>
          )}
          <div className="cf-split__detail">
        <JobDetail
          job={selectedJob}
          initialFocus={jobDetailInitialFocus}
          property={properties.find((candidate) => candidate.id === selectedJob.propertyId) || null}
          knownCleaners={directoryCleaners}
          availableCleaners={cleaners}
          isLoadingCleaners={isLoadingCleaners}
          hasCleanerError={hasCleanerError}
          offersCreatedCount={offersCreatedCount}
          offers={jobOffers}
          isLoadingOffers={isLoadingOffers}
          hasOffersError={hasOffersError}
          assignments={jobAssignments}
          isLoadingAssignments={isLoadingAssignments}
          hasAssignmentsError={hasAssignmentsError}
          issues={jobIssues}
          isLoadingIssues={isLoadingIssues}
          hasIssuesError={hasIssuesError}
          checklistRun={checklistRun}
          isLoadingChecklistRun={isLoadingChecklistRun}
          hasChecklistRunError={hasChecklistRunError}
          isCreatingChecklistRun={isCreatingChecklistRun}
          hasCreateChecklistRunError={hasCreateChecklistRunError}
          checklistCapability={checklistCapability}
          isLoadingChecklistCapability={isLoadingChecklistCapability}
          hasChecklistCapabilityError={hasChecklistCapabilityError}
          isIssuingChecklistCapability={isIssuingChecklistCapability}
          hasIssueChecklistCapabilityError={hasIssueChecklistCapabilityError}
          isRevokingChecklistCapability={isRevokingChecklistCapability}
          hasRevokeChecklistCapabilityError={hasRevokeChecklistCapabilityError}
          onBack={{
            dashboard: showDashboard,
            property: returnToPropertyDetail,
            client: returnToClientDetail,
            cleaner: returnToCleanerDetail,
            "cleaner-agenda": returnToCleanerAgenda,
            "weekly-close": returnToWeeklyClose,
          }[jobDetailOrigin] ?? returnToJobs}
          onOfferToCleaners={showOfferCleaners}
          onRefreshOffers={refreshJobOffers}
          onRefreshIssues={refreshJobIssues}
          onRefreshChecklistRun={refreshChecklistRun}
          onCreateChecklistRun={createAndOpenChecklistRun}
          onOpenChecklistRun={openChecklistRun}
          onRefreshChecklistCapability={refreshChecklistCapability}
          onIssueChecklistCapability={issueJobChecklistCapability}
          onPrepareChecklistReminder={prepareChecklistReminder}
          onRevokeChecklistCapability={revokeJobChecklistCapability}
          onCreatePublicOfferLink={createCleanerOfferLink}
          onRevokeAutomaticOffer={revokeCleanerOffer}
          onAssignCleaner={assignCleaner}
          onDecideOffer={decideCleanerOffer}
          onReopenOffer={reopenCleanerOffer}
          onSetCleanerSpots={setCleanerSpots}
          onMarkReminderSent={markReminderSent}
          onAssignCleanerDirectly={assignCleanerDirectly}
          onRemoveAssignment={removeCleanerAssignment}
          onReplaceAssignment={replaceCleanerAssignment}
          onStartCleaning={startCleaning}
          onCompleteCleaning={completeCleaning}
          onUpdatePrices={saveJobPrices}
          onCorrectPrice={saveJobPriceCorrection}
          onUpdateDetails={saveJobDetails}
          onUpdateSchedule={saveJobSchedule}
          onOfferManualReplacement={offerManualReplacement}
          onSimulateAssignedCleaner={openAssignedCleanerJob}
          onResolveIssue={resolveJobIssue}
          onSaveDataProvenance={saveJobDataProvenance}
          canRestore={canManageExcludedRecords}
          onArchive={async () => { await archiveJobRecord(); removeJobFromWorklist(selectedJob.id); returnToJobs(); }}
          onRestore={restoreJobRecord}
        />
                  </div>
        </div>
      )}

      {view === "checklist-run" && selectedJob && checklistRun && (
        <ChecklistRunDetail
          job={selectedJob}
          checklistRun={checklistRun}
          isRefreshing={isRefreshingChecklistRun}
          hasRefreshError={hasChecklistRunError}
          assignments={jobAssignments}
          onRefresh={() => refreshChecklistRun(selectedJob, { manual: true })}
          onApproveAndComplete={approveChecklistRun}
          onSubmitForReview={submitChecklistRunForReview}
          onAbandonAndComplete={abandonChecklistRunAndCompleteJob}
          onBack={() => setView("job-detail")}
        />
      )}

      {view === "offer-cleaners" && selectedJob && (
        <OfferCleaners
          key={selectedJob.id}
          job={selectedJob}
          cleaners={cleaners}
          isLoading={isLoadingCleaners}
          hasError={hasCleanerError}
          canOfferAutomatically={!isLoadingAssignments && !isLoadingOffers && !hasAssignmentsError && !hasOffersError
            && jobOffers.length === 0 && jobAssignments.length === 0}
          existingOfferCleanerIds={jobOffers.map((offer) => offer.cleanerId || offer.id)}
          property={properties.find((candidate) => candidate.id === selectedJob.propertyId) || null}
          onBack={returnToJobDetail}
          onSent={(count, updatedJob) => {
            recordOffersCreated(count, updatedJob);
            returnToJobDetail();
          }}
        />
      )}

      {view === "cleaner-job" && selectedJob && (
        <AssignedCleanerJob
          job={selectedJob}
          onBackToJob={returnToJobDetail}
          onStartCleaning={startCleaning}
          onCompleteCleaning={completeCleaning}
          onReportIssue={() => setView("issue-form")}
        />
      )}

      {view === "issue-form" && selectedJob && (
        <IssueForm
          job={selectedJob}
          onBack={() => setView("cleaner-job")}
          onSubmitted={() => setView("issue-success")}
        />
      )}

      {view === "issue-success" && selectedJob && (
        <IssueSuccess onBackToCleaning={() => setView("cleaner-job")} />
      )}
    </>
  );
}
