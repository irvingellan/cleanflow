/**
 * Persistent notification inbox — role-aware UI contract (types only).
 * Extends contracts/notificationCenter.ts (manager inbox, delivery steps).
 * Status: PROPOSAL (#85, #39, #84). Prototype: flows/Inbox.jsx, hub/hubModel.js inboxFor.
 *
 * The inbox entry IS the durable record. Push is only a transport; its outcome
 * is shown separately and honestly.
 */
import type { ManagerNotification, NotificationDelivery, LocalStamp } from "./notificationCenter";

export type InboxRole = "manager" | "cleaner";

export type CleanerCategoryId = "cleanerAssigned" | "cleanerOffer" | "cleanerReminder" | "cleanerMoved" | "cleanerRemoved";

/**
 * Business event delivered to ONE cleaner. Server must guarantee:
 * - the cleaner sees only events addressed to her (audience.cleanerId === auth uid mapping);
 * - params never contain other cleaners' names, client amounts, margins, access codes or full addresses;
 * - "removed" events carry jobId = null (she can no longer open that job).
 */
export interface CleanerNotification {
  id: string;
  organizationId: string;
  audience: { cleanerId: string };
  category: CleanerCategoryId;
  titleKey: string;
  bodyKey?: string;
  params: { property?: string; date?: string };
  jobId: string | null;
  createdAt: LocalStamp;
  read: boolean;
  tappedBeforeRead?: boolean;
  delivery: NotificationDelivery; // targets: 0 when she has no ready device — the entry still exists
}

export type InboxEntry = ManagerNotification | CleanerNotification;

/** Manager entries have no `audience`. Cleaner entries never appear in the manager inbox. */
export type InboxFilterFn = (list: InboxEntry[], role: InboxRole, cleanerId?: string) => InboxEntry[];

export interface NotificationCenterProps {
  role?: InboxRole;                // default "manager"
  cleanerId?: string | null;       // required when role = "cleaner"
  initialId?: string | null;
  split?: boolean;                 // desktop two-pane
  /** Cleaner Hub opens jobs inside the hub instead of the manager workspace. */
  onOpenJob?: (n: InboxEntry) => void;
  /** Slot for role-specific tools (cleaner: none by default). */
  extra?: unknown;
}

/** Truthful transport labels; "displayed"/"opened" only with evidence. */
export type TransportLabel = "created" | "targeted" | "providerAccepted" | "unknown" | "deviceConfirmed" | "opened";

export interface InboxService {
  list(role: InboxRole, opts: { cursor?: string; filter?: "all" | "unread" | string; query?: string }): Promise<{ items: InboxEntry[]; next?: string }>;
  markRead(id: string): Promise<void>;
  markUnread(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** Push tap handler: records openedAt WITHOUT marking read. */
  recordOpenedFromPush(id: string): Promise<void>;
  /** Realtime subscription for new entries (works when push fails). */
  subscribe(role: InboxRole, onEntry: (e: InboxEntry) => void): () => void;
}
