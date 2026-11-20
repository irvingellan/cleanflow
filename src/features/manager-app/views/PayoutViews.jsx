import { PayoutDirectory, PayoutReview } from "../../payouts/PayoutViews.jsx";
import { WeeklyClosePreview } from "../../weekly-close/WeeklyClosePreview.jsx";
import { formatCreatedAt, formatDate, formatPrice } from "../../../lib/presentation.js";

/** The payout screens of the manager application: weekly close, list and review. */
export function PayoutViews({
  view,
  showPayouts,
  payoutGroups,
  pendingHoursJobs, missingAgreementJobs,
  recentPayouts,
  isLoadingPayouts,
  hasPayoutsError,
  paidPayoutSummary,
  refreshPayouts,
  showWeeklyClose,
  weeklyCloseSelection,
  openWeeklyCloseJob,
  openPayoutReview,
  attachProof,
  getProofUrl,
  translate,
  language,
  selectedPayoutGroup,
  recordPayout,
  showRecordedPayout,
}) {
  return (
    <>
      {view === "weekly-close-preview" && (
        <WeeklyClosePreview onBack={showPayouts} initialSelection={weeklyCloseSelection} onOpenJob={openWeeklyCloseJob} />
      )}

      {view === "payout-list" && (
        <PayoutDirectory
          payoutGroups={payoutGroups}
          pendingHoursJobs={pendingHoursJobs}
          missingAgreementJobs={missingAgreementJobs}
          recentPayouts={recentPayouts}
          isLoading={isLoadingPayouts}
          hasError={hasPayoutsError}
          paidSummary={paidPayoutSummary}
          onRefresh={refreshPayouts}
          onWeeklyClose={showWeeklyClose}
          onReview={openPayoutReview}
          onUploadProof={attachProof}
          onOpenProof={getProofUrl}
          formatPrice={(amount) => formatPrice(amount, translate, language)}
          formatCreatedAt={(date) => formatCreatedAt(date, language)}
        />
      )}

      {view === "payout-review" && selectedPayoutGroup && (
        <PayoutReview
          cleaner={selectedPayoutGroup.cleaner}
          jobs={selectedPayoutGroup.jobs}
          onBack={showPayouts}
          onRecord={recordPayout}
          onUploadProof={attachProof}
          onRecorded={showRecordedPayout}
          formatDate={(date) => formatDate(date, translate, language)}
          formatCreatedAt={(date) => formatCreatedAt(date, language)}
          formatPrice={(amount) => formatPrice(amount, translate, language)}
        />
      )}
    </>
  );
}
