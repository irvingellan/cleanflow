# Platform console

Open **Dev Center → Platform** or sign in directly at `/platform`. The direct route works without a company membership. Both views call `getPlatformOverview`, which checks the existing `DEV_CENTER_DEVELOPER_UIDS` allowlist and rejects anonymous sessions on every request. The console reads existing records. Opening a company loads its staff directory, usage and recent failures on demand.

## Overview

The summary shows the number of organizations, active cleaners, services created in the last 30 days and currently open issues. The table includes older organizations that have subcollections but no root document.

| Measure | Meaning |
| --- | --- |
| Company | The organization's safe display name or name. The current app has no separate business-name setting. A missing name appears as a labeled, muted ID. The server aliases unsafe IDs. |
| Team and portfolio | Active managers have a current manager membership marked active. Cleaners and clients default to active when their flag is missing. Properties require an explicit active flag. Archived directory records count separately. Clients and properties appear only as totals. |
| Services | Total includes historical and archived jobs. Created counts jobs created in the rolling 30 days. Completed counts jobs currently completed with a completion timestamp in that window. Upcoming counts unarchived, unfinished services scheduled today or in the next six calendar days in the scheduling time zone, `America/Los_Angeles`. |
| Open issues and waiting offers | Issues with status `OPEN`. A pending offer counts only while its parent job and the applicable manual, automatic or replacement invitation rules still allow a response. |
| Last activity | Most recent recorded job creation or job update. The console checks both fields because a new job can have only a creation timestamp. An unknown date stays unavailable. |

**Needs your attention** links each reason to the company. Inactivity means at least seven days since the last job activity, or since a known registration date when there is no job activity. An unknown date alone cannot trigger inactivity. Other reasons are an Errors or Slow badge, at least 10% fully failed notification attempts out of at least 10 attempts in seven days, an available offer waiting **more than** 24 hours since it was reopened or created, or an open issue created **more than** seven days ago. A company can have multiple reasons.

## Health and recent failures

Health uses seven rolling days of manager telemetry. Thresholds live in `platformHealthThresholds`. The badge tooltip and detail include the numerator and denominator for observed rates. For example, one failed page load in 220 displays as **1 of 220, 0.5%**.

| Badge in priority order | Evidence |
| --- | --- |
| Errors | At least 5% of page loads failed across at least 20 recorded loads, or at least 5% of a single operation kind failed across at least 10 recorded attempts for that kind. |
| Slow | At least 20 valid foreground timings, with a nearest-rank p95 above 3,000 ms. |
| OK | At least one page-load or operation sample meets its minimum and the observed failure rates and latency stay within the thresholds above. |
| No data | Every sample is below its minimum. The detail can still show measured counts and timings. |

The page failure denominator includes every recorded load. Median and p95 use finite durations from zero up to, but excluding, 600,000 ms. Thus background-capped visits contribute to the load count only. Operation attempts are successes plus failures, calculated separately for offers, issues, assignments, checklist runs, checklist capabilities and cleaners.

Recent failures lists up to 20 events across failed page loads and operations for the selected organization, newest first, including events older than the health window. Each entry includes its time, a recognized screen or operation, and the app version and device class when available. Telemetry has no recorded error code or class. The response drops unrecognized labels and excludes messages, stacks, identifiers and payloads.

## Company detail

Manager labels come from the membership display name or name, then the Auth display name. If all are unavailable, the server returns at most two characters from the Auth email's local part followed by `•••@`. A manager's timestamp is the recorded Auth sign-in.

A cleaner's timestamp is the newest recorded Hub link redemption or assignment acknowledgment (**agenda**), attributed checklist draft or submission (**checklist**), or push-device registration heartbeat (**notifications**). An empty date means no attributable signal was found. Reading a screen without generating one of these signals leaves no activity record. Membership IDs, device registrations and checklist contents stay on the server.

| Usage measure | How to read it |
| --- | --- |
| Cleaner adoption | Four nested counts of distinct cleaners. Start with active profiles, then keep those with active Hub membership in the company and a linked session, then those with a recorded activity in 30 days, then those credited with at least one checklist submission in that period. |
| Checklists submitted | Runs with a ready-for-review timestamp in the rolling 30 days. A manager submission contributes to this total. Only attributed cleaner submissions contribute to the last funnel stage. |
| Uploaded photos | Recent evidence records across supported photo formats. Current-format uploads count once even if removed later. Legacy saved single-photo records count when they have no current-format evidence ID. The mirrored required-photo record therefore adds no duplicate. Storage objects and images are never retrieved. |
| Completed services with a checklist | Distinct jobs completed in 30 days with a submitted run divided by all jobs completed in those 30 days. An earlier submission still covers its completed job. An empty denominator displays “no completed jobs.” |
| Client reports | Prepared counts retained report capability records created in 30 days. Sent counts retained records whose latest manager-marked send falls in the window. Repeated sends of the same report contribute one. The app records no client-open receipt. |
| Registered devices | Current active manager-device registrations and the subset whose heartbeat falls in seven days, plus current active cleaner-device registrations. Counts represent devices, so one person can contribute several. |
| Delivery outcomes | Seven days of recorded manager reminder, manager operational/review and cleaner delivery outcomes. Sent means recorded as sent or accepted by FCM. Partial delivery has its own count. No device includes no active target or recipient. The attention rate divides fully failed deliveries by sent, partial and fully failed deliveries combined, excluding no-target records. Receipt by a handset is unmeasured. |
| Services created per week | Eight counts of job creation timestamps in Monday-starting calendar weeks in the scheduling time zone. The newest bar covers only the current week to date. |

