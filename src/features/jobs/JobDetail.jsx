import { JobDetailSection, revealJobDetailSection } from "./JobDetailSection.jsx";
import { useEffect, useRef, useState } from "react";
import { JobIntentLayer } from "./JobIntentLayer.jsx";
import { JobHistorySection } from "./JobHistorySection.jsx";
import { JobFinancialSection } from "./JobFinancialSection.jsx";
import { JobIssuesSection } from "./JobIssuesSection.jsx";
import { JobDetailsSection } from "./JobDetailsSection.jsx";
import { JobChecklistSection } from "./JobChecklistSection.jsx";
import { JobReminderPreview } from "./JobReminderPreview.jsx";
import { JobAssignmentRoster } from "./JobAssignmentRoster.jsx";
import { JobOffersSection } from "./JobOffersSection.jsx";
import { useJobPriceEdit } from "./useJobPriceEdit.js";
import { useIssueResolution } from "./useIssueResolution.js";
import { jobDetailFormValues, useJobDetailsEdit } from "./useJobDetailsEdit.js";
import { useJobScheduleEdit } from "./useJobScheduleEdit.js";
import { useJobRosterEdit } from "./useJobRosterEdit.js";
import { useJobExecution } from "./useJobExecution.js";
import { JobDetailHead } from "./JobDetailHead.jsx";
import { InterestDecisionPanel, decidableInterestedOffers } from "./InterestDecisionPanel.jsx";
import { offerManagerDecisions, requiredCleanerCount } from "./offerSlots.js";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";
import { jobScheduleAvailability } from "./jobScheduleAvailability.js";
import { JobScheduleConfirmation } from "./JobScheduleConfirmation.jsx";
import {
  currentScheduleConfirmations, currentScheduleRevision, scheduleConfirmationMessage,
} from "./scheduleConfirmation.js";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { getCleanerContactsById } from "../cleaners/cleanerService.js";
import { filterCleanersByName } from "../cleaners/cleanerSearch.js";
import { sortCleanerOptions, useCleanerSelectionContext } from "./CleanerSelectionContext.jsx";
import { normalizeCleanerPreferredLanguage } from "../cleaners/cleanerProfile.js";
import { getAssignmentAcknowledgmentState } from "./assignmentPresentation.js";
import { canExtendAutomaticOfferJob, isAutomaticOfferJob } from "./automaticOffers.js";
import { canAssignCleanerDirectly, canDirectlyFillJob } from "./assignmentService.js";
import {
  formatCreatedAt,
} from "../../lib/presentation.js";
import { translateInLanguage, useTranslation } from "../../i18n/translations.js";
import {
  canManageAssignmentAwareOffers,
  getJobGrossMargin,
  getAssignedCleanerIds,
  isAssignmentAwareJob,
} from "./jobCompatibility.js";
import {
  buildCleanerReminderMessage,
  copyCleanerReminderMessage,
  reusableAssignmentOfferUrl,
} from "./cleanerReminderMessage.js";
import {
  buildCleanerOfferMessage,
  getOfferCompensationSuggestion,
  parseOfferCompensationInput,
} from "./offerCompensation.js";
import { buildWhatsAppHandoffUrl } from "./whatsappHandoff.js";

