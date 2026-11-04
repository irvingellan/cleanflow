// Presenter-side read models. These enforce the DEMO isolation rules:
// a cleaner only ever sees her own entries, offers and amounts; an account
// switched on a device never sees the previous account's data.
import { readableEntries } from "./engine.ts";
import type { DeliveryAttempt, Device, InboxEntry, Job, NotificationEvent, Offer, World } from "./types.ts";

export { readableEntries };

export interface InboxItem {
  entry: InboxEntry;
  event: NotificationEvent;
}

export function inboxItems(w: World, deviceId: string): InboxItem[] {
  return readableEntries(w, deviceId)
    .map((entry) => ({ entry, event: w.events.find((e) => e.eventId === entry.eventId)! }))
    .sort((a, b) => b.entry.createdSeq - a.entry.createdSeq);
}

export function unreadCount(w: World, deviceId: string): number {
  return readableEntries(w, deviceId).filter((e) => e.unread && e.archivedAt === null).length;
}

/** Pushes currently on the lock screen of a device (explicitly displayed only). */
export function lockScreenPushes(w: World, deviceId: string): Array<{ attempt: DeliveryAttempt; event: NotificationEvent }> {
  const device = w.devices[deviceId];
  if (!device) return [];
  return w.attempts
    .filter((a) => a.deviceId === deviceId && a.displayedAt !== null && a.openedAt === null && a.dismissedAt === null)
    .filter((a) => a.userId === device.signedInUserId)
    .map((attempt) => ({ attempt, event: w.events.find((e) => e.eventId === attempt.eventId)! }))
    .reverse();
}

/** Accepted by the provider but display not simulated: shown as a neutral hint only. */
export function acceptedNotDisplayed(w: World, deviceId: string): DeliveryAttempt[] {
  return w.attempts.filter((a) => a.deviceId === deviceId && a.providerResult === "ACCEPTED" && a.displayedAt === null && a.suppressedReason === null);
}

export interface CleanerOfferView {
  jobId: string;
  propertyName: string;
  date: string;
  start: string;
  status: Offer["status"];
  mode: Job["offerMode"];
  /** Her own amount only. */
  amount: number;
}

export function cleanerAgenda(w: World, deviceId: string): { jobs: Job[]; offers: CleanerOfferView[] } {
  const device = w.devices[deviceId];
  const userId = device?.signedInUserId;
  const user = userId ? w.users[userId] : undefined;
  if (!device || !user || !user.active || user.role !== "CLEANER") return { jobs: [], offers: [] };
  const jobs = Object.values(w.jobs)
    .filter((j) => j.orgId === user.orgId && j.assignedCleanerId === user.id && !j.archived)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const offers = Object.values(w.offers)
    .filter((o) => o.cleanerId === user.id)
    .map((o) => ({ offer: o, job: w.jobs[o.jobId]! }))
    .filter(({ job, offer }) => job.orgId === user.orgId && ["PENDING", "INTERESTED", "UNAVAILABLE"].includes(offer.status))
    .map(({ offer, job }) => ({
      jobId: job.id,
      propertyName: job.propertyName,
      date: job.date,
      start: job.start,
      status: offer.status,
      mode: job.offerMode,
      amount: offer.amount,
    }));
  return { jobs, offers };
}

export function managerPending(w: World, orgId: string): Job[] {
  return Object.values(w.jobs).filter((j) => j.orgId === orgId && !j.archived && (j.checklist === "READY_FOR_REVIEW" || !j.assignedCleanerId));
}

export interface PersonaRow {
  userId: string;
  name: string;
  role: string;
  orgId: string;
  active: boolean;
  devices: Device[];
  unread: number;
  lastSyncAt: number;
}

export function personaTable(w: World): PersonaRow[] {
  return Object.values(w.users).map((u) => {
    const devices = Object.values(w.devices).filter((d) => d.userId === u.id);
    return {
      userId: u.id,
      name: u.displayName,
      role: u.role,
      orgId: u.orgId,
      active: u.active,
      devices,
      unread: w.inbox.filter((e) => e.userId === u.id && e.unread && e.archivedAt === null).length,
      lastSyncAt: devices.reduce((m, d) => Math.max(m, d.online ? w.clock : d.lastSyncAt), 0),
    };
  });
}

export interface RecipientCount {
  userId: string;
  events: number;
  inbox: number;
  accepted: number;
  rejected: number;
  unknown: number;
  blocked: number;
  displayed: number;
  opened: number;
}

export function recipientCounts(w: World): RecipientCount[] {
  return Object.keys(w.users)
    .map((userId) => {
      const attempts = w.attempts.filter((a) => a.userId === userId);
      return {
        userId,
        events: w.events.filter((e) => e.recipients.includes(userId)).length,
        inbox: w.inbox.filter((e) => e.userId === userId).length,
        accepted: attempts.filter((a) => a.providerResult === "ACCEPTED").length,
        rejected: attempts.filter((a) => a.providerResult === "REJECTED").length,
        unknown: attempts.filter((a) => a.providerResult === "UNKNOWN").length,
        blocked: attempts.filter((a) => a.providerResult === "NOT_ATTEMPTED").length,
        displayed: attempts.filter((a) => a.displayedAt !== null).length,
        opened: attempts.filter((a) => a.openedAt !== null).length,
      };
    })
    .filter((c) => c.events || c.inbox);
}

/** Delivery level of an attempt, highest proven level only. */
export function attemptLevel(a: DeliveryAttempt): "BLOCKED" | "TARGETED" | "ACCEPTED" | "REJECTED" | "UNKNOWN" | "DISPLAYED" | "OPENED" | "SUPPRESSED" {
  if (a.openedAt !== null) return "OPENED";
  if (a.displayedAt !== null) return "DISPLAYED";
  if (a.suppressedReason) return "SUPPRESSED";
  if (a.providerResult === "ACCEPTED") return "ACCEPTED";
  if (a.providerResult === "REJECTED") return "REJECTED";
  if (a.providerResult === "UNKNOWN") return "UNKNOWN";
  if (a.blockedReason) return "BLOCKED";
  return "TARGETED";
}

/** Sanitized payload as the future provider would receive it — never secrets. */
export function sanitizedPayload(event: NotificationEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    type: event.type,
    orgId: event.orgId,
    jobRef: event.jobId,
    priority: event.priority,
    deepLink: event.deepLink,
    params: event.params,
    omitted: ["pushToken", "clientPrice", "accessCode", "address", "guestName", "otherCleaners"],
  };
}
