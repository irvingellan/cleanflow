// SimulationEngine core: applies Commands (business changes) and processes the
// notification pipeline one queued Transition at a time.
//
// Pipeline levels (never inferred from one another):
//   EVENT_CREATED → RECIPIENT_SELECTED → INBOX_STORED → PUSH_ATTEMPTED →
//   PROVIDER_ACCEPTED | PROVIDER_REJECTED | PROVIDER_UNKNOWN →
//   DISPLAYED (only by an explicit "simulate display") → OPENED / READ (only by a click).
//
// These are EXPECTATIONS for the future real implementation, not proof of backend
// security. Real authorization must be verified by Codex with emulator tests.

import { addDays, inQuietHours, nextRandom, zonedParts, zonedToEpoch } from "./clock.ts";
import type {
  Channel,
  Command,
  DeliveryAttempt,
  EventParams,
  EventType,
  InboxEntry,
  Job,
  NotificationEvent,
  Offer,
  OpenContext,
  Priority,
  TimelineRecord,
  Transition,
  User,
  World,
} from "./types.ts";

const STEP_MS = 1000;

// ---------------------------------------------------------------------------
// Small helpers

function nextId(w: World, prefix: string): string {
  const n = (w.counters[prefix] ?? 0) + 1;
  w.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function tick(w: World): void {
  w.seq += 1;
  w.clock += STEP_MS;
}

type LogInput = Omit<TimelineRecord, "seq" | "at" | "eventId" | "userId" | "deviceId" | "attemptId" | "reason" | "detail"> &
  Partial<Pick<TimelineRecord, "eventId" | "userId" | "deviceId" | "attemptId" | "reason" | "detail">>;

function log(w: World, input: LogInput): void {
  w.timeline.push({
    seq: w.seq,
    at: w.clock,
    eventId: null,
    userId: null,
    deviceId: null,
    attemptId: null,
    reason: null,
    detail: "",
    ...input,
  });
}

function random(w: World): number {
  const [value, next] = nextRandom(w.rngState);
  w.rngState = next;
  return value;
}

function today(w: World): string {
  return zonedParts(w.clock, w.settings.timeZone).date;
}

function managersOf(w: World, orgId: string): string[] {
  return Object.values(w.users)
    .filter((u) => u.orgId === orgId && u.role === "MANAGER")
    .map((u) => u.id);
}

function offerFor(w: World, jobId: string, cleanerId: string): Offer | undefined {
  return Object.values(w.offers).find((o) => o.jobId === jobId && o.cleanerId === cleanerId);
}

function offersOfJob(w: World, jobId: string): Offer[] {
  return Object.values(w.offers).filter((o) => o.jobId === jobId);
}

function jobParams(job: Job): EventParams {
  return { property: job.propertyName, date: job.date, start: job.start };
}

function reject(w: World, reason: string, detail: string, extra: Partial<TimelineRecord> = {}): void {
  log(w, { step: "BUSINESS_REJECTED", result: "blocked", reason, detail, ...extra });
}

function change(w: World, reason: string, detail: string, extra: Partial<TimelineRecord> = {}): void {
  log(w, { step: "BUSINESS_CHANGE", result: "ok", reason, detail, ...extra });
}

// ---------------------------------------------------------------------------
// Event creation (idempotent)

interface EmitSpec {
  type: EventType;
  key: string;
  orgId: string;
  jobId: string | null;
  recipients: string[];
  priority: Priority;
  channels: Channel[];
  params: EventParams;
  proposal: boolean;
  deepLink: string;
}

function emit(w: World, spec: EmitSpec): NotificationEvent | null {
  if (w.idempotencyKeys.includes(spec.key)) {
    const original = w.events.find((e) => e.idempotencyKey === spec.key);
    log(w, {
      step: "EVENT_DEDUPED",
      result: "info",
      reason: "same_idempotency_key",
      detail: spec.key,
      eventId: original?.eventId ?? null,
    });
    return null;
  }
  w.idempotencyKeys.push(spec.key);
  const event: NotificationEvent = {
    eventId: nextId(w, "evt"),
    idempotencyKey: spec.key,
    type: spec.type,
    orgId: spec.orgId,
    jobId: spec.jobId,
    recipients: spec.recipients,
    createdAt: w.clock,
    createdSeq: w.seq,
    priority: spec.priority,
    channels: spec.channels,
    params: spec.params,
    deepLink: spec.deepLink,
    proposal: spec.proposal,
  };
  w.events.push(event);
  log(w, {
    step: "EVENT_CREATED",
    result: "ok",
    detail: `${spec.type} · ${spec.key}`,
    eventId: event.eventId,
    reason: spec.proposal ? "proposal_not_in_production" : null,
  });
  w.queue.push({ kind: "selectRecipients", eventId: event.eventId });
  return event;
}

function managerEvent(w: World, type: EventType, key: string, job: Job | null, opts: Partial<EmitSpec> = {}): void {
  const orgId = job?.orgId ?? opts.orgId ?? "org-demo";
  emit(w, {
    type,
    key,
    orgId,
    jobId: job?.id ?? null,
    recipients: managersOf(w, orgId),
    priority: "normal",
    channels: ["inApp", "push"],
    params: job ? jobParams(job) : {},
    proposal: false,
    deepLink: job ? `/jobs/${job.id}` : "/inbox",
    ...opts,
  });
}

function cleanerEvent(w: World, type: EventType, key: string, job: Job, cleanerId: string, opts: Partial<EmitSpec> = {}): void {
  emit(w, {
    type,
    key,
    orgId: job.orgId,
    jobId: job.id,
    recipients: [cleanerId],
    priority: "normal",
    channels: ["inApp", "push"],
    params: jobParams(job),
    proposal: true,
    deepLink: `/agenda/jobs/${job.id}`,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Pipeline transitions

function eventById(w: World, eventId: string): NotificationEvent {
  const event = w.events.find((e) => e.eventId === eventId);
  if (!event) throw new Error(`unknown event ${eventId}`);
  return event;
}

function recipientBlockReason(user: User | undefined, event: NotificationEvent): string | null {
  if (!user) return "unknown_user";
  if (user.orgId !== event.orgId) return "other_organization";
  if (!user.active) return "access_revoked";
  return null;
}

function processTransition(w: World, t: Transition): void {
  const event = eventById(w, t.eventId);
  if (t.kind === "selectRecipients") {
    const selected: string[] = [];
    for (const userId of event.recipients) {
      const reason = recipientBlockReason(w.users[userId], event);
      if (reason) {
        log(w, { step: "RECIPIENT_BLOCKED", result: "blocked", reason, eventId: event.eventId, userId });
      } else {
        selected.push(userId);
      }
    }
    log(w, {
      step: "RECIPIENT_SELECTED",
      result: selected.length ? "ok" : "warn",
      detail: selected.length ? selected.join(", ") : "none",
      reason: selected.length ? null : "no_authorized_recipient",
      eventId: event.eventId,
    });
    for (const userId of selected) w.queue.push({ kind: "storeInbox", eventId: event.eventId, userId });
    return;
  }

  if (t.kind === "storeInbox") {
    const entry: InboxEntry = {
      id: nextId(w, "inb"),
      userId: t.userId,
      eventId: event.eventId,
      unread: true,
      createdAt: w.clock,
      createdSeq: w.seq,
      openedAt: null,
      archivedAt: null,
    };
    w.inbox.push(entry);
    log(w, { step: "INBOX_STORED", result: "ok", detail: entry.id, eventId: event.eventId, userId: t.userId });

    const skip = (reason: string) =>
      log(w, { step: "PUSH_SKIPPED", result: "info", reason, eventId: event.eventId, userId: t.userId });
    if (!event.channels.includes("push")) return skip("event_in_app_only");
    if (w.settings.channel === "inApp") return skip("lab_channel_in_app_only");
    const time = zonedParts(w.clock, w.settings.timeZone).time;
    if (event.priority !== "high" && inQuietHours(time, w.settings.quietStart, w.settings.quietEnd)) {
      return skip("quiet_hours");
    }
    const targets = Object.values(w.devices).filter((d) => d.userId === t.userId && d.visible);
    if (!targets.length) return skip("no_registered_device");
    for (const d of targets) w.queue.push({ kind: "attemptPush", eventId: event.eventId, userId: t.userId, deviceId: d.id });
    return;
  }

  // attemptPush
  const device = w.devices[t.deviceId];
  if (!device) throw new Error(`unknown device ${t.deviceId}`);
  const attempt: DeliveryAttempt = {
    id: nextId(w, "try"),
    eventId: event.eventId,
    userId: t.userId,
    deviceId: device.id,
    channel: "push",
    providerResult: "NOT_ATTEMPTED",
    blockedReason: null,
    unknownReason: null,
    enqueuedAt: w.clock,
    displayedAt: null,
    dismissedAt: null,
    openedAt: null,
    suppressedReason: null,
  };
  w.attempts.push(attempt);
  const base = { eventId: event.eventId, userId: t.userId, deviceId: device.id, attemptId: attempt.id };

  let blocked: string | null = null;
  if (device.platform === "ios" && !device.standalone) blocked = "ios_tab_not_installed";
  else if (device.permission === "denied") blocked = "permission_denied";
  else if (device.permission === "default") blocked = "permission_not_granted";
  else if (device.subscription === "missing") blocked = "subscription_missing";
  if (blocked) {
    attempt.blockedReason = blocked;
    log(w, { step: "PUSH_SKIPPED", result: "blocked", reason: blocked, ...base });
    return;
  }

  log(w, { step: "PUSH_ATTEMPTED", result: "ok", detail: "simulated_provider", ...base });
  if (device.subscription === "stale") {
    attempt.providerResult = "REJECTED";
    attempt.blockedReason = "token_expired";
    log(w, { step: "PROVIDER_REJECTED", result: "blocked", reason: "token_expired", ...base });
    device.subscription = "missing";
    log(w, { step: "DEVICE_CLEANED", result: "info", reason: "only_this_device", ...base });
    return;
  }
  switch (device.providerMode) {
    case "accepted":
      attempt.providerResult = "ACCEPTED";
      log(w, { step: "PROVIDER_ACCEPTED", result: "warn", reason: "accepted_not_displayed", ...base });
      return;
    case "rejected":
      attempt.providerResult = "REJECTED";
      attempt.blockedReason = "provider_rejected";
      log(w, { step: "PROVIDER_REJECTED", result: "blocked", reason: "provider_rejected", ...base });
      return;
    case "timeout":
    case "unknown":
      attempt.providerResult = "UNKNOWN";
      attempt.unknownReason = device.providerMode === "timeout" ? "provider_timeout" : "ambiguous_response";
      log(w, { step: "PROVIDER_UNKNOWN", result: "warn", reason: attempt.unknownReason, detail: "no_auto_retry_other_provider", ...base });
      return;
  }
}

// ---------------------------------------------------------------------------
// Opening a push / inbox entry resolves the CURRENT authorized context.

function resolveContext(w: World, userId: string, event: NotificationEvent): OpenContext {
  const user = w.users[userId];
  if (!user || !user.active) return { kind: "accessEnded" };
  if (!event.jobId) return { kind: "inbox" };
  const job = w.jobs[event.jobId];
  if (!job || job.orgId !== user.orgId) return { kind: "inbox" };
  if (user.role === "MANAGER") {
    if (event.type === "CHECKLIST_READY_FOR_REVIEW") return { kind: "checklist", jobId: job.id };
    return { kind: "job", jobId: job.id };
  }
  if (job.archived) return { kind: "unavailable", reason: "job_cancelled" };
  if (event.type === "OFFER_NEW") {
    const offer = offerFor(w, job.id, userId);
    if (!offer || offer.status === "UNAVAILABLE" || offer.status === "REVOKED" || offer.status === "EXPIRED") {
      return { kind: "unavailable", reason: "offer_taken" };
    }
    if (offer.status === "ACCEPTED") return { kind: "job", jobId: job.id };
    return { kind: "offer", jobId: job.id };
  }
  if (job.assignedCleanerId !== userId) return { kind: "unavailable", reason: "no_longer_assigned" };
  if (event.type === "CHECKLIST_AVAILABLE") return { kind: "checklist", jobId: job.id };
  if (event.type === "SPECIAL_REQUEST") return { kind: "request", jobId: job.id };
  return { kind: "job", jobId: job.id };
}

function markEntryRead(w: World, entry: InboxEntry, deviceId: string): void {
  if (!entry.unread) return;
  entry.unread = false;
  entry.openedAt = w.clock;
  log(w, { step: "READ", result: "ok", detail: entry.id, eventId: entry.eventId, userId: entry.userId, deviceId });
}

/** Inbox entries the account signed in on a device may read right now. */
export function readableEntries(w: World, deviceId: string): InboxEntry[] {
  const device = w.devices[deviceId];
  if (!device?.signedInUserId) return [];
  const user = w.users[device.signedInUserId];
  if (!user || !user.active) return [];
  return w.inbox.filter((e) => {
    if (e.userId !== user.id) return false;
    if (!device.online && e.createdSeq > device.lastSyncSeq) return false;
    const event = w.events.find((ev) => ev.eventId === e.eventId);
    return event?.orgId === user.orgId;
  });
}

function pickAttempt(w: World, cmd: { attemptId?: string; deviceId?: string }, predicate: (a: DeliveryAttempt) => boolean): DeliveryAttempt | undefined {
  if (cmd.attemptId) return w.attempts.find((a) => a.id === cmd.attemptId);
  const list = w.attempts.filter((a) => a.deviceId === cmd.deviceId && predicate(a));
  return list[list.length - 1];
}

// ---------------------------------------------------------------------------
// Business commands

function eligibleCleaner(w: World, cleanerId: string, orgId: string): string | null {
  const user = w.users[cleanerId];
  if (!user || user.role !== "CLEANER") return "not_a_cleaner";
  if (user.orgId !== orgId) return "other_organization";
  if (!user.active) return "access_revoked";
  return null;
}

function acceptOffer(w: World, job: Job, cleanerId: string): void {
  const offer = offerFor(w, job.id, cleanerId);
  const user = w.users[cleanerId];
  if (!offer) return reject(w, "not_invited", `${cleanerId} → ${job.id}`, { userId: cleanerId });
  if (!user?.active) return reject(w, "access_revoked", cleanerId, { userId: cleanerId });
  if (job.offerMode !== "AUTO") return reject(w, "manual_mode_use_interest", job.id, { userId: cleanerId });
  if (offer.status === "ACCEPTED" && job.assignedCleanerId === cleanerId) {
    log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "idempotent_retry_same_winner", detail: offer.id, userId: cleanerId });
    managerEvent(w, "OFFER_AUTO_ASSIGNED", `auto-assigned:${job.id}`, job);
    return;
  }
  if (job.archived) return reject(w, "job_cancelled", job.id, { userId: cleanerId });
  if (job.assignedCleanerId || offer.status === "UNAVAILABLE") {
    offer.status = "UNAVAILABLE";
    return reject(w, "already_taken", `${offer.id} UNAVAILABLE`, { userId: cleanerId });
  }
  if (offer.status !== "PENDING") return reject(w, `offer_${offer.status.toLowerCase()}`, offer.id, { userId: cleanerId });
  if (offer.validUntil < w.clock) {
    offer.status = "EXPIRED";
    return reject(w, "offer_expired", offer.id, { userId: cleanerId });
  }
  // Transaction commits: exactly one Assignment.
  job.assignedCleanerId = cleanerId;
  job.status = "ASSIGNED";
  job.revision += 1;
  job.attendanceConfirmed = [];
  offer.status = "ACCEPTED";
  for (const other of offersOfJob(w, job.id)) {
    if (other.id !== offer.id && (other.status === "PENDING" || other.status === "INTERESTED")) other.status = "UNAVAILABLE";
  }
  change(w, "transaction_committed_single_winner", `${job.id} → ${cleanerId} (rev ${job.revision})`, { userId: cleanerId });
  managerEvent(w, "OFFER_AUTO_ASSIGNED", `auto-assigned:${job.id}`, job, { params: { ...jobParams(job), name: user.displayName }, proposal: true, priority: "high" });
  cleanerEvent(w, "OFFER_WON", `offer-won:${offer.id}`, job, cleanerId, { channels: ["inApp"] });
}

function assign(w: World, job: Job, cleanerId: string): void {
  job.assignedCleanerId = cleanerId;
  job.status = "ASSIGNED";
  job.revision += 1;
  job.attendanceConfirmed = [];
  for (const o of offersOfJob(w, job.id)) {
    if (o.cleanerId === cleanerId) o.status = "ACCEPTED";
    else if (o.status === "PENDING" || o.status === "INTERESTED") o.status = "UNAVAILABLE";
  }
  change(w, "manager_assigned", `${job.id} → ${cleanerId} (rev ${job.revision})`, { userId: cleanerId });
  cleanerEvent(w, "JOB_ASSIGNED", `assigned:${job.id}:${job.revision}`, job, cleanerId);
}

function unassign(w: World, job: Job, reason: string): string | null {
  const previous = job.assignedCleanerId;
  if (!previous) return null;
  job.assignedCleanerId = null;
  job.status = "UNASSIGNED";
  job.revision += 1;
  job.attendanceConfirmed = [];
  const offer = offerFor(w, job.id, previous);
  if (offer) offer.status = "REVOKED";
  change(w, reason, `${job.id} ✕ ${previous} (rev ${job.revision})`, { userId: previous });
  cleanerEvent(w, "JOB_REMOVED", `removed:${job.id}:${job.revision}`, job, previous, { priority: "high", params: { date: job.date } });
  return previous;
}

function requireJob(w: World, jobId: string): Job | null {
  const job = w.jobs[jobId];
  if (!job) {
    reject(w, "unknown_job", jobId);
    return null;
  }
  return job;
}

function runReminder(w: World, kind: Extract<Command, { type: "RUN_REMINDER" }>["kind"]): void {
  const date = today(w);
  const orgId = "org-demo";
  const orgJobs = Object.values(w.jobs).filter((j) => j.orgId === orgId);
  if (kind === "MANAGER_19" || kind === "MANAGER_07") {
    const target = kind === "MANAGER_19" ? addDays(date, 1) : date;
    const list = orgJobs.filter((j) => j.date === target && !j.archived);
    const attention = list.filter((j) => !j.assignedCleanerId).length;
    change(w, kind === "MANAGER_19" ? "window_19h" : "window_07h", `${list.length} jobs on ${target}`);
    managerEvent(w, kind === "MANAGER_19" ? "MANAGER_PLAN_TOMORROW" : "MANAGER_TODAY", `${kind === "MANAGER_19" ? "plan-tomorrow" : "today"}:${orgId}:${date}`, null, {
      orgId,
      params: { date: target, count: list.length, attention },
      priority: attention ? "high" : "normal",
      deepLink: "/dashboard",
    });
    return;
  }
  if (kind === "EXCEPTIONS") {
    const horizon = w.clock + 24 * 3600_000;
    const risky = orgJobs.filter((j) => {
      if (j.archived) return false;
      const at = zonedToEpoch(j.date, j.start, w.settings.timeZone);
      return at > w.clock && at <= horizon && !j.assignedCleanerId;
    });
    const hour = zonedParts(w.clock, w.settings.timeZone).hour;
    const bucket = Math.floor(hour / 4);
    change(w, "exception_scan", `${risky.length} unassigned within 24h`);
    if (!risky.length) return;
    managerEvent(w, "EXCEPTION_ALERT", `exceptions:${orgId}:${date}:b${bucket}`, null, {
      orgId,
      params: { count: risky.length, property: risky[0]!.propertyName },
      priority: "high",
      proposal: true,
      deepLink: "/dashboard?filter=attention",
    });
    return;
  }
  // Cleaner reminders.
  for (const job of orgJobs) {
    const at = zonedToEpoch(job.date, job.start, w.settings.timeZone);
    const matches =
      kind === "CLEANER_DAY_BEFORE"
        ? job.date === addDays(date, 1)
        : at > w.clock && at - w.clock <= w.settings.reminderLeadHours * 3600_000;
    if (!matches) continue;
    if (job.archived) {
      log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "no_reminder_cancelled_job", detail: job.id });
      continue;
    }
    if (!job.assignedCleanerId) {
      log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "no_reminder_unassigned_job", detail: job.id });
      continue;
    }
    cleanerEvent(
      w,
      kind === "CLEANER_DAY_BEFORE" ? "REMINDER_DAY_BEFORE" : "REMINDER_LEAD",
      `${kind === "CLEANER_DAY_BEFORE" ? "reminder-24h" : "reminder-lead"}:${job.id}:${job.revision}`,
      job,
      job.assignedCleanerId,
      { priority: kind === "CLEANER_LEAD" ? "high" : "normal" },
    );
  }
}