export function JobDetail({
  job,
  property,
  knownCleaners,
  availableCleaners = [],
  isLoadingCleaners = false,
  hasCleanerError = false,
  offers,
  isLoadingOffers,
  hasOffersError,
  offersCreatedCount = null,
  assignments,
  isLoadingAssignments,
  hasAssignmentsError,
  issues,
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
  onBack,
  onOfferToCleaners,
  onRefreshOffers,
  onRefreshIssues,
  onRefreshChecklistRun,
  onCreateChecklistRun,
  onOpenChecklistRun,
  onRefreshChecklistCapability,
  onIssueChecklistCapability,
  onPrepareChecklistReminder,
  onRevokeChecklistCapability,
  onCreatePublicOfferLink,
  onRevokeAutomaticOffer,
  onAssignCleaner,
  onDecideOffer,
  onReopenOffer,
  onSetCleanerSpots,
  onMarkReminderSent,
  onAssignCleanerDirectly,
  onRemoveAssignment,
  onReplaceAssignment,
  onStartCleaning,
  onCompleteCleaning,
  onUpdatePrices,
  onUpdateDetails,
  onUpdateSchedule,
  onOfferManualReplacement,
  onSimulateAssignedCleaner,
  onResolveIssue,
  onSaveDataProvenance,
  onArchive,
  onRestore,
  canRestore,
  // Optional entry point, e.g. a manager notice about a cleaner's interest:
  // "interest" focuses the decision panel (or Offers when none is pending).
  initialFocus = null,
}) {
  const { language, translate } = useTranslation();
  const currentJobIdRef = useRef(job.id);
  currentJobIdRef.current = job.id;
  const [resolvedCleanerNames, setResolvedCleanerNames] = useState({});
  const [resolvedCleanerPhones, setResolvedCleanerPhones] = useState({});
  const [resolvedCleanerLanguages, setResolvedCleanerLanguages] = useState({});
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [decidingOfferId, setDecidingOfferId] = useState(null);
  const [isSavingSpots, setIsSavingSpots] = useState(false);
  const [reminderLogState, setReminderLogState] = useState(null);
  const {
    isDirectAssignmentOpen, setIsDirectAssignmentOpen, directCleanerSearch, setDirectCleanerSearch, directCleanerId,
    setDirectCleanerId, isAssigningDirectly, removingAssignmentId, replacementTargetId, setReplacementTargetId,
    replacingAssignmentId, replacementOfferId, setReplacementOfferId, assignCleanerDirectly, removeCleanerAssignment,
    replaceCleanerAssignment,
  } = useJobRosterEdit({
    job, translate, availableCleaners, onAssignCleanerDirectly, onRemoveAssignment, onReplaceAssignment,
    setAssignmentError, currentJobIdRef,
  });
  const {
    resolvingIssueId, resolutionNote, setResolutionNote, isResolvingIssue, resolutionError,
    openResolutionForm, closeResolutionForm, resolveSelectedIssue,
  } = useIssueResolution({ translate, onResolveIssue });
  const [publicOfferLink, setPublicOfferLink] = useState(null);
  const [isCreatingPublicOfferLinkFor, setIsCreatingPublicOfferLinkFor] =
    useState(null);
  const [publicOfferLinkError, setPublicOfferLinkError] = useState(null);
  const [revokingOfferId, setRevokingOfferId] = useState(null);
  const [revokeOfferErrorId, setRevokeOfferErrorId] = useState(null);
  const [editingOfferCompensationFor, setEditingOfferCompensationFor] = useState(null);
  const [offerCompensationInput, setOfferCompensationInput] = useState("");
  const [offerCompensationErrorFor, setOfferCompensationErrorFor] = useState(null);
  const [copiedOfferMessageId, setCopiedOfferMessageId] = useState(null);
  const [offerMessageCopyErrorId, setOfferMessageCopyErrorId] = useState(null);
  const {
    isStartingCleaning, hasStartCleaningError, isCompletingCleaning, hasCompleteCleaningError,
    isCompletionConfirmationVisible, setIsCompletionConfirmationVisible, startCleaning, completeCleaning,
  } = useJobExecution({ job, onStartCleaning, onCompleteCleaning, currentJobIdRef });
  const [intentNotice, setIntentNotice] = useState(null);
  const scheduleSectionRef = useRef(null);
  const assignmentSectionRef = useRef(null);
  const checklistSectionRef = useRef(null);
  const completionSectionRef = useRef(null);
  const reminderSectionRef = useRef(null);
  const historySectionRef = useRef(null);
  const issuesSectionRef = useRef(null);
  const [isPreparingReminderChecklist, setIsPreparingReminderChecklist] = useState(false);
  const [hasReminderChecklistError, setHasReminderChecklistError] = useState(false);
  const {
    isEditingPrices, setIsEditingPrices, priceValues, setPriceValues, isSavingPrices, priceSaveError, setPriceSaveError,
    hasSavedPrices, startPriceEdit, savePrices,
  } = useJobPriceEdit({ job, translate, onUpdatePrices });
  const {
    isEditingJobDetails, setIsEditingJobDetails, jobDetailValues, setJobDetailValues, isSavingJobDetails,
    jobDetailsSaveError, setJobDetailsSaveError, hasSavedJobDetails, startJobDetailsEdit, saveJobDetails,
  } = useJobDetailsEdit({ job, translate, language, onUpdateDetails });
  const scheduleMessage = (key, values) => scheduleConfirmationMessage(language, key, values);
  const scheduleBlock = jobScheduleAvailability(job, {
    run: checklistRun, loading: isLoadingChecklistRun, error: hasChecklistRunError,
  });
  const canReschedule = !scheduleBlock;
  const {
    isEditingJobSchedule, setIsEditingJobSchedule, jobScheduleValues, setJobScheduleValues, isSavingJobSchedule,
    jobScheduleSaveError, setJobScheduleSaveError, hasSavedJobSchedule, scheduleCommunicationMayBeStale, needsScheduleReload,
    scheduleRevisionConflict, startJobScheduleEdit, saveJobSchedule,
  } = useJobScheduleEdit({
    job, translate, onUpdateSchedule, canReschedule, scheduleMessage, currentJobIdRef, setIntentNotice,
  });
  const [copiedCleanerId, setCopiedCleanerId] = useState(null);
  const [copyMessageErrorCleanerId, setCopyMessageErrorCleanerId] = useState(null);
  const [reminderPreview, setReminderPreview] = useState(null);
  const [isCopyingReminder, setIsCopyingReminder] = useState(false);
  const offersSectionRef = useRef(null);
  const didFocusNewOffersRef = useRef(false);
  const createdAt = formatCreatedAt(job.createdAt, language);
  const assignedAt = formatCreatedAt(job.assignedAt, language);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isAssignmentAware = isAssignmentAwareJob(job);
  const automaticOfferJob = isAutomaticOfferJob(job);
  const assignedCleanerIds = getAssignedCleanerIds(job);
  const activeAssignments = (assignments || []).filter(
    (assignment) => assignment.isActive === true,
  );
  const hasAssignmentAcknowledgment = activeAssignments.some(
    (assignment) => ["AWAITING_CONFIRMATION", "CONFIRMED"].includes(
      getAssignmentAcknowledgmentState(assignment, offers)),
  );
  const linkedProperty = property?.id === job.propertyId ? property : null;
  const sensitivePropertyDetails = [
    ["jobs.reminderParking", linkedProperty?.garageParking],
    ["jobs.reminderAccessInstructions", linkedProperty?.accessInstructions],
    ["jobs.reminderKeyCodeInfo", linkedProperty?.keyCodeInfo],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  const isAssigned = Boolean(
    job.assignedCleanerId ||
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(
        job.operationalStatus,
      ),
  );
  const canSimulateAssignedCleaner = !isAssignmentAware && [
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
  ].includes(job.operationalStatus);
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";
  const canUseCompletionControls = !job.archivedAt
    && ["ASSIGNED", "IN_PROGRESS"].includes(job.operationalStatus);
  const grossMargin = getJobGrossMargin(job);
  const canEditRoster =
    isAssignmentAware &&
    ["OFFERED", "ASSIGNED"].includes(job.operationalStatus);
  const canDirectAssign = canDirectlyFillJob(job);
  const cleanerSelection = useCleanerSelectionContext(job, (canDirectAssign && isDirectAssignmentOpen) || (canEditRoster && Boolean(replacementTargetId)));
  const directCleanerOptions = sortCleanerOptions(
    filterCleanersByName(availableCleaners.filter((cleaner) => canAssignCleanerDirectly(job, cleaner)), directCleanerSearch),
    cleanerSelection.result,
  );
  const canManageOffers = isAssignmentAware
    ? canManageAssignmentAwareOffers(job)
    : !isCompleted;
  // An assignment-aware Job can still need additional cleaners before work starts.
  // An open automatic batch can also receive more cleaners (server-checked).
  const canOfferToCleaners = canManageOffers && (!automaticOfferJob || canExtendAutomaticOfferJob(job));
  const knownCleanerNames = Object.fromEntries(
    knownCleaners.map((cleaner) => [cleaner.id, cleaner.name]),
  );
  const knownCleanerPhones = Object.fromEntries(
    knownCleaners.map((cleaner) => [cleaner.id, cleaner.phone]),
  );
  const knownCleanerLanguages = Object.fromEntries(
    knownCleaners.map((cleaner) => [cleaner.id, cleaner.preferredLanguage]),
  );
  const cleanerNamesById = { ...resolvedCleanerNames, ...knownCleanerNames };
  const cleanerPhonesById = { ...resolvedCleanerPhones, ...knownCleanerPhones };
  const cleanerLanguagesById = { ...resolvedCleanerLanguages, ...knownCleanerLanguages };
  const scheduleRevision = currentScheduleRevision(job);
  const scheduleResponses = currentScheduleConfirmations(job);
  const replacementPointer = job.manualReplacementOffer?.scheduleRevision === scheduleRevision
    ? job.manualReplacementOffer : null;
  const knownReplacementOffer = replacementPointer && offers.find((offer) =>
    offer.id === replacementPointer.offerId && offer.offerKind === "MANUAL_REPLACEMENT"
    && offer.cleanerId === replacementPointer.cleanerId
    && ["PENDING", "INTERESTED", "DECLINED"].includes(offer.status));
  const replacementOffer = knownReplacementOffer
    && (knownReplacementOffer.status === "DECLINED" || knownReplacementOffer.publicOfferExpiresAt?.toMillis?.() > Date.now())
    ? knownReplacementOffer : null;
  const canOfferReplacement = Boolean(onOfferManualReplacement && canDirectAssign && !isLoadingOffers && !hasOffersError
    && automaticOfferJob && job.automaticOfferBatch?.version === 2 && job.startedAt == null
    && scheduleResponses.some(({ state }) => state === "DECLINED")
    && (!replacementPointer || (knownReplacementOffer && (!replacementOffer || replacementOffer.status === "DECLINED"))));
  const cleanerLanguageFor = (cleanerId) =>
    normalizeCleanerPreferredLanguage(cleanerLanguagesById[cleanerId]);
  const cleanerLanguageLabelFor = (cleanerId) =>
    translate(
      `cleanerLanguage.${{
        en: "english",
        pt: "portuguese",
        es: "spanish",
      }[cleanerLanguageFor(cleanerId)]}`,
    );
  const unresolvedCleanerIds = [
    job.assignedCleanerId,
    ...activeAssignments.map((assignment) => assignment.cleanerId),
    ...offers.map((offer) => offer.cleanerId),
    ...scheduleResponses.map((response) => response.cleanerId),
  ]
    .filter(Boolean)
    .filter(
      (cleanerId, index, cleanerIds) =>
        cleanerIds.indexOf(cleanerId) === index &&
        !knownCleanerNames[cleanerId],
    )
    .sort();
  const cleanerLookupKey = unresolvedCleanerIds.join(",");
  const assignedCleanerName = currentCleanerName(
    job.assignedCleanerId,
    job.assignedCleanerName,
    cleanerNamesById,
    translate("common.notProvided"),
  );
  const sortedOffers = [...offers].sort((firstOffer, secondOffer) =>
    (firstOffer.cleanerName || "").localeCompare(secondOffer.cleanerName || ""),
  );
  const sortedIssues = [...issues].sort((firstIssue, secondIssue) => {
    const firstCreatedAt = firstIssue.createdAt?.toMillis?.() || 0;
    const secondCreatedAt = secondIssue.createdAt?.toMillis?.() || 0;

    return secondCreatedAt - firstCreatedAt;
  });
  // FB03: interested cleaners the manager can confirm now, using exactly the
  // same availability as the Offers "Assign" button (see InterestDecisionPanel).
  const pendingInterest = decidableInterestedOffers({
    job, offers: sortedOffers, isAssignmentAware, assignedCleanerIds, isAssigned,
    canManageOffers, canEditRoster, isLoadingOffers, hasOffersError,
  });
  const interestSectionRef = useRef(null);
  const lifecyclePresentation = serviceLifecyclePresentation({
    job, checklistRun, capability: checklistCapability,
    offers, offersLoading: isLoadingOffers, offersError: hasOffersError,
    assignments,
    runLoading: isLoadingChecklistRun, runError: hasChecklistRunError,
    capabilityLoading: isLoadingChecklistCapability, capabilityError: hasChecklistCapabilityError,
    issues, issuesLoading: isLoadingIssues, issuesError: hasIssuesError,
  });
  const summaryCleanerIds = isAssignmentAware ? assignedCleanerIds : [job.assignedCleanerId].filter(Boolean);
  const summaryCleanerNames = summaryCleanerIds.map((id) => currentCleanerName(
    id, activeAssignments.find((assignment) => assignment.cleanerId === id)?.cleanerName,
    cleanerNamesById, translate("common.notProvided"),
  ));
  const eligibleReplacementOffers = sortedOffers.filter(
    (offer) =>
      offer.status === "INTERESTED" &&
      !offer.managerDecision &&
      offer.cleanerId &&
      !assignedCleanerIds.includes(offer.cleanerId),
  );
  const reminderCleanerStillAssigned = reminderPreview
    ? isAssignmentAware
      ? job.operationalStatus === "ASSIGNED" && activeAssignments.some(
        (assignment) => assignment.cleanerId === reminderPreview.cleanerId,
      )
      : job.operationalStatus === "ASSIGNED" && (
        job.assignedCleanerId === reminderPreview.cleanerId ||
        (!job.assignedCleanerId && reminderPreview.cleanerId === "legacy-assigned-cleaner" && job.assignedCleanerName)
      )
    : false;
  const reminderChecklistCapabilityCurrent = Boolean(reminderPreview?.includeChecklist
    && reminderPreview.checklistUrl
    && reminderPreview.checklistIssuedAt
    && checklistRun?.status === "DRAFT"
    && checklistCapability?.state === "ACTIVE"
    && checklistCapability.cleanerId === reminderPreview.cleanerId
    && checklistCapability.issuedAt
    && checklistCapability.issuedAt === reminderPreview.checklistIssuedAt);
  const reminderReadyToSend = Boolean(reminderCleanerStillAssigned
    && (!reminderPreview?.includeChecklist || reminderChecklistCapabilityCurrent)
    && !isPreparingReminderChecklist);
  const canPrepareChecklistForReminder = Boolean(reminderCleanerStillAssigned
    && reminderPreview?.cleanerId !== "legacy-assigned-cleaner"
    && !isLoadingChecklistRun && !hasChecklistRunError
    && (!checklistRun || checklistRun.status === "DRAFT")
    && !isLoadingChecklistCapability && !hasChecklistCapabilityError);
  const reminderPreviewAssignment = reminderPreview?.assignmentId
    ? activeAssignments.find((assignment) => assignment.id === reminderPreview.assignmentId)
    : null;
  const reminderPreviewOffer = reminderPreviewAssignment
    ? offers.find((offer) => offer.id === reminderPreviewAssignment.sourceOfferId)
    : null;
  const reminderPreviewOfferUrl = reusableAssignmentOfferUrl({
    job,
    assignment: reminderPreviewAssignment,
    offer: reminderPreviewOffer,
    link: publicOfferLink,
    origin: typeof window === "undefined" ? undefined : window.location.origin,
  });
  const reminderPreviewMessage = reminderPreview
    ? buildCleanerReminderMessage({
      cleanerName: reminderPreview.cleanerName,
      propertyName: job.propertyName || translate("properties.unnamed"),
      scheduledDate: job.scheduledDate,
      scheduledStart: job.scheduledStart,
      propertyDetails: linkedProperty,
      includeSensitiveAccess: reminderPreview.includeSensitiveAccess,
      assignmentOfferUrl: reminderPreviewOfferUrl,
      checklistUrl: reminderChecklistCapabilityCurrent ? reminderPreview.checklistUrl : null,
      language: cleanerLanguageFor(reminderPreview.cleanerId),
      translate: (key, replacements) => translateInLanguage(
        cleanerLanguageFor(reminderPreview.cleanerId),
        key,
        replacements,
      ),
    })
    : "";
  const reminderWhatsAppUrl = reminderPreview && reminderReadyToSend
    ? buildWhatsAppHandoffUrl(cleanerPhonesById[reminderPreview.cleanerId], reminderPreviewMessage)
    : null;

  useEffect(() => {
    if (offersCreatedCount === null) {
      didFocusNewOffersRef.current = false;
      return;
    }
    if (didFocusNewOffersRef.current || isLoadingOffers || hasOffersError) return;

    const offersSection = offersSectionRef.current;
    if (!offersSection) return;
    didFocusNewOffersRef.current = true;
    revealJobDetailSection(offersSection);
    offersSection.focus({ preventScroll: true });
    offersSection.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [offersCreatedCount, isLoadingOffers, hasOffersError]);
  const initialFocusJobRef = useRef(null);
  useEffect(() => {
    if (initialFocus !== "interest") {
      initialFocusJobRef.current = null;
      return;
    }
    if (initialFocusJobRef.current === job.id || isLoadingOffers) return;
    initialFocusJobRef.current = job.id;
    focusIntentSection(pendingInterest.length ? interestSectionRef : offersSectionRef);
  });

  // Suggestions are presentation, not a second authorization/state machine.
  const primaryIntent = job.archivedAt || isCompleted
    ? { intent: "history", label: "jobs.intentHistory" }
    : isLoadingChecklistRun || hasChecklistRunError
      ? { intent: "checklist", label: "jobs.intent.checklist" }
      : checklistRun
        ? { intent: "checklist", label: checklistRun.status === "READY_FOR_REVIEW"
          ? "jobs.intentReview" : checklistRun.status === "DRAFT"
            ? "jobs.intentExistingChecklist" : "checklists.open" }
        : (job.operationalStatus === "UNASSIGNED" || job.operationalStatus === "OFFERED") && pendingInterest.length
          ? { intent: "interest", label: pendingInterest.length === 1 ? "jobs.intentConfirmInterested" : "jobs.intentReviewInterested" }
          : job.operationalStatus === "OFFERED" && canManageOffers
            ? { intent: "offers", label: isLoadingOffers || hasOffersError ? "jobs.intentSeeOffers" : "jobs.intentAwaitingResponses" }
            : job.operationalStatus === "UNASSIGNED" && canOfferToCleaners
              ? { intent: "offers", label: "offers.offerCleaningToCleaners" }
              : job.operationalStatus === "UNASSIGNED" || job.operationalStatus === "OFFERED"
                ? { intent: "assignment", label: "jobs.assignCleanerDirectly" }
          : job.operationalStatus === "ASSIGNED"
            ? { intent: "reminder", label: "jobs.intent.reminder" }
            : { intent: "completion", label: "jobs.intent.completion" };

  function focusIntentSection(ref) {
    // Wait for an existing form/preview to render; ignore a switched/unmounted Job.
    const jobId = job.id;
    requestAnimationFrame(() => {
      if (currentJobIdRef.current !== jobId) return;
      revealJobDetailSection(ref.current);
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    });
  }

  function chooseJobIntent(intent) {
    setIntentNotice(null);
    if (intent === "history") {
      setIntentNotice({ key: "jobs.intentHistorical" });
      if (!isLoadingChecklistRun && !hasChecklistRunError && checklistRun) {
        revealJobDetailSection(historySectionRef.current);
        onOpenChecklistRun?.();
      }
      else focusIntentSection(historySectionRef);
      return;
    }
    if (intent === "schedule") {
      if (!canReschedule) {
        setIntentNotice({ key: scheduleBlock, safe: Boolean(checklistRun) && !isLoadingChecklistRun && !hasChecklistRunError });
        return;
      }
      if (!isEditingJobSchedule) startJobScheduleEdit();
      focusIntentSection(scheduleSectionRef);
      return;
    }
    if (intent === "checklist") {
      // Existing controls own loading/error/create/open behavior. No auto-creation.
      if (!isLoadingChecklistRun && !hasChecklistRunError && checklistRun) {
        revealJobDetailSection(checklistSectionRef.current);
        onOpenChecklistRun?.();
      }
      else focusIntentSection(checklistSectionRef);
      return;
    }
    if (job.archivedAt || isCompleted) {
      setIntentNotice({ key: "jobs.intentHistorical", safe: Boolean(checklistRun) });
      return;
    }
    if (intent === "interest") {
      if (pendingInterest.length) focusIntentSection(interestSectionRef);
      else focusIntentSection(offersSectionRef);
      return;
    }
    if (intent === "offers") {
      focusIntentSection(offersSectionRef);
      return;
    }
    if (intent === "assignment") {
      if (canDirectAssign) setIsDirectAssignmentOpen(true);
      if (canDirectAssign || canEditRoster) focusIntentSection(assignmentSectionRef);
      else if (canOfferToCleaners && !isAssignmentAware) focusIntentSection(offersSectionRef);
      else setIntentNotice({ key: "jobs.intentRosterUnavailable", safe: isAssignmentAware ? "roster" : null });
      return;
    }
    if (intent === "reminder") {
      if (job.operationalStatus !== "ASSIGNED") {
        setIntentNotice({ key: "jobs.intentReminderUnavailable", safe: canDirectAssign ? "assignment" : null });
        return;
      }
      if (isAssignmentAware) {
        if (isLoadingAssignments || hasAssignmentsError) {
          focusIntentSection(assignmentSectionRef);
          return;
        }
        if (activeAssignments.length !== 1) {
          setIntentNotice({ key: "jobs.intentSelectReminderCleaner", safe: "roster" });
          return;
        }
        const assignment = activeAssignments[0];
        openReminderPreview(assignment.cleanerId, cleanerNamesById[assignment.cleanerId] || translate("common.notProvided"), assignment.id);
      } else if (job.assignedCleanerId || job.assignedCleanerName) {
        openReminderPreview(job.assignedCleanerId || "legacy-assigned-cleaner", assignedCleanerName);
      } else {
        setIntentNotice({ key: "jobs.intentReminderUnavailable" });
        return;
      }
      focusIntentSection(reminderSectionRef);
      return;
    }
    if (intent === "completion") {
      if (!canUseCompletionControls) {
        setIntentNotice({ key: "jobs.intentCompletionUnavailable", safe: canDirectAssign ? "assignment" : null });
      } else if (isLoadingChecklistRun || hasChecklistRunError) {
        focusIntentSection(completionSectionRef);
      } else if (checklistRun) {
        setIntentNotice({ key: checklistRun.status === "DRAFT" ? "jobs.completionDraftOptions"
          : checklistRun.status === "READY_FOR_REVIEW" ? "jobs.completionRequiresChecklistReview"
            : "jobs.completionChecklistUnavailable", safe: true });
      } else {
        setIsCompletionConfirmationVisible(true);
        focusIntentSection(completionSectionRef);
      }
    }
  }

  useEffect(() => {
    let isCurrent = true;

    if (!cleanerLookupKey) {
      setResolvedCleanerNames({});
      setResolvedCleanerPhones({});
      setResolvedCleanerLanguages({});
      return () => {
        isCurrent = false;
      };
    }

    async function loadCleanerContacts() {
      try {
        // Resolve only the manager-facing identity/contact fields needed for a handoff.
        const cleanerContacts = await getCleanerContactsById(unresolvedCleanerIds);

        if (isCurrent) {
          setResolvedCleanerNames(Object.fromEntries(
            Object.entries(cleanerContacts).map(([id, contact]) => [id, contact.name]),
          ));
          setResolvedCleanerPhones(Object.fromEntries(
            Object.entries(cleanerContacts).map(([id, contact]) => [id, contact.phone]),
          ));
          setResolvedCleanerLanguages(Object.fromEntries(
            Object.entries(cleanerContacts).map(([id, contact]) => [id, contact.preferredLanguage]),
          ));
        }
      } catch {
        if (isCurrent) {
          setResolvedCleanerNames({});
          setResolvedCleanerPhones({});
          setResolvedCleanerLanguages({});
        }
      }
    }

    loadCleanerContacts();

    return () => {
      isCurrent = false;
    };
  }, [cleanerLookupKey]);

  // One reset per part of the screen when another Job is shown: the shared public link, then Offers and the
  // reminder. The roster resets in useJobRosterEdit and the completion controls in useJobExecution.
  useEffect(() => {
    setPublicOfferLink(null);
  }, [job.id]);

  useEffect(() => {
    setPublicOfferLinkError(null);
    setEditingOfferCompensationFor(null);
    setOfferCompensationErrorFor(null);
    setCopiedOfferMessageId(null);
    setOfferMessageCopyErrorId(null);
  }, [job.id]);

  useEffect(() => {
    setReminderPreview(null);
    setIsCopyingReminder(false);
    setIsPreparingReminderChecklist(false);
    setHasReminderChecklistError(false);
  }, [job.id]);

  async function assignCleaner(offer, options) {
    setAssigningCleanerId(offer.cleanerId);
    setAssignmentError(null);

    try {
      await (options ? onAssignCleaner(offer, options) : onAssignCleaner(offer));
    } catch (error) {
      setAssignmentError(
        error.code === "job-already-assigned"
          ? translate("offers.alreadyAssigned")
          : error.code === "job-filled"
            ? translate("offers.jobFilled")
            : translate("offers.assignmentError"),
      );
    } finally {
      setAssigningCleanerId(null);
    }
  }

  // FB09: explicit manager decisions about one invitation. Each one is
  // reversible with "Reopen", so a single click is enough.
  async function decideOffer(offer, decision) {
    if (!onDecideOffer) return;
    setDecidingOfferId(offer.id);
    setAssignmentError(null);
    try {
      await onDecideOffer(offer, decision);
    } catch {
      setAssignmentError(translate("offers.decisionError"));
    } finally {
      setDecidingOfferId(null);
    }
  }

  async function reopenOffer(offer) {
    if (!onReopenOffer) return;
    setDecidingOfferId(offer.id);
    setAssignmentError(null);
    try {
      await onReopenOffer(offer);
    } catch {
      setAssignmentError(translate("offers.decisionError"));
    } finally {
      setDecidingOfferId(null);
    }
  }

  async function addCleanerSpotAndAssign(offer) {
    if (!window.confirm(translate("offers.addSpotConfirm", { count: requiredCleanerCount(job) + 1 }))) return;
    await assignCleaner(offer, { addSpot: true });
  }

  async function changeCleanerSpots(count) {
    if (!onSetCleanerSpots || isSavingSpots) return;
    setIsSavingSpots(true);
    setAssignmentError(null);
    try {
      await onSetCleanerSpots(count);
    } catch {
      setAssignmentError(translate("offers.spotsError"));
    } finally {
      setIsSavingSpots(false);
    }
  }

  function openOfferLinkForm(offer) {
    const offerWithRecentSnapshot = publicOfferLink?.offerId === offer.id
      ? { ...offer, offeredCompensation: publicOfferLink.offeredCompensation ?? null }
      : offer;
    const suggestion = getOfferCompensationSuggestion(job, offerWithRecentSnapshot);
    setOfferCompensationInput(suggestion.value);
    setEditingOfferCompensationFor(offer.id);
    setOfferCompensationErrorFor(null);
    setPublicOfferLinkError(null);
  }

  async function createOfferLink(event, offer) {
    event?.preventDefault();

    let offeredCompensation;
    try {
      offeredCompensation = automaticOfferJob ? null : parseOfferCompensationInput(offerCompensationInput);
    } catch {
      setOfferCompensationErrorFor(offer.id);
      return;
    }

    setIsCreatingPublicOfferLinkFor(offer.id);
    setPublicOfferLinkError(null);
    setOfferCompensationErrorFor(null);

    try {
      const link = await onCreatePublicOfferLink(offer, offeredCompensation);
      setPublicOfferLink({ offerId: offer.id, ...link });
      setEditingOfferCompensationFor(null);
    } catch {
      setPublicOfferLinkError(offer.id);
    } finally {
      setIsCreatingPublicOfferLinkFor(null);
    }
  }

  async function revokeOffer(offerId) {
    setRevokingOfferId(offerId);
    setRevokeOfferErrorId(null);
    try {
      await onRevokeAutomaticOffer(offerId);
      setPublicOfferLink((link) => link?.offerId === offerId ? null : link);
    } catch {
      setRevokeOfferErrorId(offerId);
    } finally {
      setRevokingOfferId(null);
    }
  }

  function offerMessageFor(offer, cleanerName) {
    if (!publicOfferLink?.url || publicOfferLink.offerId !== offer.id) return null;
    return buildCleanerOfferMessage({
      cleanerName,
      propertyName: job.propertyName || translate("properties.unnamed"),
      scheduledDate: job.scheduledDate,
      scheduledStart: job.scheduledStart,
      offeredCompensation: publicOfferLink.offeredCompensation ?? null,
      publicUrl: publicOfferLink.url,
      language: cleanerLanguageFor(offer.cleanerId),
      translate: (key, replacements) => translateInLanguage(
        cleanerLanguageFor(offer.cleanerId),
        key,
        replacements,
      ),
    });
  }

  async function copyOfferMessage(offer, cleanerName) {
    const message = offerMessageFor(offer, cleanerName);
    if (!message) return;

    setOfferMessageCopyErrorId(null);
    setCopiedOfferMessageId(null);

    try {
      await copyCleanerReminderMessage(message);
      setCopiedOfferMessageId(offer.id);
    } catch {
      setOfferMessageCopyErrorId(offer.id);
    }
  }

  function openReminderPreview(cleanerId, cleanerName, assignmentId = null) {
    setCopyMessageErrorCleanerId(null);
    setHasReminderChecklistError(false);
    setReminderPreview({
      cleanerId, cleanerName, assignmentId, includeSensitiveAccess: false,
      includeChecklist: false, checklistUrl: null, checklistIssuedAt: null,
    });
  }

  async function prepareReminderChecklist() {
    if (!reminderPreview?.includeChecklist || !canPrepareChecklistForReminder
      || isPreparingReminderChecklist) return;
    if (checklistCapability?.state === "ACTIVE"
      && !window.confirm(translate("jobs.reminderReplaceChecklistWarning"))) return;
    const cleanerId = reminderPreview.cleanerId;
    const jobId = job.id;
    setHasReminderChecklistError(false);
    setIsPreparingReminderChecklist(true);
    try {
      const result = await onPrepareChecklistReminder(cleanerId);
      if (!result?.url || result.capability?.cleanerId !== cleanerId) {
        throw new Error("Checklist link was not issued for the selected Cleaner.");
      }
      if (currentJobIdRef.current === jobId) {
        setReminderPreview((current) => current?.cleanerId === cleanerId
          ? { ...current, checklistUrl: result.url, checklistIssuedAt: result.capability.issuedAt }
          : current);
      }
    } catch {
      if (currentJobIdRef.current === jobId) setHasReminderChecklistError(true);
    } finally {
      if (currentJobIdRef.current === jobId) setIsPreparingReminderChecklist(false);
    }
  }

  async function copyReminderMessage() {
    if (!reminderPreview || !reminderReadyToSend || isCopyingReminder) return;
    setCopyMessageErrorCleanerId(null);
    setIsCopyingReminder(true);
    try {
      await copyCleanerReminderMessage(reminderPreviewMessage);
      setCopiedCleanerId(reminderPreview.cleanerId);
      setReminderPreview(null);
    } catch {
      setCopyMessageErrorCleanerId(reminderPreview.cleanerId);
    } finally {
      setIsCopyingReminder(false);
    }
  }

  return (
    <section className="panel job-detail cf-job" aria-labelledby="job-detail-title">
      <JobDetailHead
        job={job}
        translate={translate}
        language={language}
        onBack={onBack}
        isCompleted={isCompleted}
        completedAt={completedAt}
        lifecyclePresentation={lifecyclePresentation}
        primaryIntent={primaryIntent}
        focusIntentSection={focusIntentSection}
        issuesSectionRef={issuesSectionRef}
        checklistSectionRef={checklistSectionRef}
        chooseJobIntent={chooseJobIntent}
        isLoadingAssignments={isLoadingAssignments}
        hasAssignmentsError={hasAssignmentsError}
        summaryCleanerNames={summaryCleanerNames}
      />
      <div className="cf-job__layout">
      <aside className="cf-job__rail" aria-label={translate("jobs.intentTitle")}>
      <JobIntentLayer
        key={job.id}
        primary={primaryIntent}
        showOperationalIntents={!job.archivedAt && !isCompleted}
        onIntent={chooseJobIntent}
        notice={intentNotice ? translate(intentNotice.key) : null}
        onSafePath={intentNotice?.safe ? () => intentNotice.safe === "roster"
          ? focusIntentSection(assignmentSectionRef)
          : chooseJobIntent(intentNotice.safe === "assignment" ? "assignment" : "checklist") : null}
        safeLabel={translate(intentNotice?.safe === "roster" ? "jobs.assignedCleaners"
          : intentNotice?.safe === "assignment" ? "jobs.assignCleanerDirectly"
            : checklistRun?.status === "READY_FOR_REVIEW" ? "jobs.intentReview" : "jobs.intentExistingChecklist")}
      />
      {pendingInterest.length > 0 && <InterestDecisionPanel
        ref={interestSectionRef}
        offers={pendingInterest}
        cleanerName={(offer) => currentCleanerName(offer.cleanerId, offer.cleanerName, cleanerNamesById, translate("common.notProvided"))}
        respondedAt={(offer) => formatCreatedAt(offer.respondedAt, language)}
        assigningCleanerId={assigningCleanerId}
        error={assignmentError}
        onConfirm={(offer) => assignCleaner(offer)}
        decidingOfferId={decidingOfferId}
        onDecline={onDecideOffer ? (offer) => decideOffer(offer, offerManagerDecisions.notSelected) : null}
        onSeeAllOffers={() => focusIntentSection(offersSectionRef)}
        onAssignManually={canDirectAssign ? () => chooseJobIntent("assignment") : null}
      />}
      </aside>
      <div className="cf-job__sections">
      {scheduleResponses.length > 0 && (
        <JobScheduleConfirmation key={`${job.id}:${scheduleRevision}`}
          job={job} responses={scheduleResponses} language={language} translate={translate}
          cleanerName={(id, assignmentId) => currentCleanerName(
            id,
            assignments.find((assignment) => assignment.id === assignmentId && assignment.cleanerId === id)?.cleanerNameSnapshot
              || (id === job.assignedCleanerId ? job.assignedCleanerName : null),
            cleanerNamesById, translate("common.notProvided"),
          )}
          cleanerLanguage={cleanerLanguageFor} cleanerPhone={(id) => cleanerPhonesById[id]}
          replacementOffer={canDirectAssign ? replacementOffer : null}
          replacementCandidates={availableCleaners.filter((cleaner) => canAssignCleanerDirectly(job, cleaner)).filter(({ id }) =>
            !scheduleResponses.some(({ cleanerId, state }) => cleanerId === id && state === "DECLINED"))}
          canOfferReplacement={canOfferReplacement}
          onOfferReplacement={onOfferManualReplacement}
          onAssignReplacement={onAssignCleanerDirectly}
        />
      )}
      <JobDetailsSection
        job={job}
        translate={translate}
        language={language}
        scheduleSectionRef={scheduleSectionRef}
        hasSavedJobSchedule={hasSavedJobSchedule}
        isEditingJobSchedule={isEditingJobSchedule}
        scheduleCommunicationMayBeStale={scheduleCommunicationMayBeStale}
        needsScheduleReload={needsScheduleReload}
        scheduleMessage={scheduleMessage}
        saveJobSchedule={saveJobSchedule}
        jobScheduleValues={jobScheduleValues}
        setJobScheduleValues={setJobScheduleValues}
        jobScheduleSaveError={jobScheduleSaveError}
        isSavingJobSchedule={isSavingJobSchedule}
        setIsEditingJobSchedule={setIsEditingJobSchedule}
        setJobScheduleSaveError={setJobScheduleSaveError}
        scheduleRevisionConflict={scheduleRevisionConflict}
        startJobScheduleEdit={startJobScheduleEdit}
        isEditingJobDetails={isEditingJobDetails}
        startJobDetailsEdit={startJobDetailsEdit}
        hasSavedJobDetails={hasSavedJobDetails}
        saveJobDetails={saveJobDetails}
        jobDetailValues={jobDetailValues}
        isSavingJobDetails={isSavingJobDetails}
        setJobDetailValues={setJobDetailValues}
        jobDetailsSaveError={jobDetailsSaveError}
        setIsEditingJobDetails={setIsEditingJobDetails}
        setJobDetailsSaveError={setJobDetailsSaveError}
        jobDetailFormValues={jobDetailFormValues}
      />

      <JobDetailSection jobId={job.id} title={translate("jobs.section.cleaner")}>
      {!isAssignmentAware &&
        job.operationalStatus === "ASSIGNED" &&
        (job.assignedCleanerId || job.assignedCleanerName) && (
        <section className="job-cleaner-reminder" aria-label={translate("jobs.cleanerReminder")}>
          <button
            className="button"
            type="button"
            onClick={() =>
              openReminderPreview(
                job.assignedCleanerId || "legacy-assigned-cleaner",
                assignedCleanerName,
              )
            }
          >
            {copiedCleanerId === (job.assignedCleanerId || "legacy-assigned-cleaner")
              ? translate("jobs.messageCopied")
              : translate("jobs.prepareCleanerMessage")}
          </button>
        </section>
      )}

      <JobAssignmentRoster
        job={job}
        translate={translate}
        language={language}
        isAssignmentAware={isAssignmentAware}
        assignmentSectionRef={assignmentSectionRef}
        assignedCleanerIds={assignedCleanerIds}
        canDirectAssign={canDirectAssign}
        isDirectAssignmentOpen={isDirectAssignmentOpen}
        setIsDirectAssignmentOpen={setIsDirectAssignmentOpen}
        assignCleanerDirectly={assignCleanerDirectly}
        isLoadingCleaners={isLoadingCleaners}
        offers={offers}
        hasCleanerError={hasCleanerError}
        isAssigningDirectly={isAssigningDirectly}
        setDirectCleanerId={setDirectCleanerId}
        setDirectCleanerSearch={setDirectCleanerSearch}
        directCleanerSearch={directCleanerSearch}
        directCleanerOptions={directCleanerOptions}
        directCleanerId={directCleanerId}
        cleanerSelection={cleanerSelection}
        availableCleaners={availableCleaners}
        isLoadingAssignments={isLoadingAssignments}
        hasAssignmentsError={hasAssignmentsError}
        activeAssignments={activeAssignments}
        cleanerNamesById={cleanerNamesById}
        replacementTargetId={replacementTargetId}
        automaticOfferJob={automaticOfferJob}
        openReminderPreview={openReminderPreview}
        copiedCleanerId={copiedCleanerId}
        canEditRoster={canEditRoster}
        removingAssignmentId={removingAssignmentId}
        replacingAssignmentId={replacingAssignmentId}
        removeCleanerAssignment={removeCleanerAssignment}
        eligibleReplacementOffers={eligibleReplacementOffers}
        setReplacementTargetId={setReplacementTargetId}
        replacementOfferId={replacementOfferId}
        setReplacementOfferId={setReplacementOfferId}
        replaceCleanerAssignment={replaceCleanerAssignment}
        hasAssignmentAcknowledgment={hasAssignmentAcknowledgment}
        assignmentError={assignmentError}
      />

      <JobReminderPreview
        job={job}
        translate={translate}
        language={language}
        reminderPreview={reminderPreview}
        reminderSectionRef={reminderSectionRef}
        isCopyingReminder={isCopyingReminder}
        setReminderPreview={setReminderPreview}
        sensitivePropertyDetails={sensitivePropertyDetails}
        reminderCleanerStillAssigned={reminderCleanerStillAssigned}
        setHasReminderChecklistError={setHasReminderChecklistError}
        checklistCapability={checklistCapability}
        reminderChecklistCapabilityCurrent={reminderChecklistCapabilityCurrent}
        canPrepareChecklistForReminder={canPrepareChecklistForReminder}
        isPreparingReminderChecklist={isPreparingReminderChecklist}
        isIssuingChecklistCapability={isIssuingChecklistCapability}
        isCreatingChecklistRun={isCreatingChecklistRun}
        prepareReminderChecklist={prepareReminderChecklist}
        hasReminderChecklistError={hasReminderChecklistError}
        cleanerLanguageLabelFor={cleanerLanguageLabelFor}
        reminderPreviewMessage={reminderPreviewMessage}
        copyMessageErrorCleanerId={copyMessageErrorCleanerId}
        reminderWhatsAppUrl={reminderWhatsAppUrl}
        reminderReadyToSend={reminderReadyToSend}
        copyReminderMessage={copyReminderMessage}
        onMarkReminderSent={onMarkReminderSent}
        reminderLogState={reminderLogState}
        setReminderLogState={setReminderLogState}
      />

      </JobDetailSection>

      <JobChecklistSection
        language={language}
        job={job}
        translate={translate}
        checklistSectionRef={checklistSectionRef}
        isLoadingChecklistRun={isLoadingChecklistRun}
        checklistRun={checklistRun}
        onOpenChecklistRun={onOpenChecklistRun}
        hasChecklistRunError={hasChecklistRunError}
        isCompleted={isCompleted}
        isCreatingChecklistRun={isCreatingChecklistRun}
        onCreateChecklistRun={onCreateChecklistRun}
        onRefreshChecklistRun={onRefreshChecklistRun}
        hasCreateChecklistRunError={hasCreateChecklistRunError}
        checklistCapability={checklistCapability}
        isLoadingChecklistCapability={isLoadingChecklistCapability}
        hasChecklistCapabilityError={hasChecklistCapabilityError}
        isIssuingChecklistCapability={isIssuingChecklistCapability}
        hasIssueChecklistCapabilityError={hasIssueChecklistCapabilityError}
        isRevokingChecklistCapability={isRevokingChecklistCapability}
        hasRevokeChecklistCapabilityError={hasRevokeChecklistCapabilityError}
        onRefreshChecklistCapability={onRefreshChecklistCapability}
        onIssueChecklistCapability={onIssueChecklistCapability}
        onRevokeChecklistCapability={onRevokeChecklistCapability}
        canUseCompletionControls={canUseCompletionControls}
        completionSectionRef={completionSectionRef}
        isCompletionConfirmationVisible={isCompletionConfirmationVisible}
        setIsCompletionConfirmationVisible={setIsCompletionConfirmationVisible}
        isCompletingCleaning={isCompletingCleaning}
        completeCleaning={completeCleaning}
        hasCompleteCleaningError={hasCompleteCleaningError}
        isAssignmentAware={isAssignmentAware}
        isInProgress={isInProgress}
        isStartingCleaning={isStartingCleaning}
        startCleaning={startCleaning}
        hasStartCleaningError={hasStartCleaningError}
      />

      <JobOffersSection
        job={job}
        translate={translate}
        language={language}
        offersSectionRef={offersSectionRef}
        canOfferToCleaners={canOfferToCleaners}
        isLoadingOffers={isLoadingOffers}
        sortedOffers={sortedOffers}
        onOfferToCleaners={onOfferToCleaners}
        onRefreshOffers={onRefreshOffers}
        isAssignmentAware={isAssignmentAware}
        automaticOfferJob={automaticOfferJob}
        onSetCleanerSpots={onSetCleanerSpots}
        canEditRoster={canEditRoster}
        isSavingSpots={isSavingSpots}
        changeCleanerSpots={changeCleanerSpots}
        offersCreatedCount={offersCreatedCount}
        hasOffersError={hasOffersError}
        cleanerNamesById={cleanerNamesById}
        onDecideOffer={onDecideOffer}
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
        assignmentError={assignmentError}
        canSimulateAssignedCleaner={canSimulateAssignedCleaner}
        onSimulateAssignedCleaner={onSimulateAssignedCleaner}
      />

      <JobIssuesSection
        job={job}
        translate={translate}
        language={language}
        issuesSectionRef={issuesSectionRef}
        onRefreshIssues={onRefreshIssues}
        isLoadingIssues={isLoadingIssues}
        hasIssuesError={hasIssuesError}
        sortedIssues={sortedIssues}
        resolvingIssueId={resolvingIssueId}
        openResolutionForm={openResolutionForm}
        resolveSelectedIssue={resolveSelectedIssue}
        resolutionNote={resolutionNote}
        setResolutionNote={setResolutionNote}
        resolutionError={resolutionError}
        isResolvingIssue={isResolvingIssue}
        closeResolutionForm={closeResolutionForm}
      />

      <JobFinancialSection
        job={job}
        translate={translate}
        language={language}
        grossMargin={grossMargin}
        isEditingPrices={isEditingPrices}
        startPriceEdit={startPriceEdit}
        hasSavedPrices={hasSavedPrices}
        savePrices={savePrices}
        priceValues={priceValues}
        setPriceValues={setPriceValues}
        priceSaveError={priceSaveError}
        isSavingPrices={isSavingPrices}
        setIsEditingPrices={setIsEditingPrices}
        setPriceSaveError={setPriceSaveError}
      />

      <JobHistorySection
        job={job}
        translate={translate}
        language={language}
        historySectionRef={historySectionRef}
        isAssignmentAware={isAssignmentAware}
        isAssigned={isAssigned}
        assignedCleanerName={assignedCleanerName}
        assignedAt={assignedAt}
        startedAt={startedAt}
        completedAt={completedAt}
        createdAt={createdAt}
        onSaveDataProvenance={onSaveDataProvenance}
        canRestore={canRestore}
        onArchive={onArchive}
        onRestore={onRestore}
      />

      </div>
      </div>
      <ScrollToTopButton />
    </section>
  );
}
