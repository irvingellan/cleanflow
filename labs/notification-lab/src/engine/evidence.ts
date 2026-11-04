// Evidence export: JSON report, Markdown report and a plain summary for Gabi.
// Contains only fictitious lab data. No real names, tokens, contacts or URLs.
import { describeCommand, formatClock, notificationCopy, reasonText, ui } from "../i18n/messages.ts";
import { attemptLevel, recipientCounts, sanitizedPayload } from "./selectors.ts";
import { fingerprint, type Session } from "./session.ts";
import type { Locale, World } from "./types.ts";

/** Rules the lab assumes. They are expectations, to be confirmed by Codex. */
export const RULES_FOR_CODEX: string[] = [
  "Every business change persists one operational event with a unique idempotency key; retries never create a second event.",
  "Recipients are selected server-side from authorized, active members of the same organization; never from browser parameters.",
  "An inbox entry is stored for each authorized recipient independently of push readiness, permission or connectivity.",
  "Push is attempted only for installed/standalone (iOS), permission granted and an active subscription; one provider per logical notice.",
  "Provider ACCEPTED is not DISPLAYED. DISPLAYED/OPENED are recorded only from explicit client signals.",
  "Timeouts or ambiguous provider answers are UNKNOWN; no automatic resend through another provider.",
  "A rejected/expired token cleans only that device's registration; other devices of the same person stay active.",
  "Offers target only the cleaners the manager selected; no organization-wide broadcast.",
  "Automatic first-accept assignment is one server transaction: exactly one Assignment; the others become UNAVAILABLE without naming the winner.",
  "Interest (manual mode) is never an Assignment.",
  "A cleaner never reads another cleaner's notices, offers, amounts or history; other organizations see nothing.",
  "Revoked access blocks inbox reads immediately; push is not a security mechanism.",
  "Opening an old push resolves the current authorized context (unavailable / access ended) without leaking details.",
  "A late push for a previous account on a shared device is not shown to the current account.",
  "Reminders skip cancelled or unassigned Jobs and are deduplicated per Job revision / day / organization.",
  "Quiet hours hold normal/low push; the inbox entry is still stored. High priority changes may still alert.",
];

export function inconsistencies(w: World): string[] {
  const found: string[] = [];
  for (const a of w.attempts) {
    if (a.displayedAt !== null && a.providerResult !== "ACCEPTED") found.push(`attempt ${a.id} displayed without provider ACCEPTED`);
    if (a.openedAt !== null && a.displayedAt === null) found.push(`attempt ${a.id} opened without being displayed`);
  }
  const keys = w.events.map((e) => e.idempotencyKey);
  if (new Set(keys).size !== keys.length) found.push("duplicate idempotency keys across events");
  for (const job of Object.values(w.jobs)) {
    const accepted = Object.values(w.offers).filter((o) => o.jobId === job.id && o.status === "ACCEPTED");
    if (accepted.length > 1) found.push(`job ${job.id} has ${accepted.length} accepted offers`);
  }
  for (const e of w.inbox) {
    const ev = w.events.find((x) => x.eventId === e.eventId);
    const user = w.users[e.userId];
    if (!ev || !user || ev.orgId !== user.orgId) found.push(`inbox ${e.id} crosses organizations`);
  }
  const perRecipient = new Map<string, number>();
  for (const e of w.inbox) perRecipient.set(`${e.eventId}/${e.userId}`, (perRecipient.get(`${e.eventId}/${e.userId}`) ?? 0) + 1);
  for (const [k, n] of perRecipient) if (n > 1) found.push(`event/recipient ${k} stored ${n} times`);
  return found;
}

export function buildReport(session: Session, locale: Locale) {
  const w = session.world;
  const sc = session.scenario;
  const tz = w.settings.timeZone;
  const at = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return {
    lab: "CleanFlow Notification Lab V1",
    simulated: true,
    disclaimer: ui(locale, "subtitle"),
    securityNote: ui(locale, "securityNote"),
    simulationTimestamp: at(w.clock),
    timeZone: tz,
    seed: session.seed,
    fingerprint: fingerprint(w),
    scenario: {
      id: sc.id,
      name: sc.name[locale],
      realProductStatus: sc.realProductStatus,
      proposal: sc.proposal,
      event: sc.event[locale],
      expectedResult: sc.expectedResult[locale],
      reality: sc.reality[locale],
      expectedRecipients: sc.expectedRecipients,
    },
    people: Object.values(w.users).map((u) => ({ id: u.id, role: u.role, orgId: u.orgId, active: u.active, locale: u.locale, fictitious: true })),
    devices: Object.values(w.devices)
      .filter((d) => d.visible)
      .map((d) => ({
        id: d.id,
        owner: d.userId,
        signedIn: d.signedInUserId,
        platform: d.platform,
        browser: d.browser,
        installed: d.installed,
        standalone: d.standalone,
        permission: d.permission,
        subscription: d.subscription,
        online: d.online,
        providerMode: d.providerMode,
      })),
    preconditions: sc.preconditionText.map((p) => p[locale]),
    actions: session.ops
      .filter((op) => op.kind !== "step")
      .map((op) => {
        const command = op.kind === "script" ? sc.script[op.index]!.command : op.command;
        return { source: op.kind, command, description: describeCommand(locale, command, w) };
      }),
    timeline: w.timeline.map((r) => ({
      seq: r.seq,
      at: formatClock(locale, r.at, tz),
      step: r.step,
      result: r.result,
      reason: r.reason,
      reasonText: reasonText(locale, r.reason),
      detail: r.detail,
      eventId: r.eventId,
      userId: r.userId,
      deviceId: r.deviceId,
    })),
    expectedVsObserved: sc.checks.map((c) => ({ id: c.id, expected: c.text[locale], observed: c.test(w) ? "PASS" : "FAIL" })),
    events: w.events.map((e) => ({ ...sanitizedPayload(e), recipients: e.recipients, createdAt: at(e.createdAt), proposal: e.proposal, copy: notificationCopy(locale, e) })),
    inbox: w.inbox.map((e) => ({ ...e, createdAt: at(e.createdAt), openedAt: at(e.openedAt), archivedAt: at(e.archivedAt) })),
    push: w.attempts.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      userId: a.userId,
      deviceId: a.deviceId,
      level: attemptLevel(a),
      providerResult: a.providerResult,
      blockedReason: a.blockedReason,
      unknownReason: a.unknownReason,
      suppressedReason: a.suppressedReason,
      enqueuedAt: at(a.enqueuedAt),
      displayedAt: at(a.displayedAt),
      openedAt: at(a.openedAt),
    })),
    counts: recipientCounts(w),
    inconsistencies: inconsistencies(w),
    businessRulesToConfirmByCodex: RULES_FOR_CODEX,
  };
}

