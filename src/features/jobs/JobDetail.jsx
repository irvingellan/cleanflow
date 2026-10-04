import { useEffect, useRef, useState } from "react";
import { JobIntentLayer } from "./JobIntentLayer.jsx";
import { serviceLifecyclePresentation } from "./serviceLifecyclePresentation.js";
import { ServiceLifecycleRail } from "./ServiceLifecycleRail.jsx";
import { ChecklistProgressSummary } from "./ChecklistProgressSummary.jsx";
import { jobScheduleAvailability } from "./jobScheduleAvailability.js";
import { OperationalIcon } from "../../components/OperationalIcon.jsx";
import { DataProvenanceReview } from "../../components/DataProvenanceReview.jsx";
import { RecordArchiveControl } from "../../components/RecordArchiveControl.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import {
  BackButton,
  DetailItem,
  StateCard,
} from "../../components/UiPrimitives.jsx";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { getCleanerContactsById } from "../cleaners/cleanerService.js";
import { filterCleanersByName } from "../cleaners/cleanerSearch.js";
import { normalizeCleanerPreferredLanguage } from "../cleaners/cleanerProfile.js";
import { getAssignmentAcknowledgmentState } from "./assignmentPresentation.js";
import { canAssignCleanerDirectly } from "./assignmentService.js";
import { formatIssueCategory } from "../issues/issuePresentation.js";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";
import { translateInLanguage, useTranslation } from "../../i18n/translations.js";
import { ChecklistCapabilityControls } from "../checklists/ChecklistCapabilityControls.jsx";
import {
  canManageAssignmentAwareOffers,
  canEditJobDetails,
  maximumGuestNameLength,
  getJobGrossMargin,
  getAssignedCleanerIds,
  isAssignmentAwareJob,
  optionalJobPrice,
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
  onAssignCleaner,
  onAssignCleanerDirectly,
  onRemoveAssignment,
  onReplaceAssignment,
  onStartCleaning,
  onCompleteCleaning,
  onUpdatePrices,
  onUpdateDetails,
  onUpdateSchedule,
  onSimulateAssignedCleaner,
  onResolveIssue,
  onSaveDataProvenance,
  onArchive,
  onRestore,
  canRestore,
}) {
  const { language, translate } = useTranslation();
  const [resolvedCleanerNames, setResolvedCleanerNames] = useState({});
  const [resolvedCleanerPhones, setResolvedCleanerPhones] = useState({});
  const [resolvedCleanerLanguages, setResolvedCleanerLanguages] = useState({});
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [isDirectAssignmentOpen, setIsDirectAssignmentOpen] = useState(false);
  const [directCleanerSearch, setDirectCleanerSearch] = useState("");
  const [directCleanerId, setDirectCleanerId] = useState("");
  const [isAssigningDirectly, setIsAssigningDirectly] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
  const [replacementTargetId, setReplacementTargetId] = useState(null);
  const [replacingAssignmentId, setReplacingAssignmentId] = useState(null);
  const [replacementOfferId, setReplacementOfferId] = useState("");
  const [resolvingIssueId, setResolvingIssueId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolvingIssue, setIsResolvingIssue] = useState(false);
  const [resolutionError, setResolutionError] = useState(null);
  const [publicOfferLink, setPublicOfferLink] = useState(null);
  const [isCreatingPublicOfferLinkFor, setIsCreatingPublicOfferLinkFor] =
    useState(null);
  const [publicOfferLinkError, setPublicOfferLinkError] = useState(null);
  const [editingOfferCompensationFor, setEditingOfferCompensationFor] = useState(null);
  const [offerCompensationInput, setOfferCompensationInput] = useState("");
  const [offerCompensationErrorFor, setOfferCompensationErrorFor] = useState(null);
  const [copiedOfferMessageId, setCopiedOfferMessageId] = useState(null);
  const [offerMessageCopyErrorId, setOfferMessageCopyErrorId] = useState(null);
  const [isStartingCleaning, setIsStartingCleaning] = useState(false);
  const [hasStartCleaningError, setHasStartCleaningError] = useState(false);
  const [isCompletingCleaning, setIsCompletingCleaning] = useState(false);
  const [hasCompleteCleaningError, setHasCompleteCleaningError] = useState(false);
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] = useState(false);
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
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceValues, setPriceValues] = useState(() => ({
    clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
    cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
  }));
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [priceSaveError, setPriceSaveError] = useState("");
  const [hasSavedPrices, setHasSavedPrices] = useState(false);
  const [isEditingJobDetails, setIsEditingJobDetails] = useState(false);
  const [jobDetailValues, setJobDetailValues] = useState(() => ({
    guestName: job.guestName || "",
    notes: job.notes || "",
  }));
  const [isSavingJobDetails, setIsSavingJobDetails] = useState(false);
  const [jobDetailsSaveError, setJobDetailsSaveError] = useState("");
  const [hasSavedJobDetails, setHasSavedJobDetails] = useState(false);
  const [isEditingJobSchedule, setIsEditingJobSchedule] = useState(false);
  const [jobScheduleValues, setJobScheduleValues] = useState(() => ({
    scheduledDate: job.scheduledDate || "",
    scheduledStart: job.scheduledStart || "",
  }));
  const [isSavingJobSchedule, setIsSavingJobSchedule] = useState(false);
  const [jobScheduleSaveError, setJobScheduleSaveError] = useState("");
  const [hasSavedJobSchedule, setHasSavedJobSchedule] = useState(false);
  const [scheduleCommunicationMayBeStale, setScheduleCommunicationMayBeStale] = useState(false);
  const [copiedCleanerId, setCopiedCleanerId] = useState(null);
  const [copyMessageErrorCleanerId, setCopyMessageErrorCleanerId] = useState(null);
  const [reminderPreview, setReminderPreview] = useState(null);
  const [isCopyingReminder, setIsCopyingReminder] = useState(false);
  const offersSectionRef = useRef(null);
  const currentJobIdRef = useRef(job.id);
  currentJobIdRef.current = job.id;
  const didFocusNewOffersRef = useRef(false);
  const createdAt = formatCreatedAt(job.createdAt, language);
  const assignedAt = formatCreatedAt(job.assignedAt, language);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isAssignmentAware = isAssignmentAwareJob(job);
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
  const canDirectAssign = isAssignmentAware && !job.archivedAt
    && ["UNASSIGNED", "OFFERED", "ASSIGNED"].includes(job.operationalStatus);
  const directCleanerOptions = filterCleanersByName(
    availableCleaners.filter((cleaner) => canAssignCleanerDirectly(job, cleaner)),
    directCleanerSearch,
  );
  const canManageOffers = isAssignmentAware
    ? canManageAssignmentAwareOffers(job)
    : !isCompleted;
  // An assignment-aware Job can still need additional cleaners before work starts.
  const canOfferToCleaners = canManageOffers;
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
    offersSection.focus({ preventScroll: true });
    offersSection.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [offersCreatedCount, isLoadingOffers, hasOffersError]);
  const scheduleBlock = jobScheduleAvailability(job, {
    run: checklistRun, loading: isLoadingChecklistRun, error: hasChecklistRunError,
  });
  const canReschedule = !scheduleBlock;

  // Suggestions are presentation, not a second authorization/state machine.
  const primaryIntent = job.archivedAt || isCompleted
    ? { intent: "history", label: "jobs.intentHistory" }
    : isLoadingChecklistRun || hasChecklistRunError
      ? { intent: "checklist", label: "jobs.intent.checklist" }
      : checklistRun
        ? { intent: "checklist", label: checklistRun.status === "READY_FOR_REVIEW"
          ? "jobs.intentReview" : checklistRun.status === "DRAFT"
            ? "jobs.intentExistingChecklist" : "checklists.open" }
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
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    });
  }

  function chooseJobIntent(intent) {
    setIntentNotice(null);
    if (intent === "history") {
      setIntentNotice({ key: "jobs.intentHistorical" });
      if (!isLoadingChecklistRun && !hasChecklistRunError && checklistRun) onOpenChecklistRun?.();
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
      if (!isLoadingChecklistRun && !hasChecklistRunError && checklistRun) onOpenChecklistRun?.();
      else focusIntentSection(checklistSectionRef);
      return;
    }
    if (job.archivedAt || isCompleted) {
      setIntentNotice({ key: "jobs.intentHistorical", safe: Boolean(checklistRun) });
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

  useEffect(() => {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setIsEditingPrices(false);
    setIsSavingPrices(false);
    setPriceSaveError("");
    setHasSavedPrices(false);
  }, [job.id]);

  useEffect(() => {
    setJobScheduleValues({
      scheduledDate: job.scheduledDate || "",
      scheduledStart: job.scheduledStart || "",
    });
    setIsEditingJobSchedule(false);
    setIsSavingJobSchedule(false);
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    setScheduleCommunicationMayBeStale(false);
    setIntentNotice(null);
  }, [job.id]);

  useEffect(() => {
    setJobDetailValues({
      guestName: job.guestName || "",
      notes: job.notes || "",
    });
    setIsEditingJobDetails(false);
    setIsSavingJobDetails(false);
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);
  }, [job.id]);

  useEffect(() => {
    setPublicOfferLink(null);
    setPublicOfferLinkError(null);
    setEditingOfferCompensationFor(null);
    setOfferCompensationErrorFor(null);
    setCopiedOfferMessageId(null);
    setReminderPreview(null);
    setIsCopyingReminder(false);
    setIsPreparingReminderChecklist(false);
    setHasReminderChecklistError(false);
    setIsCompletionConfirmationVisible(false);
    setIsCompletingCleaning(false);
    setHasCompleteCleaningError(false);
    setIsDirectAssignmentOpen(false);
    setIsAssigningDirectly(false);
    setDirectCleanerSearch("");
    setDirectCleanerId("");
    setOfferMessageCopyErrorId(null);
  }, [job.id]);

  function startPriceEdit() {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setPriceSaveError("");
    setHasSavedPrices(false);
    setIsEditingPrices(true);
  }

  function startJobDetailsEdit() {
    if (!canEditJobDetails(job)) return;
    setJobDetailValues({
      guestName: job.guestName || "",
      notes: job.notes || "",
    });
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);
    setIsEditingJobDetails(true);
  }

  async function saveJobDetails(event) {
    event.preventDefault();
    const details = {
      guestName: jobDetailValues.guestName.trim(),
      notes: jobDetailValues.notes.trim(),
    };

    if (details.guestName.length > maximumGuestNameLength) {
      setJobDetailsSaveError(translate("jobs.guestNameTooLong"));
      return;
    }

    setIsSavingJobDetails(true);
    setJobDetailsSaveError("");
    setHasSavedJobDetails(false);

    try {
      const updatedJob = await onUpdateDetails(details);
      setJobDetailValues({
        guestName: updatedJob?.guestName || details.guestName,
        notes: updatedJob?.notes || details.notes,
      });
      setIsEditingJobDetails(false);
      setHasSavedJobDetails(true);
    } catch {
      setJobDetailsSaveError(translate("jobs.detailsUpdateError"));
    } finally {
      setIsSavingJobDetails(false);
    }
  }

  function startJobScheduleEdit() {
    if (!canReschedule) return;
    setJobScheduleValues({
      scheduledDate: job.scheduledDate || "",
      scheduledStart: job.scheduledStart || "",
    });
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    setScheduleCommunicationMayBeStale(false);
    setIsEditingJobSchedule(true);
  }

  async function saveJobSchedule(event) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jobScheduleValues.scheduledDate)) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidDate"));
      return;
    }
    const [year, month, day] = jobScheduleValues.scheduledDate.split("-").map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysByMonth[month - 1]) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidDate"));
      return;
    }
    if (jobScheduleValues.scheduledStart
      && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jobScheduleValues.scheduledStart)) {
      setJobScheduleSaveError(translate("jobs.scheduleInvalidTime"));
      return;
    }

    setIsSavingJobSchedule(true);
    setJobScheduleSaveError("");
    setHasSavedJobSchedule(false);
    try {
      const result = await onUpdateSchedule({
        scheduledDate: jobScheduleValues.scheduledDate,
        scheduledStart: jobScheduleValues.scheduledStart,
      });
      setJobScheduleValues({
        scheduledDate: result?.job?.scheduledDate || jobScheduleValues.scheduledDate,
        scheduledStart: result?.job?.scheduledStart || "",
      });
      setScheduleCommunicationMayBeStale(result?.changed === true);
      setIsEditingJobSchedule(false);
      setHasSavedJobSchedule(true);
    } catch (error) {
      const reason = error?.details?.reason;
      setJobScheduleSaveError(reason === "checklist-run-exists"
        ? translate("jobs.scheduleLockedByChecklist")
        : reason === "status" || reason === "archived"
          ? translate("jobs.scheduleReadOnlyState")
          : reason === "invalid-date"
            ? translate("jobs.scheduleInvalidDate")
            : reason === "invalid-time"
              ? translate("jobs.scheduleInvalidTime")
              : translate("jobs.scheduleUpdateError"));
    } finally {
      setIsSavingJobSchedule(false);
    }
  }

  async function savePrices(event) {
    event.preventDefault();
    const clientPrice = optionalJobPrice(priceValues.clientPrice);
    const cleanerPayout = optionalJobPrice(priceValues.cleanerPayout);

    if (clientPrice === null || cleanerPayout === null) {
      setPriceSaveError(translate("jobs.priceInvalid"));
      return;
    }

    setIsSavingPrices(true);
    setPriceSaveError("");
    setHasSavedPrices(false);

    try {
      await onUpdatePrices({ clientPrice, cleanerPayout });
      setIsEditingPrices(false);
      setHasSavedPrices(true);
    } catch {
      setPriceSaveError(translate("jobs.priceUpdateError"));
    } finally {
      setIsSavingPrices(false);
    }
  }

  async function assignCleaner(offer) {
    setAssigningCleanerId(offer.cleanerId);
    setAssignmentError(null);

    try {
      await onAssignCleaner(offer);
    } catch (error) {
      setAssignmentError(
        error.code === "job-already-assigned"
          ? translate("offers.alreadyAssigned")
          : translate("offers.assignmentError"),
      );
    } finally {
      setAssigningCleanerId(null);
    }
  }

  async function assignCleanerDirectly(event) {
    event.preventDefault();
    const cleaner = availableCleaners.find((candidate) => candidate.id === directCleanerId);
    if (!canAssignCleanerDirectly(job, cleaner) || isAssigningDirectly) return;
    setIsAssigningDirectly(true);
    setAssignmentError(null);
    const jobId = job.id;
    try {
      await onAssignCleanerDirectly(cleaner.id);
      if (currentJobIdRef.current === jobId) {
        setIsDirectAssignmentOpen(false);
        setDirectCleanerId("");
        setDirectCleanerSearch("");
      }
    } catch {
      if (currentJobIdRef.current === jobId) setAssignmentError(translate("jobs.directAssignmentError"));
    } finally {
      if (currentJobIdRef.current === jobId) setIsAssigningDirectly(false);
    }
  }

  async function removeCleanerAssignment(assignmentId) {
    setRemovingAssignmentId(assignmentId);
    setAssignmentError(null);

    try {
      await onRemoveAssignment(assignmentId);
    } catch {
      setAssignmentError(translate("jobs.rosterUpdateError"));
    } finally {
      setRemovingAssignmentId(null);
    }
  }

  async function replaceCleanerAssignment(assignmentId) {
    if (!replacementOfferId) {
      return;
    }

    setReplacingAssignmentId(assignmentId);
    setAssignmentError(null);

    try {
      await onReplaceAssignment(assignmentId, replacementOfferId);
      setReplacementOfferId("");
      setReplacementTargetId(null);
    } catch {
      setAssignmentError(translate("jobs.rosterUpdateError"));
    } finally {
      setReplacingAssignmentId(null);
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
    event.preventDefault();

    let offeredCompensation;
    try {
      offeredCompensation = parseOfferCompensationInput(offerCompensationInput);
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

  async function startCleaning() {
    setIsStartingCleaning(true);
    setHasStartCleaningError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartCleaningError(true);
    } finally {
      setIsStartingCleaning(false);
    }
  }

  async function completeCleaning() {
    const jobId = job.id;
    setIsCompletingCleaning(true);
    setHasCompleteCleaningError(false);

    try {
      await onCompleteCleaning();
      if (currentJobIdRef.current === jobId) setIsCompletionConfirmationVisible(false);
    } catch {
      if (currentJobIdRef.current === jobId) setHasCompleteCleaningError(true);
    } finally {
      if (currentJobIdRef.current === jobId) setIsCompletingCleaning(false);
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

  function openResolutionForm(issue) {
    setResolvingIssueId(issue.id);
    setResolutionNote("");
    setResolutionError(null);
  }

  function closeResolutionForm() {
    setResolvingIssueId(null);
    setResolutionNote("");
    setResolutionError(null);
  }

  async function resolveSelectedIssue(event) {
    event.preventDefault();

    if (!resolvingIssueId) {
      return;
    }

    setIsResolvingIssue(true);
    setResolutionError(null);

    try {
      await onResolveIssue({
        issueId: resolvingIssueId,
        resolutionNote,
      });
      closeResolutionForm();
    } catch (error) {
      setResolutionError(
        error.code === "issue-not-open"
          ? translate("issues.alreadyResolved")
          : translate("issues.resolveError"),
      );
    } finally {
      setIsResolvingIssue(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="job-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("jobs.details")}</p>
      <h2 id="job-detail-title" className="panel__title">
        {job.propertyName || translate("properties.unnamed")}
      </h2>
      {lifecyclePresentation.attention.length > 0 && <aside className="service-attention" aria-label={translate("dashboard.needsAttention")}>
        {lifecyclePresentation.attention.map((attention) => <div key={attention.kind}>
          <strong>{translate(attention.key, { count: attention.count })}</strong>
          <button className="button button--small" type="button" onClick={() => attention.kind === "issues"
            ? focusIntentSection(issuesSectionRef) : attention.kind === "stale-link"
              ? focusIntentSection(checklistSectionRef) : chooseJobIntent("checklist")}>
            {translate(attention.kind === "issues" ? "dashboard.reviewIssue"
              : attention.kind === "review" ? "jobs.intentReview" : "lifecycle.linkControls")} →
          </button>
        </div>)}
      </aside>}
      <ServiceLifecycleRail lifecycle={lifecyclePresentation.lifecycle} />

      <dl ref={historySectionRef} tabIndex={-1} className="detail-list service-essential-summary">
        <DetailItem
          label={translate("common.property")}
          value={job.propertyName || translate("properties.unnamed")}
        />
        <DetailItem
          label={translate("common.client")}
          value={job.clientName || translate("common.notProvided")}
        />
        {job.guestName && (
          <DetailItem label={translate("jobs.guestName")} value={job.guestName} />
        )}
        <DetailItem
          label={translate("jobs.scheduledDate")}
          value={formatDate(job.scheduledDate, translate, language)}
        />
        {job.scheduledStart && (
          <DetailItem label={translate("jobs.scheduledTime")} value={job.scheduledStart} />
        )}
        <DetailItem
          label={translate("jobs.operationalStatus")}
          value={formatOperationalStatus(job.operationalStatus, translate)}
        />
        {!isAssignmentAware && isAssigned && (
          <DetailItem
            label={translate("jobs.assignedCleaner")}
            value={assignedCleanerName}
          />
        )}
        {!isAssignmentAware && isAssigned && (
          <DetailItem
            label={translate("jobs.assignedTime")}
            value={assignedAt || translate("common.notProvided")}
          />
        )}
        {["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus) && (
          <DetailItem
            label={translate("jobs.startedTime")}
            value={startedAt || translate("common.notProvided")}
          />
        )}
        {job.operationalStatus === "COMPLETED" && (
          <DetailItem
            label={translate("jobs.completedTime")}
            value={completedAt || translate("common.notProvided")}
          />
        )}
        {createdAt && (
          <DetailItem label={translate("jobs.createdTime")} value={createdAt} />
        )}
      </dl>

      <div className="service-cleaner-summary">
        <span>{translate("common.cleaner")}</span>
        <strong>{isLoadingAssignments ? translate("offers.loadingCleaners")
          : hasAssignmentsError ? translate("common.notProvided")
            : summaryCleanerNames.length ? summaryCleanerNames.join(", ")
              : job.assignedCleanerName || translate("dashboard.notAssigned")}</strong>
      </div>
      <ChecklistProgressSummary checklist={lifecyclePresentation.checklist} />
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
      <section className="service-financial-summary" aria-label={translate("lifecycle.financialSnapshot")}>
        <h3>{translate("lifecycle.financialSnapshot")}</h3>
        <dl className="detail-list">
          <DetailItem label={translate("jobs.clientPrice")} value={hasValue(job.clientPrice)
            ? formatPrice(job.clientPrice, translate, language) : translate("jobs.notSet")} />
          <DetailItem label={translate("jobs.cleanerPayout")} value={hasValue(job.cleanerPayout)
            ? formatPrice(job.cleanerPayout, translate, language) : translate("jobs.notSet")} />
          <DetailItem label={translate("jobs.grossMargin")} value={grossMargin === null
            ? translate("jobs.notSet") : formatPrice(grossMargin, translate, language)} />
        </dl>
      </section>
      <DataProvenanceReview record={job} onSave={onSaveDataProvenance} />

      <section ref={scheduleSectionRef} tabIndex={-1} className="job-details-edit" aria-label={translate("jobs.editSchedule")}>
        {hasSavedJobSchedule && !isEditingJobSchedule && (
          <p className="form-success" role="status">{translate("jobs.scheduleSaved")}</p>
        )}
        {hasSavedJobSchedule && scheduleCommunicationMayBeStale && !isEditingJobSchedule && (
          <p className="form-hint">{translate("jobs.scheduleExternalMessageWarning")}</p>
        )}
        {isEditingJobSchedule && (
          <form className="cleaning-form" noValidate onSubmit={saveJobSchedule}>
            <p className="form-hint">{translate("jobs.scheduleExternalMessageWarning")}</p>
            <label>
              {translate("jobs.scheduledDate")}
              <input
                required
                type="date"
                name="scheduledDate"
                value={jobScheduleValues.scheduledDate}
                onChange={(event) => setJobScheduleValues((current) => ({
                  ...current,
                  scheduledDate: event.target.value,
                }))}
              />
            </label>
            <label>
              {translate("jobs.scheduledTime")}
              <input
                type="time"
                name="scheduledStart"
                value={jobScheduleValues.scheduledStart}
                onChange={(event) => setJobScheduleValues((current) => ({
                  ...current,
                  scheduledStart: event.target.value,
                }))}
              />
            </label>
            {jobScheduleSaveError && <p className="form-error" role="alert">{jobScheduleSaveError}</p>}
            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSavingJobSchedule}
                onClick={() => {
                  setIsEditingJobSchedule(false);
                  setJobScheduleSaveError("");
                  setJobScheduleValues({
                    scheduledDate: job.scheduledDate || "",
                    scheduledStart: job.scheduledStart || "",
                  });
                }}
              >
                {translate("common.cancel")}
              </button>
              <button className="button button--primary" type="submit" disabled={isSavingJobSchedule}>
                {isSavingJobSchedule ? translate("jobs.savingSchedule") : translate("jobs.saveSchedule")}
              </button>
            </div>
          </form>
        )}
      </section>


      <section className="job-details-edit" aria-label={translate("jobs.editDetails")}>
        {!isEditingJobDetails && (
          <>
            <button
              className="button"
              type="button"
              disabled={!canEditJobDetails(job)}
              onClick={startJobDetailsEdit}
            >
              {translate("jobs.editDetails")}
            </button>
            {!canEditJobDetails(job) && (
              <p className="form-hint">{translate("jobs.detailsReadOnlyHistorical")}</p>
            )}
          </>
        )}
        {hasSavedJobDetails && !isEditingJobDetails && (
          <p className="form-success" role="status">{translate("jobs.detailsSaved")}</p>
        )}
        {isEditingJobDetails && (
          <form className="cleaning-form" noValidate onSubmit={saveJobDetails}>
            <label>
              {translate("jobs.guestName")}
              <input
                type="text"
                name="guestName"
                maxLength={maximumGuestNameLength}
                value={jobDetailValues.guestName}
                onChange={(event) => setJobDetailValues((current) => ({
                  ...current,
                  guestName: event.target.value,
                }))}
              />
            </label>
            <label>
              {translate("common.notes")}
              <textarea
                name="notes"
                rows="4"
                value={jobDetailValues.notes}
                onChange={(event) => setJobDetailValues((current) => ({
                  ...current,
                  notes: event.target.value,
                }))}
              />
            </label>
            {jobDetailsSaveError && <p className="form-error" role="alert">{jobDetailsSaveError}</p>}
            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSavingJobDetails}
                onClick={() => {
                  setIsEditingJobDetails(false);
                  setJobDetailsSaveError("");
                  setJobDetailValues({ guestName: job.guestName || "", notes: job.notes || "" });
                }}
              >
                {translate("common.cancel")}
              </button>
              <button className="button button--primary" type="submit" disabled={isSavingJobDetails}>
                {isSavingJobDetails ? translate("jobs.savingDetails") : translate("jobs.saveDetails")}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="job-pricing" aria-label={translate("jobs.editPrices")}>
        {!isEditingPrices && (
          <button className="button" type="button" onClick={startPriceEdit}>
            {translate("jobs.editPrices")}
          </button>
        )}
        {hasSavedPrices && !isEditingPrices && (
          <p className="form-success" role="status">{translate("jobs.pricesSaved")}</p>
        )}
        {isEditingPrices && (
          <form className="cleaning-form" noValidate onSubmit={savePrices}>
            <div className="form-row">
              <label>
                {translate("jobs.clientPrice")}
                <input
                  type="number"
                  name="clientPrice"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValues.clientPrice}
                  onChange={(event) => setPriceValues((current) => ({
                    ...current,
                    clientPrice: event.target.value,
                  }))}
                />
              </label>
              <label>
                {translate("jobs.cleanerPayout")}
                <input
                  type="number"
                  name="cleanerPayout"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValues.cleanerPayout}
                  onChange={(event) => setPriceValues((current) => ({
                    ...current,
                    cleanerPayout: event.target.value,
                  }))}
                />
              </label>
            </div>
            {priceSaveError && <p className="form-error" role="alert">{priceSaveError}</p>}
            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSavingPrices}
                onClick={() => {
                  setIsEditingPrices(false);
                  setPriceSaveError("");
                }}
              >
                {translate("common.cancel")}
              </button>
              <button className="button button--primary" type="submit" disabled={isSavingPrices}>
                {isSavingPrices ? translate("jobs.savingPrices") : translate("jobs.savePrices")}
              </button>
            </div>
          </form>
        )}
      </section>

      <section ref={checklistSectionRef} tabIndex={-1} className="job-checklist" aria-labelledby="job-checklist-title">
        <div className="issues-section__header">
          <h3 id="job-checklist-title">{translate("checklists.title")}</h3>
          {!isLoadingChecklistRun && checklistRun && (
            <button className="button" type="button" onClick={onOpenChecklistRun}>
              {translate(
                checklistRun.status === "DRAFT" ? "checklists.viewDraftProgress"
                  : checklistRun.status === "ABANDONED" ? "checklists.viewAbandonedRun"
                    : "checklists.open",
              )}
            </button>
          )}
          {!isLoadingChecklistRun && !checklistRun && !hasChecklistRunError
            && !job.archivedAt && !isCompleted && (
            <button
              className="button"
              type="button"
              disabled={isCreatingChecklistRun}
              onClick={onCreateChecklistRun}
            >
              {isCreatingChecklistRun
                ? translate("checklists.creating")
                : translate("checklists.create")}
            </button>
          )}
        </div>
        {isLoadingChecklistRun && (
          <StateCard message={translate("checklists.loading")} status="status" />
        )}
        {!isLoadingChecklistRun && hasChecklistRunError && (
          <>
            <StateCard message={translate("checklists.loadError")} status="alert" isError />
            <button className="button" type="button" onClick={onRefreshChecklistRun}>
              {translate("common.retry")}
            </button>
          </>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && !checklistRun && (
          <p className="job-checklist__summary">{translate("checklists.noRun")}</p>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && checklistRun && (
          <p className="job-checklist__summary">{translate(
            checklistRun.status === "DRAFT" ? "checklists.existingDraft"
              : checklistRun.status === "READY_FOR_REVIEW" ? "checklists.existingRun"
                : checklistRun.status === "ABANDONED" ? "checklists.existingAbandoned"
                  : "checklists.existingRunUnknown",
          )}</p>
        )}
        {hasCreateChecklistRunError && (
          <p className="form-error" role="alert">{translate("checklists.createError")}</p>
        )}
        <ChecklistCapabilityControls
          job={job}
          checklistRun={checklistRun}
          capability={checklistCapability}
          isLoading={isLoadingChecklistCapability}
          hasError={hasChecklistCapabilityError}
          isIssuing={isIssuingChecklistCapability}
          hasIssueError={hasIssueChecklistCapabilityError}
          isRevoking={isRevokingChecklistCapability}
          hasRevokeError={hasRevokeChecklistCapabilityError}
          onRefresh={onRefreshChecklistCapability}
          onIssue={onIssueChecklistCapability}
          onRevoke={onRevokeChecklistCapability}
        />
      </section>

      {canUseCompletionControls && (
        <section ref={completionSectionRef} tabIndex={-1} className="job-execution" aria-label={translate("jobs.completeService")}>
          {isLoadingChecklistRun && (
            <p className="form-hint">{translate("jobs.completionCheckingChecklist")}</p>
          )}
          {hasChecklistRunError && !isLoadingChecklistRun && (
            <p className="form-error" role="alert">{translate("jobs.completionChecklistUnavailable")}</p>
          )}
          {!isLoadingChecklistRun && !hasChecklistRunError && checklistRun && (
            <p className="form-hint">{translate(
              checklistRun.status === "DRAFT" ? "jobs.completionDraftOptions"
                : checklistRun.status === "READY_FOR_REVIEW" ? "jobs.completionRequiresChecklistReview"
                  : "jobs.completionChecklistUnavailable",
            )}</p>
          )}
          {!isLoadingChecklistRun && !hasChecklistRunError && !checklistRun && (
            <>
              {!isCompletionConfirmationVisible ? (
                <button className="button button--primary" type="button"
                  onClick={() => setIsCompletionConfirmationVisible(true)}>
                  {translate("jobs.completeService")}
                </button>
              ) : (
                <div>
                  <p>{translate("jobs.completeWithoutChecklistConfirm")}</p>
                  <div className="button-row">
                    <button className="button" type="button" disabled={isCompletingCleaning}
                      onClick={() => setIsCompletionConfirmationVisible(false)}>
                      {translate("common.cancel")}
                    </button>
                    <button className="button button--primary" type="button"
                      disabled={isCompletingCleaning} onClick={completeCleaning}>
                      {isCompletingCleaning ? translate("jobs.completingCleaning")
                        : translate("jobs.completeService")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {hasCompleteCleaningError && (
            <p className="form-error" role="alert">{translate("jobs.completeCleaningError")}</p>
          )}
        </section>
      )}

      {!isAssignmentAware && (job.operationalStatus === "ASSIGNED" ||
        isInProgress ||
        isCompleted) && (
        <section
          className="job-execution"
          aria-label={translate("jobs.operationalStatus")}
        >
          {isInProgress && (
            <p className="job-execution__state job-execution__state--in-progress">
              <OperationalIcon name="clock" />
              {translate("jobs.executionInProgress")}
            </p>
          )}
          {isCompleted && (
            <p className="job-execution__state job-execution__state--completed">
              <OperationalIcon name="check-circle" />
              {translate("jobs.executionCompleted")}
            </p>
          )}
          {job.operationalStatus === "ASSIGNED" && (
            <div className="button-row job-execution__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={isStartingCleaning}
                onClick={startCleaning}
              >
                {isStartingCleaning
                  ? translate("jobs.startingCleaning")
                  : translate("jobs.startCleaning")}
              </button>
            </div>
          )}
          {hasStartCleaningError && (
            <p className="form-error" role="alert">
              {translate("jobs.startCleaningError")}
            </p>
          )}
        </section>
      )}

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
                  <fieldset className="direct-cleaner-picker">
                    <legend>{translate("jobs.cleanerPickerResults")}</legend>
                      {directCleanerOptions.map((cleaner) => (
                        <label key={cleaner.id} className={`direct-cleaner-picker__option${directCleanerId === cleaner.id ? " direct-cleaner-picker__option--selected" : ""}`}>
                          <input type="radio" name="direct-cleaner" value={cleaner.id}
                            checked={directCleanerId === cleaner.id} disabled={isAssigningDirectly}
                            onChange={() => setDirectCleanerId(cleaner.id)} />
                          <span>{cleaner.name}</span>
                        </label>
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
                const acknowledgmentState = getAssignmentAcknowledgmentState(assignment, offers);

                return (
                  <article key={assignment.id} className="assignment-roster__item">
                    <strong>{assignmentCleanerName}</strong>
                    <span className="status-badge">
                      {formatOperationalStatus(assignment.executionStatus, translate)}
                    </span>
                    {acknowledgmentState && (
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
                        <label>
                          {translate("jobs.replacementCleaner")}
                          <select
                            value={replacementOfferId}
                            onChange={(event) => setReplacementOfferId(event.target.value)}
                          >
                            <option value="">{translate("common.notProvided")}</option>
                            {eligibleReplacementOffers.map((offer) => (
                              <option key={offer.id} value={offer.id}>
                                {currentCleanerName(
                                  offer.cleanerId,
                                  offer.cleanerName,
                                  cleanerNamesById,
                                  translate("common.notProvided"),
                                )}
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

      {reminderPreview && (
        <section ref={reminderSectionRef} tabIndex={-1} className="job-reminder-preview" aria-labelledby="job-reminder-preview-title">
          <div className="job-reminder-preview__header">
            <h3 id="job-reminder-preview-title">
              {translate("jobs.reminderPreviewTitle", { cleaner: reminderPreview.cleanerName })}
            </h3>
            <button
              className="button"
              type="button"
              disabled={isCopyingReminder}
              onClick={() => setReminderPreview(null)}
            >
              {translate("common.cancel")}
            </button>
          </div>

          {sensitivePropertyDetails.length > 0 && (
            <div className="job-reminder-preview__sensitive">
              <strong>{translate("jobs.reminderSensitiveAccessTitle")}</strong>
              <p>{translate("jobs.reminderSensitiveAccessWarning")}</p>
              <ul>
                {sensitivePropertyDetails.map(([key, value]) => (
                  <li key={key}>{translate(key, { details: value.trim() })}</li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={reminderPreview.includeSensitiveAccess}
                  onChange={(event) => setReminderPreview((current) => ({
                    ...current,
                    includeSensitiveAccess: event.target.checked,
                  }))}
                />
                {translate("jobs.reminderIncludeSensitiveAccess")}
              </label>
            </div>
          )}

          {reminderCleanerStillAssigned && (
            <div className="job-reminder-preview__sensitive">
              <label>
                <input type="checkbox" checked={reminderPreview.includeChecklist}
                  onChange={(event) => {
                    setHasReminderChecklistError(false);
                    setReminderPreview((current) => ({
                      ...current, includeChecklist: event.target.checked,
                      checklistUrl: null, checklistIssuedAt: null,
                    }));
                  }} />
                {translate("jobs.reminderIncludeChecklist")}
              </label>
              {reminderPreview.includeChecklist && (
                <>
                  <p className="form-hint">{translate("jobs.reminderChecklistPreparationHint")}</p>
                  {checklistCapability?.state === "ACTIVE" && !reminderChecklistCapabilityCurrent && (
                    <p className="form-hint">{translate("jobs.reminderExistingChecklistLinkWarning")}</p>
                  )}
                  {canPrepareChecklistForReminder && !reminderChecklistCapabilityCurrent && (
                    <button className="button" type="button"
                      disabled={isPreparingReminderChecklist || isIssuingChecklistCapability || isCreatingChecklistRun}
                      onClick={prepareReminderChecklist}>
                      {isPreparingReminderChecklist ? translate("jobs.reminderPreparingChecklist")
                        : translate("jobs.reminderPrepareChecklist")}
                    </button>
                  )}
                  {!canPrepareChecklistForReminder && (
                    <p className="form-error" role="alert">{translate("jobs.reminderChecklistUnavailable")}</p>
                  )}
                  {reminderChecklistCapabilityCurrent && (
                    <p className="form-success" role="status">{translate("jobs.reminderChecklistReady")}</p>
                  )}
                  {hasReminderChecklistError && (
                    <p className="form-error" role="alert">{translate("jobs.reminderChecklistError")}</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="job-reminder-preview__message">
            <strong>{translate("jobs.reminderPreviewMessage")}</strong>
            <p className="form-hint">
              {translate("jobs.messageForCleanerLanguage", {
                cleaner: reminderPreview.cleanerName,
                language: cleanerLanguageLabelFor(reminderPreview.cleanerId),
              })}
            </p>
            <pre>{reminderPreviewMessage}</pre>
          </div>
          <p className="form-hint">{translate("whatsapp.manualSendNote")}</p>

          {!reminderCleanerStillAssigned && (
            <p className="form-error" role="alert">
              {translate("jobs.reminderCleanerNoLongerAssigned")}
            </p>
          )}
          {copyMessageErrorCleanerId === reminderPreview.cleanerId && (
            <p className="form-error" role="alert">{translate("jobs.copyMessageError")}</p>
          )}

          <div className="job-reminder-preview__actions">
            {reminderWhatsAppUrl && reminderReadyToSend && (
              <a
                className="button button--primary"
                href={reminderWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate("whatsapp.openInWhatsApp")}
              </a>
            )}
            <button
              className="button"
              type="button"
              disabled={!reminderReadyToSend || isCopyingReminder}
              onClick={copyReminderMessage}
            >
              {isCopyingReminder
                ? translate("jobs.reminderCopying")
                : translate("jobs.reminderCopyNow")}
            </button>
          </div>
          {reminderReadyToSend && !reminderWhatsAppUrl && (
            <p className="form-hint">{translate("whatsapp.phoneNeeded")}</p>
          )}
        </section>
      )}

      {job.notes && (
        <section className="notes-section" aria-label={translate("common.notes")}>
          <h3>{translate("common.notes")}</h3>
          <p>{job.notes}</p>
        </section>
      )}

      <section ref={issuesSectionRef} tabIndex={-1} className="issues-section" aria-labelledby="issues-title">
        <div className="issues-section__header">
          <h3 id="issues-title">{translate("issues.title")}</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshIssues}
            disabled={isLoadingIssues}
          >
            {translate("issues.refresh")}
          </button>
        </div>

        {isLoadingIssues && (
          <StateCard message={translate("issues.loading")} status="status" />
        )}

        {!isLoadingIssues && hasIssuesError && (
          <StateCard
            message={translate("issues.error")}
            status="alert"
            isError
          />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length === 0 && (
          <StateCard message={translate("issues.empty")} />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length > 0 && (
          <div className="issue-list">
            {sortedIssues.map((issue) => {
              const issueCreatedAt = formatCreatedAt(issue.createdAt, language);
              const resolvedAt = formatCreatedAt(issue.resolvedAt, language);
              const isOpen = issue.status === "OPEN";
              const isResolutionFormVisible = resolvingIssueId === issue.id;

              return (
                <article key={issue.id} className="issue-card">
                  <div className="issue-card__header">
                    <strong>
                      {formatIssueCategory(issue.category, translate)}
                    </strong>
                    <span className="status-badge">
                      {issue.status === "RESOLVED"
                        ? translate("status.resolved")
                        : translate("status.open")}
                    </span>
                  </div>
                  <p>{issue.description || translate("common.notProvided")}</p>
                  <span>
                    {translate("issues.reportedBy", {
                      cleaner:
                        issue.cleanerName || translate("common.notProvided"),
                    })}
                  </span>
                  {issueCreatedAt && (
                    <span>
                      {translate("issues.reported")} {issueCreatedAt}
                    </span>
                  )}
                  {resolvedAt && (
                    <span>
                      {translate("issues.resolved")} {resolvedAt}
                    </span>
                  )}
                  {issue.status === "RESOLVED" &&
                    hasValue(issue.resolutionNote) && (
                      <p className="issue-card__resolution-note">
                        {translate("issues.resolution")}: {issue.resolutionNote}
                      </p>
                    )}

                  {isOpen && !isResolutionFormVisible && (
                    <div>
                      <button
                        className="button"
                        type="button"
                        onClick={() => openResolutionForm(issue)}
                      >
                        {translate("issues.resolve")}
                      </button>
                    </div>
                  )}

                  {isOpen && isResolutionFormVisible && (
                    <form
                      className="issue-resolution-form"
                      onSubmit={resolveSelectedIssue}
                    >
                      <p className="issue-resolution-form__summary">
                        <strong>
                          {formatIssueCategory(issue.category, translate)}
                        </strong>
                        <span>
                          {issue.description || translate("common.notProvided")}
                        </span>
                      </p>
                      <label>
                        {translate("issues.resolutionNote")}
                        <textarea
                          name="resolutionNote"
                          value={resolutionNote}
                          onChange={(event) =>
                            setResolutionNote(event.target.value)
                          }
                          rows="3"
                        />
                      </label>
                      {resolutionError && (
                        <p className="form-error" role="alert">
                          {resolutionError}
                        </p>
                      )}
                      <div className="button-row">
                        <button
                          className="button"
                          type="button"
                          disabled={isResolvingIssue}
                          onClick={closeResolutionForm}
                        >
                          {translate("common.cancel")}
                        </button>
                        <button
                          className="button button--primary"
                          type="submit"
                          disabled={isResolvingIssue}
                        >
                          {isResolvingIssue
                            ? translate("issues.resolving")
                            : translate("issues.resolve")}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

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

        {offersCreatedCount !== null && (
          <p className="offers-section__success" role="status">
            {translate("offers.createdReadyToShare", { count: offersCreatedCount })}
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
            {sortedOffers.map((offer) => {
              const respondedAt = formatCreatedAt(offer.respondedAt, language);
              const offerCleanerName = currentCleanerName(
                offer.cleanerId,
                offer.cleanerName,
                cleanerNamesById,
                translate("common.notProvided"),
              );
              const canCreatePublicLink =
                offer.status === "PENDING" &&
                (!isAssignmentAware
                  ? job.operationalStatus === "OFFERED"
                  : ["OFFERED", "ASSIGNED"].includes(job.operationalStatus));
              const compensationSuggestion = getOfferCompensationSuggestion(job, offer);
              const isEditingOfferCompensation = editingOfferCompensationFor === offer.id;
              const offerMessage = offerMessageFor(offer, offerCleanerName);
              const offerWhatsAppUrl = buildWhatsAppHandoffUrl(
                cleanerPhonesById[offer.cleanerId],
                offerMessage,
              );

              return (
                <article key={offer.id} className="offer-status-item">
                  <div>
                    <strong>{offerCleanerName}</strong>
                    {respondedAt && (
                      <span>
                        {translate("offers.responded")} {respondedAt}
                      </span>
                    )}
                  </div>
                  <span className="status-badge">
                    {translate(
                      {
                        PENDING: "status.pending",
                        INTERESTED: "status.interested",
                        DECLINED: "status.declined",
                      }[offer.status] || "common.notProvided",
                    )}
                  </span>
                  {canManageOffers && (
                    <div className="offer-status-actions">
                      {canCreatePublicLink && !isEditingOfferCompensation && (
                        <button
                          className="button"
                          type="button"
                          disabled={isCreatingPublicOfferLinkFor !== null}
                          onClick={() => openOfferLinkForm(offer)}
                        >
                          {translate("offers.createPublicLink")}
                        </button>
                      )}
                      {offer.status === "INTERESTED" &&
                        (isAssignmentAware
                          ? canEditRoster && !assignedCleanerIds.includes(offer.cleanerId)
                          : !isAssigned) && (
                        <button
                          className="button button--primary"
                          type="button"
                          disabled={assigningCleanerId !== null}
                          onClick={() => assignCleaner(offer)}
                        >
                          {assigningCleanerId === offer.cleanerId
                            ? translate("offers.assigning")
                            : translate("offers.assign")}
                        </button>
                      )}
                    </div>
                  )}
                  {canManageOffers && canCreatePublicLink && isEditingOfferCompensation && (
                    <form
                      className="offer-compensation-form"
                      onSubmit={(event) => createOfferLink(event, offer)}
                    >
                      <label>
                        {translate("offers.offeredCompensation")}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={offerCompensationInput}
                          onChange={(event) => {
                            setOfferCompensationInput(event.target.value);
                            setOfferCompensationErrorFor(null);
                          }}
                        />
                      </label>
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
                  {publicOfferLink?.offerId === offer.id && !isEditingOfferCompensation && (
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
                        {hasValue(publicOfferLink.offeredCompensation)
                          ? formatPrice(publicOfferLink.offeredCompensation, translate, language)
                          : translate("publicOffer.amountNotSet")}
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
                      <p className="form-hint">{translate("whatsapp.manualSendNote")}</p>
                      {!hasValue(publicOfferLink.offeredCompensation) && (
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
            })}
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
      <details className="job-detail__secondary-actions">
        <summary>{translate("jobs.secondaryActions")}</summary>
        <RecordArchiveControl record={job} canRestore={canRestore} onArchive={onArchive} onRestore={onRestore} />
      </details>
      <ScrollToTopButton />
    </section>
  );
}
