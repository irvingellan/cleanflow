// CleanFlow Notification Lab — simulated domain model.
// Everything here is fictitious. Nothing in this module talks to Firebase,
// FCM, OneSignal, the browser Notifications API or the network.

export type Locale = "pt" | "en" | "es";
export type Role = "MANAGER" | "CLEANER";

export interface User {
  id: string;
  role: Role;
  orgId: string;
  active: boolean;
  locale: Locale;
  displayName: string;
}

export type Platform = "ios" | "android" | "desktop";
export type Permission = "default" | "denied" | "granted";
export type Subscription = "missing" | "active" | "stale";
export type ProviderMode = "accepted" | "rejected" | "timeout" | "unknown";

export interface Device {
  id: string;
  /** Owner of the registration (who registered push on this device). */
  userId: string;
  /** Account currently signed in on the device (changes on account switch). */
  signedInUserId: string | null;
  label: string;
  platform: Platform;
  browser: string;
  installed: boolean;
  /** true = opened from the Home Screen icon; false = a browser tab. */
  standalone: boolean;
  permission: Permission;
  subscription: Subscription;
  online: boolean;
  foreground: boolean;
  providerMode: ProviderMode;
  /** Sequence number of the last server-confirmed sync of this device. */
  lastSyncSeq: number;
  lastSyncAt: number;
  /** false = this device is not part of the scenario (not registered, not shown). */
  visible: boolean;
}

export type JobStatus = "UNASSIGNED" | "OFFERED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type OfferMode = "MANUAL" | "AUTO";
export type ChecklistStatus = "NONE" | "AVAILABLE" | "READY_FOR_REVIEW" | "REVIEWED";

export interface Job {
  id: string;
  orgId: string;
  propertyName: string;
  date: string; // YYYY-MM-DD in the org time zone
  start: string; // HH:mm in the org time zone
  status: JobStatus;
  assignedCleanerId: string | null;
  offerMode: OfferMode;
  revision: number;
  /** Cancelled Jobs are archived; CANCELLED is not a lifecycle state. */
  archived: boolean;
  checklist: ChecklistStatus;
  /** Cleaners who confirmed "I'll be there" for the current assignment revision. */
  attendanceConfirmed: string[];
}

export type OfferStatus = "PENDING" | "INTERESTED" | "DECLINED" | "ACCEPTED" | "UNAVAILABLE" | "EXPIRED" | "REVOKED";

export interface Offer {
  id: string;
  jobId: string;
  cleanerId: string;
  status: OfferStatus;
  validUntil: number;
  /** The cleaner's own offered amount — only ever shown to that cleaner. */
  amount: number;
}

export type EventType =
  | "OFFER_INTEREST"
  | "OFFER_AUTO_ASSIGNED"
  | "ATTENDANCE_CONFIRMED"
  | "CHECKLIST_READY_FOR_REVIEW"
  | "MANAGER_PLAN_TOMORROW"
  | "MANAGER_TODAY"
  | "OFFER_DECLINED"
  | "OFFER_EXPIRED"
  | "CLEANER_ISSUE_REPORTED"
  | "EXCEPTION_ALERT"
  | "CLEANER_ACCESS_REVOKED"
  | "PUSH_REGISTRATION_FAILED"
  | "OFFER_NEW"
  | "OFFER_WON"
  | "JOB_ASSIGNED"
  | "JOB_RESCHEDULED"
  | "JOB_CANCELLED"
  | "JOB_REMOVED"
  | "REMINDER_DAY_BEFORE"
  | "REMINDER_LEAD"
  | "CHECKLIST_AVAILABLE"
  | "SPECIAL_REQUEST";

export type Priority = "high" | "normal" | "low";
export type Channel = "push" | "inApp";

export interface EventParams {
  property?: string;
  date?: string;
  start?: string;
  fromDate?: string;
  fromStart?: string;
  count?: number;
  attention?: number;
  issue?: string;
  name?: string;
}

export interface NotificationEvent {
  eventId: string;
  idempotencyKey: string;
  type: EventType;
  orgId: string;
  jobId: string | null;
  recipients: string[];
  createdAt: number;
  createdSeq: number;
  priority: Priority;
  /** Channels the event asks for; push is still subject to device readiness. */
  channels: Channel[];
  params: EventParams;
  deepLink: string;
  /** true when the behavior is a proposal that does not exist in Production. */
  proposal: boolean;
}

export interface InboxEntry {
  id: string;
  userId: string;
  eventId: string;
  unread: boolean;
  createdAt: number;
  createdSeq: number;
  openedAt: number | null;
  archivedAt: number | null;
}

export type ProviderResult = "ACCEPTED" | "REJECTED" | "UNKNOWN" | "NOT_ATTEMPTED";

export interface DeliveryAttempt {
  id: string;
  eventId: string;
  userId: string;
  deviceId: string;
  channel: "push";
  providerResult: ProviderResult;
  blockedReason: string | null;
  unknownReason: string | null;
  enqueuedAt: number;
  displayedAt: number | null;
  dismissedAt: number | null;
  openedAt: number | null;
  suppressedReason: string | null;
}

