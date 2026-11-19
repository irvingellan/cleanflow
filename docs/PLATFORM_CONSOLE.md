# Platform overview

Open **Dev Center → Platform**, or sign in at `/platform` with an allowlisted developer account. The direct route works without a company membership. The same callable enforces access to both the overview and the staff directory. The screen reads a snapshot when opened; the team directory loads on selection.

## Reading the numbers

- The summary covers all organizations, including older organizations represented only by subcollections. A missing registration date or sign-in appears as unavailable.
- Created and completed services use a rolling 30-day window. Upcoming services use today and the next six calendar dates in the application's scheduling time zone. Archived jobs remain in historical totals and are excluded from upcoming work.
- Last activity is the latest job creation or update. New jobs can have only a creation timestamp. Two one-record queries allow either timestamp to win.
- Health looks back seven days. A failed page load or tracked operation takes precedence. A foreground p95 above three seconds means slow. Without usable timings or recorded errors, the badge shows that there were no measurements. Capped background durations still count as visits but do not influence the median or p95.
- Client and property data is limited to counts. A directory entry exposes only a staff display name, role, active flag and last recorded sign-in. Unsafe labels are omitted. A directory record can exist before its first sign-in.

## Release and rollback

1. Apply the additive Firestore index definitions from this change and wait for them to be ready.
2. Publish the new `getPlatformOverview` callable in `us-central1` on Node 22 with the existing `DEV_CENTER_DEVELOPER_UIDS` binding. It has no reserved instances.
3. Publish Hosting. Verify access to the console and the version in the existing system status panel. Release and access to live data require separate authorization.
4. To roll back, restore the previous Hosting version. An operator can then remove this callable. The indexes can remain in place. The callable never writes documents, so there is no data migration or rollback.
