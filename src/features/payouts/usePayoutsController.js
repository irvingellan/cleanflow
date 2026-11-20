import { useEffect, useState } from "react";
import { getAllCleaners } from "../cleaners/cleanerService.js";
import { getPayoutProofUrl, uploadPayoutProof } from "./payoutProofService.js";
import { missingAgreementReview, payoutNeedsHoursReview } from "./payoutShares.js";
import { groupUnpaidJobsByCleaner } from "./payoutGrouping.js";
import {
  getRecentPayouts,
  getUnpaidCompletedJobs,
  recordPayout,
} from "./payoutService.js";

/**
 * Coordinates Payout screen state while leaving transactions and Storage work
 * inside the existing Payout services.
 */
export function usePayoutsController({ view }) {
  const [payoutGroups, setPayoutGroups] = useState([]);
  const [pendingHoursJobs, setPendingHoursJobs] = useState([]);
  const [missingAgreementJobs, setMissingAgreementJobs] = useState([]);
  const [recentPayouts, setRecentPayouts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [paidSummary, setPaidSummary] = useState(null);

  async function refresh() {
    setIsLoading(true);
    setHasError(false);

    try {
      const [unpaidJobs, cleaners, payouts] = await Promise.all([
        getUnpaidCompletedJobs({ includePendingHours: true }),
        getAllCleaners(),
        getRecentPayouts(),
      ]);
      setPayoutGroups(groupUnpaidJobsByCleaner(unpaidJobs, cleaners));
      setPendingHoursJobs(unpaidJobs.filter(payoutNeedsHoursReview));
      setMissingAgreementJobs(unpaidJobs.filter(job => !payoutNeedsHoursReview(job) && missingAgreementReview(job)));
      setRecentPayouts(payouts);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (view === "payout-list") {
      refresh();
    }
  }, [view]);

  function resetPayoutView() {
    setSelectedGroup(null);
    setPaidSummary(null);
  }

  function openReview(group) {
    setSelectedGroup(group);
    setPaidSummary(null);
  }

  function recordPayoutComplete(payout) {
    setSelectedGroup(null);
    setPaidSummary({
      amount: payout.amount,
      jobCount: payout.jobIds.length,
    });
  }

  function attachProof(payoutId, file, onProgress) {
    return uploadPayoutProof({ payoutId, file, onProgress });
  }

  return {
    directory: {
      payoutGroups,
      pendingHoursJobs, missingAgreementJobs,
      recentPayouts,
      isLoading,
      hasError,
      refresh,
    },
    review: {
      selectedGroup,
      paidSummary,
      resetPayoutView,
      openReview,
      recordPayout,
      recordPayoutComplete,
    },
    proof: {
      attachProof,
      getProofUrl: getPayoutProofUrl,
    },
  };
}
