/**
 * Manager Notification Center — proposed contract (types only, no runtime code).
 *
 * Status: PROPOSAL. Production today sends some pushes (cleaner interested,
 * assignment confirmed, checklist received) but stores NO notification history.
 * These types describe what the prototype UI needs so Codex can design the
 * backend (persistence, rules, delivery receipts). Nothing here is wired to
 * Firebase. Field names are suggestions, not a schema decision.
 */

// ---------- Categories ----------

export type NotificationCategoryId =
  | "cleanerInterested"     // implemented push today
  | "assignmentConfirmed"   // implemented push today
  | "checklistReceived"     // implemented push today
  | "offerDeclined"         // proposed
  | "issueReported"         // proposed
  | "missingCleaner"        // proposed
  | "todayReminder"         // proposed
  | "tomorrowPlanning"      // proposed
  | "admin"                 // proposed (account / security)
  | "deviceTest";           // proposed

export type NotificationGroup = "offers" | "checklists" | "issues" | "planning" | "system";

export interface NotificationCategory {
  id: NotificationCategoryId;
  group: NotificationGroup;
  /** "implemented" = Production already sends this push. */
  status: "implemented" | "proposed";
}

// ---------- One inbox entry ----------

/** Local calendar date (YYYY-MM-DD, organization time zone) + minutes since midnight. */
export interface LocalStamp { date: string; min: number }

export type NotificationSource = "cleaner" | "system" | "manager";

export interface ManagerNotification {
  id: string;
  organizationId: string;          // multi-tenant from day one
  recipientUserId: string;         // the manager who should see it
  category: NotificationCategoryId;
  /** i18n keys + params; never store rendered text in one language only. */
  titleKey: string;
  bodyKey?: string;
  params: Record<string, string | number>;
  jobId: string | null;            // deep link target, if any
  source: NotificationSource;
  createdAt: LocalStamp;
  /** Read = the manager opened the detail in the inbox (or "mark all read"). */
  read: boolean;
  /** True when opened from the push but the inbox detail was not read yet. */
  tappedBeforeRead?: boolean;
  delivery: NotificationDelivery;
}

// ---------- Delivery honesty ----------

/**
 * Every step is optional evidence. The UI must show "unknown" when there is
 * no evidence, never "delivered". `displayed` can only be "confirmed" if the
 * device reported it (e.g. service-worker receipt); "generic" records the
 * observed "New Notification" defect (push shown without its content).
 */
export interface NotificationDelivery {
  targets: number;                                  // active device registrations targeted
  accepted: boolean | null;                         // push provider accepted the request
  displayed: "confirmed" | "unknown" | "generic";
  openedAt: LocalStamp | null;
  /** false when this category does not record opens at all. */
  openTracked: boolean;
}

export type DeliveryStepKey = "created" | "targeted" | "accepted" | "displayed" | "opened";
export type DeliveryStepState = "done" | "failed" | "unknown" | "notTracked";

// ---------- Devices and settings ----------

export interface ManagerDeviceStatus {
  id: string;                       // opaque; never the push token
  label: string;                    // user-facing, e.g. "This device"
  kind: string;                     // e.g. "iPhone · Safari (home-screen app)"
  current: boolean;
  status: "ok" | "silent" | "revoked";
  enabledAt: LocalStamp;
  lastTestAt: LocalStamp | null;
  // NOTE: tokens are never sent to the client UI or shown in diagnostics.
}

export type PermissionState = "granted" | "default" | "denied";

export interface NotificationSettings {
  permission: PermissionState;      // from the browser, per device
  /** Per-category push opt-in. Turning one off stops the push, never the inbox entry. */
  prefs: Partial<Record<NotificationCategoryId, boolean>>;
}

// ---------- Component props (prototype components) ----------

export interface NotificationCenterProps {
  /** Open straight on one notification's detail. */
  initialId?: string | null;
  /** Desktop: list and detail side by side. */
  split?: boolean;
}

export interface NotificationRowProps {
  notification: ManagerNotification;
  selected?: boolean;
  onSelect(notification: ManagerNotification): void;
}

export interface NotificationDetailProps {
  notification: ManagerNotification;
  onBack?: () => void;
  onOpenJob(notification: ManagerNotification): void;
}

export interface DeliveryTimelineProps { notification: ManagerNotification }

export interface DeviceStatusCardProps { onSettings?: () => void }

export interface PushBannerProps { /* reads the simulated push from the store */ }

export interface AccountSheetProps {
  onClose(): void;
  section?: "account" | "preferences" | "notifications" | "help" | "advanced";
}

// ---------- Contract for the two reported defects ----------

/**
 * Defect A — push shows as "New Notification" without content.
 *   Expected: title/body always present in the payload the device renders.
 *   Evidence needed: the device-side receipt sets delivery.displayed.
 *
 * Defect B — a second manager phone stops receiving after another device is enabled.
 *   Expected: enabling a device adds a registration; it never replaces another
 *   user's or device's registration. ManagerDeviceStatus.status = "silent"
 *   should be derivable from server data (last successful send per device).
 *
 * Both are backend work (Codex). The prototype only shows how the UI would
 * surface them; it does not fix them.
 */
export type KnownNotificationDefect = "genericTitle" | "secondDeviceSilent";