export type Report = ReturnType<typeof buildReport>;

export function reportMarkdown(r: Report, locale: Locale): string {
  const L = (k: Parameters<typeof ui>[1]) => ui(locale, k);
  const lines: string[] = [];
  lines.push(`# ${r.lab} — ${r.scenario.id} · ${r.scenario.name}`, "");
  lines.push(`> **${L("simulated")}** — ${r.disclaimer}`, `> ${r.securityNote}`, "");
  lines.push(`- ${L("seed")}: \`${r.seed}\` · ${L("fingerprint")}: \`${r.fingerprint}\``);
  lines.push(`- ${L("clock")}: ${r.simulationTimestamp} (${r.timeZone})`);
  lines.push(`- Status: ${r.scenario.realProductStatus.join(" + ")}${r.scenario.proposal ? ` · **${L("proposalBanner")}**` : ""}`, "");
  lines.push(`## ${L("event")}`, r.scenario.event, "", `## ${L("expected")}`, r.scenario.expectedResult, "", `## ${L("reality")}`, r.scenario.reality, "");
  lines.push(`## ${L("preconditions")}`, ...r.preconditions.map((p) => `- ${p}`), "");
  lines.push(`## ${L("script")}`, ...r.actions.map((a, i) => `${i + 1}. ${a.description}${a.source === "manual" ? " _(manual)_" : ""}`), "");
  lines.push(`## ${L("checks")}`, `| ${L("expected")} | ${L("observed")} |`, "|---|---|", ...r.expectedVsObserved.map((c) => `| ${c.expected} | ${c.observed} |`), "");
  lines.push(`## ${L("perRecipient")}`, "| user | events | inbox | accepted | rejected | unknown | blocked | displayed | opened |", "|---|---|---|---|---|---|---|---|---|");
  for (const c of r.counts) lines.push(`| ${c.userId} | ${c.events} | ${c.inbox} | ${c.accepted} | ${c.rejected} | ${c.unknown} | ${c.blocked} | ${c.displayed} | ${c.opened} |`);
  lines.push("", `## ${L("trail")}`, "| # | at | step | result | reason |", "|---|---|---|---|---|");
  for (const t of r.timeline) lines.push(`| ${t.seq} | ${t.at} | ${t.step} | ${t.result} | ${t.reasonText || t.detail} |`);
  lines.push("", `## ${L("inconsistencies")}`, r.inconsistencies.length ? r.inconsistencies.map((i) => `- ${i}`).join("\n") : "- none", "");
  lines.push("## Business rules to confirm (Codex)", ...r.businessRulesToConfirmByCodex.map((x) => `- ${x}`), "");
  return lines.join("\n");
}

export function gabiSummary(session: Session, locale: Locale): string {
  const sc = session.scenario;
  const w = session.world;
  const pass = sc.checks.filter((c) => c.test(w)).length;
  const lines = [
    `${sc.id} — ${sc.name[locale]}`,
    "",
    `${ui(locale, "gabiWhat")}: ${(sc.gabiView ?? sc.expectedResult)[locale]}`,
    `${ui(locale, "gabiStatus")} ${sc.proposal ? ui(locale, "gabiNo") : ui(locale, "gabiYes")}`,
    "",
    ...w.events.map((e) => {
      const copy = notificationCopy(locale, e);
      const who = e.recipients.map((id) => w.users[id]?.displayName ?? id).join(", ");
      return `• ${who}: “${copy.title}” — ${copy.body}`;
    }),
    "",
    `${ui(locale, "checks")}: ${pass}/${sc.checks.length} ${ui(locale, "pass")}`,
    `(${ui(locale, "simulated")} — ${ui(locale, "subtitle")})`,
  ];
  return lines.join("\n");
}
