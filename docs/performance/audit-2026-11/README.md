# External performance audit of 2026-11-22: what was confirmed

An external model audited `main` and listed five improvements. Each one was checked against
`main` at `1ca8dac` (the commit Production served that day). The audit's numbers were treated
as hypotheses. "Measured" below means measured on synthetic data in a development workspace;
nothing was measured in Production and no pilot incident is attached to any item.

| Item | Verdict | Outcome |
| --- | --- | --- |
| A. Payments reads paid team Jobs again on every load | Confirmed | Fixed in its own pull request, see [the note](PAYOUTS_SETTLED_JOBS.md) |
| B. Dashboard fan-out and duplicate reads | Partly confirmed, smaller than stated | No code change; decisions below |
| C. Job Detail shows late responses of another Job | Confirmed | Fixed in its own pull request, see [the note](JOB_DETAIL_STALE_LOADERS.md) |
| D. Thumbnail generation memory | Confirmed as a risk by measurement | No code change; needs a backend decision |
| E. Frontend payload | Sizes confirmed, proposed quick fix saves nothing | No code change; decisions below |

The two notes linked above arrive with their pull requests.

## Baseline facts the audit got wrong or left open

- `functions/src/index.js` exports 68 Functions, not 54. The count of deployed Functions comes
  from the release receipt, not from this file.
- 233 test files and 29 Playwright specs: correct.
- 20 non-test modules contain the pilot organization literal: correct. That work belongs to the
  organization pull requests (#192, #222 to #226).
- The local checkout the audit described (old branch, 55 worktrees) is on the developer's
  machine and was not inspected or changed. All work here used a fresh clone of `main`.

## B. Dashboard

What the code does on one load, counted from `dashboardService.js`:

| Wave | Requests |
| --- | ---: |
| Core queries, including the whole `properties` collection | 7 |
| Offers: 2 per Job that awaits a cleaner, at most 30 such Jobs | 0 to 60 |
| Open issues: 1 per Job in progress (at most 10) and per recent completed Job (at most 5) | 0 to 15 |
| Cleaner names, 30 ids per request | 1 to 2 |

A quiet day with five recent completed services costs 13 requests; the ceiling is about 84. The
audit's "35 to 75 or more" is the upper part of that range, not the usual load. Reads run four
at a time and the recent-completed query is already capped at 25.

Findings:

- **Duplicate `properties` read: confirmed.** The Dashboard and `usePropertiesController` each
  read the whole collection when the manager application starts. Sharing one copy saves one
  request and one document read per Property per load. It was not done here because the
  Dashboard uses its own fresh copy to hide Jobs of archived Properties; a shared copy needs an
  owner and an invalidation rule first, and `dashboardReads.js` is edited by six open pull requests.
- **Collection-group queries: not ready.** Single-field indexes for `offers.status` and
  `issues.status` exist, but the Rules have no collection-group match, so such a query is denied
  today. It needs a Rules change and authorization tests.
- **Function warm-up at start: keep.** It is four calls that return right after authorization,
  at most once every eight minutes per browser. Moving it to the Services screen would put the
  cold start (about 4 s) back on the first service opened from Home.

## D. Thumbnails

`makeJpegThumbnail` decodes the saved photo with `jpeg-js`, synchronously, the first time a
grid asks for it; later requests read the cached file. The Functions run with the default
256 MiB and default concurrency (`setGlobalOptions` sets only `maxInstances: 20`).

Measured with `scripts/performance/thumbnailMemory.mjs` on Node 22 with a 192 MB heap limit, in
a bare process that starts at about 45 MB (a real instance starts higher, with the Admin SDK loaded):

| Synthetic photo | Photos in a row | Thumbnails made | Peak process memory | Time per photo |
| --- | ---: | ---: | ---: | ---: |
| 1920 x 1440, 1.5 MB | 1 | 1 | 186 MB | 0.45 s |
| 1920 x 1440, 1.5 MB | 20 | 20 | 230 MB | 0.41 s |
| 1920 x 1440, 1.5 MB | 50 | 50 | 247 MB | 0.42 s |
| 3000 x 2250, 3.8 MB | 1 | 1 | 352 MB | 1.06 s |
| 4000 x 3000, 6.6 MB | 1 | 0 | 419 MB | 1.20 s |

Reading:

- A photo optimized on the phone (1920 px) already brings the process close to 256 MiB.
- The server accepts photos up to 16 MP. A 6.75 MP or 12 MP photo exceeds 256 MiB in this
  measurement. The 12 MP one also produces no thumbnail: the decoder stops at its 160 MB limit
  after 1.2 s and the grid falls back to the full photo.
- The decode blocks the instance for 0.4 to 1.2 s per photo, so a grid of new photos is served
  one at a time.
- Not every open pays this: the audit was wrong there. The cost is paid once per photo.

No out-of-memory event was looked up in Production logs. Options, each a backend change that
needs its own plan and release authorization: give the photo Functions more memory and lower
concurrency; refuse to decode above the phone's 1920 px output and serve the full photo
instead; make the thumbnail when the photo is saved; replace the decoder with a native one.

## E. Frontend payload

Measured with `scripts/performance/entrySizes.mjs` on an emulator build of `1ca8dac`:

| Entry | Chunks | JavaScript | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: |
| Manager | 17 | 1,868,207 | 522,258 | 431,713 |
| Cleaner agenda | 8 | 1,312,047 | 376,349 | 315,964 |
| Public checklist | 11 | 643,825 | 178,539 | 146,827 |
| Public offer | 8 | 555,958 | 152,810 | 123,747 |

The single stylesheet is 205,930 bytes (34,770 gzip). The message catalog is 348,954 bytes of
source in three languages and ships in the `main` chunk that every entry loads. The manager
screens are one chunk of 615,410 bytes. The audit's sizes were close.

- **Pointing `cleanerHubFirebase.js` at `services/firebase/app.js`: tried, saves 0 bytes.** The
  cleaner agenda downloads exactly 1,312,047 bytes before and after. Auth, Firestore and Storage
  are built into one shared chunk, and the agenda needs Auth and Firestore from it anyway. A real
  saving needs Storage in a chunk of its own, which changes how chunks load; module preload was
  turned off on purpose for WebKit, so that needs device testing.
- **Loading one language at a time** is the largest available saving for public pages (roughly two
  thirds of the catalog). `translateInLanguage` is synchronous and the manager renders messages in a
  cleaner's language, so this changes startup and needs a design.
- **OneSignal** is still used by the manager notification screens. It stays until the notification
  pilot says otherwise.

## Decisions waiting for the owner

1. Payments: add a queryable "settled" marker to bound the first query (new field, backfill, index).
2. Dashboard: who owns a shared Property list, and whether collection-group Rules are wanted.
3. Thumbnails: which of the four options, and a release window for the Functions involved.
4. Payload: whether per-language loading is worth a startup change now.