export type TimelineStep =
  | "BUSINESS_CHANGE"
  | "BUSINESS_REJECTED"
  | "EVENT_CREATED"
  | "EVENT_DEDUPED"
  | "RECIPIENT_SELECTED"
  | "RECIPIENT_BLOCKED"
  | "INBOX_STORED"
  | "PUSH_SKIPPED"
  | "PUSH_ATTEMPTED"
  | "PROVIDER_ACCEPTED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_UNKNOWN"
  | "DEVICE_CLEANED"
  | "DISPLAYED"
  | "DISPLAY_SUPPRESSED"
  | "DISMISSED"
  | "OPENED"
  | "READ"
  | "ARCHIVED"
  | "DEVICE_CHANGED"
  | "SYNCED"
  | "CLOCK";

export type TimelineResult = "ok" | "blocked" | "warn" | "info";

export interface TimelineRecord {
  seq: number;
  at: number;
  step: TimelineStep;
  result: TimelineResult;
  /** Machine reason code; translated by the presenter. */
  reason: string | null;
  /** Short machine-readable detail for logs (never real data). */
  detail: string;
  eventId: string | null;
  userId: string | null;
  deviceId: string | null;
  attemptId: string | null;
}

export interface LabSettings {
  timeZone: string;
  /** Quiet hours in the org time zone, "HH:mm". Normal/low priority push waits. */
  quietStart: string;
  quietEnd: string;
  reminderLeadHours: number;
  dayBeforeHour: string;
  /** "push" = in-app + simulated push; "inApp" = in-app only. */
  channel: "push" | "inApp";
}

/** One queued micro-transition of the notification pipeline. */
export type Transition =
  | { kind: "selectRecipients"; eventId: string }
  | { kind: "storeInbox"; eventId: string; userId: string }
  | { kind: "attemptPush"; eventId: string; userId: string; deviceId: string };

export interface World {
  seed: number;
  rngState: number;
  clock: number;
  seq: number;
  counters: Record<string, number>;
  settings: LabSettings;
  orgs: Record<string, { id: string; name: string }>;
  users: Record<string, User>;
  devices: Record<string, Device>;
  jobs: Record<string, Job>;
  offers: Record<string, Offer>;
  events: NotificationEvent[];
  inbox: InboxEntry[];
  attempts: DeliveryAttempt[];
  timeline: TimelineRecord[];
  idempotencyKeys: string[];
  queue: Transition[];
  /** What a device's app shows after F10-style opens ("unavailable", job view...). */
  openContext: Record<string, OpenContext | null>;
}

export type OpenContext =
  | { kind: "job"; jobId: string }
  | { kind: "offer"; jobId: string }
  | { kind: "checklist"; jobId: string }
  | { kind: "unavailable"; reason: "job_cancelled" | "no_longer_assigned" | "offer_taken" }
  | { kind: "accessEnded" }
  | { kind: "inbox" }
  | { kind: "request"; jobId: string };

/** Commands are what scenario scripts and lab buttons apply to the world. */
export type Command =
  | { type: "SEND_OFFER"; jobId: string; cleanerIds: string[]; mode: OfferMode }
  | { type: "RESPOND_OFFER"; jobId: string; cleanerId: string; response: "INTERESTED" | "DECLINED" | "ACCEPT" }
  | { type: "RACE_ACCEPT"; jobId: string; cleanerIds: string[] }
  | { type: "ASSIGN"; jobId: string; cleanerId: string }
  | { type: "CONFIRM_ATTENDANCE"; jobId: string; cleanerId: string }
  | { type: "RESCHEDULE"; jobId: string; date: string; start: string }
  | { type: "CANCEL_JOB"; jobId: string }
  | { type: "REMOVE_CLEANER"; jobId: string }
  | { type: "REPLACE_CLEANER"; jobId: string; cleanerId: string }
  | { type: "EXPIRE_OFFERS"; jobId: string }
  | { type: "CHECKLIST_AVAILABLE"; jobId: string }
  | { type: "CHECKLIST_SUBMIT"; jobId: string; cleanerId: string }
  | { type: "REPORT_ISSUE"; jobId: string; cleanerId: string; issue: "damage" | "supplies" | "problem" }
  | { type: "SPECIAL_REQUEST"; jobId: string; cleanerId: string }
  | { type: "RUN_REMINDER"; kind: "MANAGER_19" | "MANAGER_07" | "CLEANER_DAY_BEFORE" | "CLEANER_LEAD" | "EXCEPTIONS" }
  | { type: "SET_CLOCK"; date: string; time: string }
  | { type: "REVOKE_ACCESS"; userId: string }
  | { type: "PUSH_REGISTRATION_FAILED"; deviceId: string }
  | { type: "SET_DEVICE"; deviceId: string; patch: Partial<Omit<Device, "id" | "userId">> }
  | { type: "SWITCH_ACCOUNT"; deviceId: string; userId: string | null }
  | { type: "RECONNECT"; deviceId: string }
  | { type: "SET_ONLINE"; deviceId: string; online: boolean }
  | { type: "REVOKE_SUBSCRIPTION"; deviceId: string }
  | { type: "SIMULATE_DISPLAY"; attemptId?: string; deviceId?: string }
  | { type: "DISMISS_PUSH"; deviceId: string }
  | { type: "OPEN_PUSH"; attemptId?: string; deviceId?: string }
  | { type: "OPEN_INBOX_ENTRY"; deviceId: string; entryId?: string }
  | { type: "MARK_READ"; deviceId: string; entryId?: string }
  | { type: "MARK_ALL_READ"; deviceId: string }
  | { type: "ARCHIVE"; deviceId: string; entryId?: string }
  | { type: "SET_SETTINGS"; patch: Partial<LabSettings> }
  | { type: "SET_PROVIDER_ALL"; mode: ProviderMode };