## Refresh, export and releases

“Updated at” shows the snapshot's server timestamp in the viewer's local time. Company detail uses the older of its overview and detail timestamps. Refresh requests fresh data for the visible view. If refresh fails, the existing snapshot remains visible with its timestamp and a status message.

After authorization, each Function instance can reuse an overview or a particular organization's detail snapshot for 60 seconds. Explicit refresh bypasses completed cache entries. Concurrent requests for the same key can share the ongoing read. A new instance starts cold, so cache savings are best effort.

The CSV uses the loaded overview rows, their safe company names and the numeric team, portfolio, service and attention counts. An unnamed company gets a blank CSV name. The browser creates the file locally with translated headers, quoted cells and formula protection.

Expand Releases next to System status to read open pull requests and the five most recently merged pull requests from the public repository. The browser uses the public GitHub API without credentials. A failed or rate-limited request leaves a short local status in this panel. A merge is repository history. System status shows the running build.

## Query shape and cost

Estimates below describe cold requests. Aggregation counts, projected documents and billable reads are different units. Actual cost depends on matching documents and index entries scanned, including multi-range collection-group queries. A field mask limits the fields transferred while a date range limits the period scanned. Neither sets a fixed cost per tenant.

| Read | Estimate |
| --- | --- |
| Overview | About **25** aggregation requests per company in V1, **30** after the health fix, and **37** after attention rules. Also enumerate organization paths, read projected metadata and the two newest job timestamps, project seven days of page timings and check pending invitations against their distinct parent jobs per page. C adds no overview query. |
| Company detail | V1 projects directory rows and batches Auth account lookups in groups of up to 100. A adds one link timestamp and four top-one activity lookups per cleaner. B adds **24** aggregation requests, including the eight weeks, plus projected submissions, recent completed jobs, legacy photo records and active manager devices. At most one older-run point lookup is needed per completion without a recent matched submission. |
| Recent failures and repeat opens | C adds two projected queries in the selected company, each limited to 20, for up to 40 source rows and at most 20 returned events. A valid cache hit can serve the same authorized request without repeating database reads. CSV export adds no server read. |

Larger result sets use 100-document pages. Directory activity and organization reads run in groups of four. The usage metrics reuse the directory and activity signals already read for the selected organization. The console creates no analytics event, materialized counter or scheduled job.

## Release and rollback

Each stage updates the existing `getPlatformOverview` callable in `us-central1` on Node 22 and its Hosting UI. All stages keep the existing secret binding, zero reserved instances and current security rules. The index additions below are cumulative. Field order is ascending unless marked descending.

| Stage | New index definitions |
| --- | --- |
| A · Directory and health | Three collection-group composites on `assignments(cleanerId, cleanerAcknowledgedAt DESC)`, `checklistRuns(readyForReviewCleanerId, readyForReviewAt DESC)` and `draftMutations(cleanerId, createdAt DESC)`. |
| B · Usage and adoption | Collection-group composites on `issues(status, createdAt)`, `devices(role, active)`, `evidenceContent(status, createdAt)` and `managerNotificationDeliveries(deliveryStatus, attemptedAt)`. Collection composites on `managerReminderDeliveries(deliveryStatus, attemptedAt)` and `cleanerNotificationDeliveries(deliveryStatus, recordedAt)`. Add ascending collection-group single-field indexes on `checklistRuns.readyForReviewAt`, `evidence.createdAt`, `clientReportCapabilities.createdAt` and `clientReportCapabilities.lastSent.at`. |
| C · Owner tools | Two collection composites on `managerPageLoadEvents(result, createdAt DESC)` and `managerOperationEvents(result, createdAt DESC)`. |

1. Release under separate operator authorization, in A → B → C order. For each stage, review the exact commit and its CI, record the previous Hosting and callable revisions, apply the additive indexes and wait for readiness.
2. Update the existing callable, then publish matching Hosting. Check the build marker and verify the authorized overview, selected company and denied-access behavior in the authorized environment.
3. To roll back one stage, restore its previous Hosting build first, then the previous revision of the same callable. The additive indexes can remain. These changes require no data migration or restoration.
