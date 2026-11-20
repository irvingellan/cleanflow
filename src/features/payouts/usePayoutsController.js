import { useEffect, useRef, useState } from "react";
import { currentOrganizationId } from "../../services/organization/currentOrganization.js";
import { getAllCleaners } from "../cleaners/cleanerService.js";
import { getPayoutProofUrl, uploadPayoutProof } from "./payoutProofService.js";
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
  const organizationId = currentOrganizationId();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [payoutGroups, setPayoutGroups] = useState([]);
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
        getUnpaidCompletedJobs(),
        getAllCleaners(),
        getRecentPayouts(),
      ]);
      setPayoutGroups(groupUnpaidJobsByCleaner(unpaidJobs, cleaners));
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

  async function attachProof(payoutId, file, onProgress) {
    // Recording a payout can finish after the manager session that started it has closed.
    if (!mounted.current || currentOrganizationId() !== organizationId) {
      throw Object.assign(new Error("The active company changed."), { code: "organization-changed" });
    }
    return uploadPayoutProof({ payoutId, file, onProgress });
  }

  return {
    directory: {
      payoutGroups,
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