export function applyCommand(w: World, cmd: Command): void {
  tick(w);
  switch (cmd.type) {
    case "SEND_OFFER": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived) return reject(w, "job_cancelled", job.id);
      if (job.assignedCleanerId) return reject(w, "job_already_assigned", job.id);
      if (cmd.mode === "AUTO" && (job.status === "IN_PROGRESS" || job.status === "COMPLETED")) return reject(w, "auto_mode_incompatible", job.id);
      job.offerMode = cmd.mode;
      job.status = "OFFERED";
      change(w, cmd.mode === "AUTO" ? "offer_auto_first_accept" : "offer_manual", `${job.id} → ${cmd.cleanerIds.join(", ")}`);
      for (const cleanerId of cmd.cleanerIds) {
        const reason = eligibleCleaner(w, cleanerId, job.orgId);
        if (reason) {
          reject(w, reason, `${cleanerId} not targeted`, { userId: cleanerId });
          continue;
        }
        let offer = offerFor(w, job.id, cleanerId);
        if (!offer) {
          offer = { id: nextId(w, "ofr"), jobId: job.id, cleanerId, status: "PENDING", validUntil: w.clock + 24 * 3600_000, amount: 110 + 10 * Object.keys(w.offers).length };
          w.offers[offer.id] = offer;
        }
        cleanerEvent(w, "OFFER_NEW", `offer-new:${offer.id}`, job, cleanerId);
      }
      return;
    }
    case "RESPOND_OFFER": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (cmd.response === "ACCEPT") return acceptOffer(w, job, cmd.cleanerId);
      const offer = offerFor(w, job.id, cmd.cleanerId);
      if (!offer) return reject(w, "not_invited", `${cmd.cleanerId} → ${job.id}`, { userId: cmd.cleanerId });
      if (!w.users[cmd.cleanerId]?.active) return reject(w, "access_revoked", cmd.cleanerId, { userId: cmd.cleanerId });
      if (job.archived || offer.status === "UNAVAILABLE" || offer.status === "REVOKED" || offer.status === "EXPIRED") {
        return reject(w, "offer_unavailable", offer.id, { userId: cmd.cleanerId });
      }
      if (cmd.response === "INTERESTED") {
        if (job.offerMode === "AUTO") return reject(w, "auto_mode_use_accept", job.id, { userId: cmd.cleanerId });
        if (offer.status === "PENDING") {
          offer.status = "INTERESTED";
          change(w, "interest_is_not_assignment", `${offer.id} INTERESTED · job stays ${job.status}`, { userId: cmd.cleanerId });
        } else {
          log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "repeat_same_answer", detail: offer.id, userId: cmd.cleanerId });
        }
        managerEvent(w, "OFFER_INTEREST", `interest:${offer.id}`, job, { params: { ...jobParams(job), name: w.users[cmd.cleanerId]!.displayName } });
        return;
      }
      offer.status = "DECLINED";
      change(w, "offer_declined", offer.id, { userId: cmd.cleanerId });
      managerEvent(w, "OFFER_DECLINED", `declined:${offer.id}`, job, {
        channels: ["inApp"],
        priority: "low",
        proposal: true,
        params: { ...jobParams(job), name: w.users[cmd.cleanerId]!.displayName },
      });
      return;
    }
    case "RACE_ACCEPT": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      const order = [...cmd.cleanerIds];
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random(w) * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "server_commit_order", detail: `${order.join(" → ")} (seed ${w.seed})` });
      for (const cleanerId of order) acceptOffer(w, job, cleanerId);
      return;
    }
    case "ASSIGN": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived) return reject(w, "job_cancelled", job.id);
      const reason = eligibleCleaner(w, cmd.cleanerId, job.orgId);
      if (reason) return reject(w, reason, cmd.cleanerId, { userId: cmd.cleanerId });
      if (job.assignedCleanerId) return reject(w, "job_already_assigned_use_replace", job.id);
      return assign(w, job, cmd.cleanerId);
    }
    case "CONFIRM_ATTENDANCE": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived || job.assignedCleanerId !== cmd.cleanerId) return reject(w, "no_active_assignment", job.id, { userId: cmd.cleanerId });
      if (!job.attendanceConfirmed.includes(cmd.cleanerId)) {
        job.attendanceConfirmed.push(cmd.cleanerId);
        change(w, "attendance_confirmed", `${job.id} rev ${job.revision}`, { userId: cmd.cleanerId });
      } else {
        log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "repeat_same_answer", detail: job.id, userId: cmd.cleanerId });
      }
      managerEvent(w, "ATTENDANCE_CONFIRMED", `confirm:${job.id}:${cmd.cleanerId}:${job.revision}`, job, {
        params: { ...jobParams(job), name: w.users[cmd.cleanerId]!.displayName },
      });
      return;
    }
    case "RESCHEDULE": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived) return reject(w, "job_cancelled", job.id);
      const from = { fromDate: job.date, fromStart: job.start };
      job.date = cmd.date;
      job.start = cmd.start;
      job.revision += 1;
      change(w, "rescheduled", `${job.id} ${from.fromDate} ${from.fromStart} → ${cmd.date} ${cmd.start}`);
      if (job.assignedCleanerId) {
        cleanerEvent(w, "JOB_RESCHEDULED", `rescheduled:${job.id}:${job.revision}`, job, job.assignedCleanerId, {
          priority: "high",
          params: { ...jobParams(job), ...from },
        });
      }
      return;
    }
    case "CANCEL_JOB": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived) return reject(w, "job_cancelled", job.id);
      job.archived = true;
      job.revision += 1;
      const assigned = job.assignedCleanerId;
      for (const o of offersOfJob(w, job.id)) if (o.status === "PENDING" || o.status === "INTERESTED") o.status = "REVOKED";
      change(w, "job_archived_as_cancelled", `${job.id} rev ${job.revision}`);
      if (assigned) {
        cleanerEvent(w, "JOB_CANCELLED", `cancelled:${job.id}`, job, assigned, { priority: "high", params: { date: job.date } });
      }
      return;
    }
    case "REMOVE_CLEANER": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (!unassign(w, job, "manager_removed_cleaner")) reject(w, "no_active_assignment", job.id);
      return;
    }
    case "REPLACE_CLEANER": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      const reason = eligibleCleaner(w, cmd.cleanerId, job.orgId);
      if (reason) return reject(w, reason, cmd.cleanerId, { userId: cmd.cleanerId });
      unassign(w, job, "manager_replaced_cleaner");
      return assign(w, job, cmd.cleanerId);
    }
    case "EXPIRE_OFFERS": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      const open = offersOfJob(w, job.id).filter((o) => o.status === "PENDING" || o.status === "INTERESTED");
      for (const o of open) o.status = "EXPIRED";
      change(w, "offers_expired", `${job.id}: ${open.length}`);
      if (open.length) {
        managerEvent(w, "OFFER_EXPIRED", `expired:${job.id}:${job.revision}`, job, { channels: ["inApp"], priority: "low", proposal: true, params: { ...jobParams(job), count: open.length } });
      }
      return;
    }
    case "CHECKLIST_AVAILABLE": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.archived || !job.assignedCleanerId) return reject(w, "no_active_assignment", job.id);
      if (job.checklist === "AVAILABLE") {
        log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "no_new_action", detail: job.id });
      } else {
        job.checklist = "AVAILABLE";
        change(w, "checklist_available", job.id);
      }
      cleanerEvent(w, "CHECKLIST_AVAILABLE", `checklist-available:${job.id}:${job.revision}`, job, job.assignedCleanerId, { priority: "low" });
      return;
    }
    case "CHECKLIST_SUBMIT": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.assignedCleanerId !== cmd.cleanerId) return reject(w, "no_active_assignment", job.id, { userId: cmd.cleanerId });
      job.checklist = "READY_FOR_REVIEW";
      change(w, "checklist_ready_for_review", job.id, { userId: cmd.cleanerId });
      managerEvent(w, "CHECKLIST_READY_FOR_REVIEW", `checklist-review:${job.id}:${job.revision}`, job, {
        priority: "high",
        params: { ...jobParams(job), name: w.users[cmd.cleanerId]!.displayName },
        deepLink: `/jobs/${job.id}/checklist`,
      });
      return;
    }
    case "REPORT_ISSUE": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.assignedCleanerId !== cmd.cleanerId) return reject(w, "no_active_assignment", job.id, { userId: cmd.cleanerId });
      const n = nextId(w, "issue");
      change(w, "structured_issue_event", `${job.id} ${cmd.issue}`, { userId: cmd.cleanerId });
      managerEvent(w, "CLEANER_ISSUE_REPORTED", `issue:${n}`, job, {
        priority: "high",
        proposal: true,
        params: { ...jobParams(job), name: w.users[cmd.cleanerId]!.displayName, issue: cmd.issue },
      });
      return;
    }
    case "SPECIAL_REQUEST": {
      const job = requireJob(w, cmd.jobId);
      if (!job) return;
      if (job.assignedCleanerId !== cmd.cleanerId) return reject(w, "no_active_assignment", job.id, { userId: cmd.cleanerId });
      const n = nextId(w, "req");
      change(w, "structured_request_preview", job.id, { userId: cmd.cleanerId });
      cleanerEvent(w, "SPECIAL_REQUEST", `request:${n}`, job, cmd.cleanerId, { deepLink: `/agenda/jobs/${job.id}/request` });
      return;
    }
    case "RUN_REMINDER":
      return runReminder(w, cmd.kind);
    case "SET_CLOCK": {
      w.clock = zonedToEpoch(cmd.date, cmd.time, w.settings.timeZone);
      log(w, { step: "CLOCK", result: "info", detail: `${cmd.date} ${cmd.time} ${w.settings.timeZone}` });
      for (const d of Object.values(w.devices)) if (d.online) d.lastSyncAt = w.clock;
      return;
    }
    case "REVOKE_ACCESS": {
      const user = w.users[cmd.userId];
      if (!user) return reject(w, "unknown_user", cmd.userId);
      user.active = false;
      for (const o of Object.values(w.offers)) if (o.cleanerId === user.id && (o.status === "PENDING" || o.status === "INTERESTED")) o.status = "REVOKED";
      for (const d of Object.values(w.devices)) if (d.signedInUserId === user.id) w.openContext[d.id] = { kind: "accessEnded" };
      change(w, "access_revoked_reads_denied", user.id, { userId: user.id });
      managerEvent(w, "CLEANER_ACCESS_REVOKED", `revoked:${user.id}`, null, {
        orgId: user.orgId,
        channels: ["inApp"],
        priority: "low",
        proposal: true,
        params: { name: user.displayName },
        deepLink: `/cleaners/${user.id}`,
      });
      return;
    }
    case "PUSH_REGISTRATION_FAILED": {
      const device = w.devices[cmd.deviceId];
      if (!device) return reject(w, "unknown_device", cmd.deviceId);
      device.subscription = "missing";
      const owner = w.users[device.userId]!;
      log(w, { step: "DEVICE_CHANGED", result: "warn", reason: "registration_failed", deviceId: device.id, detail: "subscription=missing" });
      managerEvent(w, "PUSH_REGISTRATION_FAILED", `push-reg-failed:${device.id}:${today(w)}`, null, {
        orgId: owner.orgId,
        channels: ["inApp"],
        priority: "low",
        proposal: true,
        params: { name: owner.displayName },
        deepLink: `/cleaners/${owner.id}`,
      });
      return;
    }
    case "SET_DEVICE": {
      const device = w.devices[cmd.deviceId];
      if (!device) return reject(w, "unknown_device", cmd.deviceId);
      const wasOnline = device.online;
      Object.assign(device, cmd.patch);
      if (cmd.patch.standalone === true) device.installed = true;
      if (wasOnline && device.online === false) {
        device.lastSyncSeq = w.seq;
        device.lastSyncAt = w.clock;
      }
      if (!wasOnline && device.online) {
        device.lastSyncSeq = w.seq;
        device.lastSyncAt = w.clock;
        log(w, { step: "SYNCED", result: "ok", deviceId: device.id, detail: "reconnected" });
      }
      log(w, {
        step: "DEVICE_CHANGED",
        result: "info",
        deviceId: device.id,
        detail: Object.entries(cmd.patch)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" "),
      });
      return;
    }
    case "SET_ONLINE":
      return applyDeviceOnline(w, cmd.deviceId, cmd.online);
    case "RECONNECT":
      return applyDeviceOnline(w, cmd.deviceId, true);
    case "REVOKE_SUBSCRIPTION": {
      const device = w.devices[cmd.deviceId];
      if (!device) return reject(w, "unknown_device", cmd.deviceId);
      device.subscription = "missing";
      log(w, { step: "DEVICE_CHANGED", result: "info", reason: "subscription_revoked", deviceId: device.id, detail: "subscription=missing" });
      return;
    }
    case "SWITCH_ACCOUNT": {
      const device = w.devices[cmd.deviceId];
      if (!device) return reject(w, "unknown_device", cmd.deviceId);
      device.signedInUserId = cmd.userId;
      w.openContext[device.id] = null;
      device.lastSyncSeq = w.seq;
      device.lastSyncAt = w.clock;
      log(w, { step: "DEVICE_CHANGED", result: "warn", reason: "account_switched", deviceId: device.id, detail: `signedIn=${cmd.userId ?? "none"}` });
      return;
    }
    case "SIMULATE_DISPLAY": {
      const attempt = pickAttempt(w, cmd, (a) => a.providerResult === "ACCEPTED" && a.displayedAt === null && a.suppressedReason === null);
      if (!attempt) return reject(w, "display_requires_provider_accepted", cmd.attemptId ?? cmd.deviceId ?? "", { deviceId: cmd.deviceId ?? null });
      const base = { eventId: attempt.eventId, userId: attempt.userId, deviceId: attempt.deviceId, attemptId: attempt.id };
      if (attempt.providerResult !== "ACCEPTED") return reject(w, "display_requires_provider_accepted", attempt.id, base);
      if (attempt.displayedAt !== null) return reject(w, "already_displayed", attempt.id, base);
      const device = w.devices[attempt.deviceId]!;
      if (!device.online) return reject(w, "device_offline_display_not_simulated", attempt.id, base);
      const user = w.users[attempt.userId];
      if (device.signedInUserId !== attempt.userId) {
        attempt.suppressedReason = "account_changed";
        return log(w, { step: "DISPLAY_SUPPRESSED", result: "blocked", reason: "account_changed", ...base });
      }
      if (!user?.active) {
        attempt.suppressedReason = "access_revoked";
        return log(w, { step: "DISPLAY_SUPPRESSED", result: "blocked", reason: "access_revoked", ...base });
      }
      attempt.displayedAt = w.clock;
      log(w, { step: "DISPLAYED", result: "ok", reason: "explicitly_simulated", ...base });
      return;
    }
    case "DISMISS_PUSH": {
      const list = w.attempts.filter((a) => a.deviceId === cmd.deviceId && a.displayedAt !== null && a.openedAt === null && a.dismissedAt === null);
      for (const a of list) {
        a.dismissedAt = w.clock;
        log(w, { step: "DISMISSED", result: "info", reason: "push_lost_inbox_keeps_it", eventId: a.eventId, userId: a.userId, deviceId: a.deviceId, attemptId: a.id });
      }
      if (!list.length) reject(w, "nothing_displayed", cmd.deviceId, { deviceId: cmd.deviceId });
      return;
    }
    case "OPEN_PUSH": {
      const attempt = pickAttempt(w, cmd, (a) => a.displayedAt !== null && a.openedAt === null && a.dismissedAt === null);
      if (!attempt || attempt.displayedAt === null) return reject(w, "open_requires_displayed_push", cmd.attemptId ?? cmd.deviceId ?? "", { deviceId: cmd.deviceId ?? null });
      const device = w.devices[attempt.deviceId]!;
      const event = eventById(w, attempt.eventId);
      attempt.openedAt = w.clock;
      const signedIn = device.signedInUserId;
      const context: OpenContext =
        signedIn !== attempt.userId ? { kind: "inbox" } : resolveContext(w, attempt.userId, event);
      w.openContext[device.id] = context;
      log(w, {
        step: "OPENED",
        result: context.kind === "unavailable" || context.kind === "accessEnded" ? "warn" : "ok",
        reason: context.kind === "unavailable" ? context.reason : context.kind === "accessEnded" ? "access_ended" : null,
        detail: `context=${context.kind}`,
        eventId: event.eventId,
        userId: attempt.userId,
        deviceId: device.id,
        attemptId: attempt.id,
      });
      const entry = w.inbox.find((e) => e.eventId === event.eventId && e.userId === attempt.userId);
      if (entry && context.kind !== "accessEnded") markEntryRead(w, entry, device.id);
      return;
    }
    case "OPEN_INBOX_ENTRY":
    case "MARK_READ":
    case "ARCHIVE": {
      const device = w.devices[cmd.deviceId];
      if (!device) return reject(w, "unknown_device", cmd.deviceId);
      const user = device.signedInUserId ? w.users[device.signedInUserId] : undefined;
      if (!user || !user.active) {
        w.openContext[device.id] = { kind: "accessEnded" };
        return reject(w, "access_revoked_inbox_locked", device.id, { deviceId: device.id });
      }
      const readable = readableEntries(w, device.id).filter((e) => e.archivedAt === null);
      const entry = cmd.entryId ? readable.find((e) => e.id === cmd.entryId) : [...readable].reverse().find((e) => e.unread) ?? readable[readable.length - 1];
      if (!entry) return reject(w, "no_readable_entry", device.id, { deviceId: device.id });
      if (cmd.type === "ARCHIVE") {
        entry.archivedAt = w.clock;
        log(w, { step: "ARCHIVED", result: "ok", detail: entry.id, eventId: entry.eventId, userId: entry.userId, deviceId: device.id });
        return;
      }
      if (cmd.type === "OPEN_INBOX_ENTRY") {
        const event = eventById(w, entry.eventId);
        const context = resolveContext(w, entry.userId, event);
        w.openContext[device.id] = context;
        log(w, {
          step: "OPENED",
          result: context.kind === "unavailable" ? "warn" : "ok",
          reason: context.kind === "unavailable" ? context.reason : "from_inbox",
          detail: `context=${context.kind}`,
          eventId: event.eventId,
          userId: entry.userId,
          deviceId: device.id,
        });
      }
      markEntryRead(w, entry, device.id);
      return;
    }
    case "MARK_ALL_READ": {
      const readable = readableEntries(w, cmd.deviceId).filter((e) => e.unread);
      for (const e of readable) markEntryRead(w, e, cmd.deviceId);
      if (!readable.length) log(w, { step: "BUSINESS_CHANGE", result: "info", reason: "nothing_unread", deviceId: cmd.deviceId });
      return;
    }
    case "SET_SETTINGS": {
      Object.assign(w.settings, cmd.patch);
      log(w, { step: "CLOCK", result: "info", reason: "settings_changed", detail: Object.entries(cmd.patch).map(([k, v]) => `${k}=${String(v)}`).join(" ") });
      return;
    }
    case "SET_PROVIDER_ALL": {
      for (const d of Object.values(w.devices)) d.providerMode = cmd.mode;
      log(w, { step: "DEVICE_CHANGED", result: "info", reason: "provider_mode", detail: `all=${cmd.mode}` });
      return;
    }
  }
}

function applyDeviceOnline(w: World, deviceId: string, online: boolean): void {
  const device = w.devices[deviceId];
  if (!device) return reject(w, "unknown_device", deviceId);
  if (device.online === online) return log(w, { step: "DEVICE_CHANGED", result: "info", reason: "no_change", deviceId });
  device.online = online;
  device.lastSyncSeq = w.seq;
  device.lastSyncAt = w.clock;
  if (online) log(w, { step: "SYNCED", result: "ok", reason: "reconnected_inbox_synced", deviceId });
  else log(w, { step: "DEVICE_CHANGED", result: "warn", reason: "went_offline", deviceId, detail: "online=false" });
}

/** Process exactly one queued pipeline transition. Returns false when idle. */
export function stepPipeline(w: World): boolean {
  const next = w.queue.shift();
  if (!next) return false;
  tick(w);
  processTransition(w, next);
  return true;
}

export function drainPipeline(w: World, limit = 1000): void {
  let n = 0;
  while (stepPipeline(w)) {
    n += 1;
    if (n > limit) throw new Error("pipeline did not settle");
  }
}
