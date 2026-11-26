# Helm Bridge, Clubhouse edition: redesign plan (v2)

Status: **ready for owner approval**, 2026-11-18. Nothing here is built.
Recounted from `origin/main` at `4d4cb8caf5`. That includes #2588, which
landed #2578: Practice registered as P017, the generated clickable map, a
coach/player/shared/signed-out label on every Clubhouse address, and
Clubhouse-only GolfHelm routes outside admin. It also includes the 13 Nov
audit records. Every number here was counted from those files, not estimated;
the base for the work (PR 0 in §12) is done.

**If you only read four sections:** 1 (what changes for you), 2.2 (problems
already found), 8 (the screens) and 15 (your decisions).

---

## 1. What changes for you

The Bridge stops being a list of errors and becomes **the live view of the
Clubhouse contract.** Every button, toast and state in Clubhouse already has a
number in the docs. After this, every one of them also reports when it happens.
The Bridge shows what each number means, whether it happened, to whom, why, and
what changed. It hands Claude Duet everything about it in one paste.

| You want to know… | Today | After |
| --- | --- | --- |
| "Cole says Messages won't send" | Search Incidents by text, guess the time, open Sentry, read the code to find which toast he saw | ⌘K → type his email → **his session timeline**: he tapped Send (`ACT-P007-SEND-MESSAGE`), it ended in `70603` / CH-7004 "Couldn't send the message", the server said `42501` on `golf_messages`, on the iOS app, release `a1b2c3d`. One click builds the Duet pack. |
| "Did yesterday's release break anything?" | Compare incident counts by eye | **B10 Releases**: 3 codes new, 2 rising, 1 gone, Save practice plan p95 up 40%, with the PRs that touched each file |
| "Does every button actually work?" | `CLICKABLES.md`, a Sept 30 snapshot | **B03 Controls**: every control on every page, labelled, with live taps, the action it runs, its success rate, and the buttons nobody has tapped in 30 days |
| "Are the docs still true?" | Hope | **B11 Drift**: nine lists, each driven to zero, including the ones already found below |
| "How finished is Clubhouse?" | Read PROGRESS.md and 17 manifests | **B12 Readiness**: one board, read from the files at the production commit |

---

## 2. What the docs give us, and what they don't

### 2.1 What exists (counted)

| Layer | Count | Source of truth |
| --- | ---: | --- |
| Pages | **17** (P001 Shell to P017 Practice) | `config/clubhouse/pages/*.json` |
| Who each address is for | **53** page addresses (22 coach, 5 player, 22 shared, 4 signed out), **10** query views that are screens of their own, **15** other addresses (old addresses, join links, the 404), each with the component each role gets. `clubhouse:check` fails on an unlabelled `page.tsx` | each manifest's `screens`, `config/clubhouse/other-routes.json`, `docs/clubhouse/generated/CLUBHOUSE_ROUTE_MAP.md` |
| Bridge IDs: states, toasts, validations, waits, a11y, haptics | **1,988** (1,867 implemented, 97 reserved, 24 deprecated) | `config/clubhouse/bridge-contracts.json` |
| Categories | 25, 24 in use. **25 "Helm Bridge action" has none.** | `config/clubhouse/category-map.json` |
| Distinct `CH-` codes written in the source | 1,550 (1,613 counting tests) | an `rg` over `src/` |
| Actions (tap → handler → server action → tables → outcome IDs) | **225**, with **847** outcome links | `CLUBHOUSE_ACTION_MAP.md` |
| **Every control in the code** | **1,762 controls in 387 files**, listed by page and file in the map. **402** sit under a `CH-` code; **576** build their label at run time; **144** have no label. | `docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md` from `scripts/clubhouse/clickable-map.mjs` (`npm run clubhouse:clickables`) |
| Controls on the design boards | **666** rows (405 works, 205 decided, 41 GAP, 13 hidden, 2 data-gap), the Sept 30 snapshot, kept for its board verdicts | `docs/clubhouse/history/CLICKABLES.md` |
| Audit findings | **26** (`F-0001`…): 1 S1, 12 S2, 10 S3, 3 S4, across correctness, a11y, content, touch, contrast, craft, motion and speed. Each has page, screen, role, tier, standard (`CO-01`…), observed, expected, SQL, evidence, repro, fix, files and effort. | `docs/clubhouse/audit/2026-11-13/findings.jsonl`, `scorecard.json` (grades per page family) |
| Numbers against the database | 8 pages: each figure Clubhouse showed, the expected value from staging, the verdict and the query | `docs/clubhouse/audit/2026-11-13/numbers/P0xx-*.md` |
| Production phone audit | 16 coach findings and 13 player findings, 15 Nov, tier C | `clubhouse-handoff/prod-audit-2026-11-15/` (untracked, canonical checkout) |
| Elements carrying `data-ch` | 92 | `src/clubhouse` |
| Catalog tables (exact words the coach sees, the code that draws them, the test that forces them) | 16 catalogs | `docs/clubhouse/catalog/*.md` |
| States you can force in the preview app | about 40 screens × `?state=` | `src/app/clubhouse-preview/[screen]/page.tsx` |

### 2.2 Problems already found while writing this plan

The drift screen (B11) will show these on day one. Each was checked by hand.

1. **Practice is registered, but its codes have no Bridge IDs.**
   - Practice is **P017** on `main` (manifest, six page docs, phone draft;
     landed with #2588).
   - `bridge-contracts.json` has **0 P017 rows**. Practice's catalog rows are
     kept under P013 as `CH-1308x`.
   - The code already writes **25** distinct `CH-17xxx` codes (12 of them in
     `src/lib/golf/practice-errors.ts`), which overlap a future P017 catalog
     block. `catalog/README` flags this as an open owner decision (D12 here).
2. **6 `where` paths point at files that no longer exist** (28 rows name them;
   rechecked on `4d4cb8caf5`):
   - src/clubhouse/shell/TabBar.tsx (deleted)
   - `screens/roster/RosterPhone.tsx`
   - `screens/stats/StatsPlayerPhone.tsx`
   - `screens/coachhelm/PlayerBoard.tsx`
   - `screens/coachhelm/CoachBoard.tsx`
   - `app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx`
3. **One action lists a deprecated ID** as a live outcome:
   `ACT-P003-OPEN-PLAYER`'s `loadFailed` is 30615.
4. **1,625 of the 1,988 IDs are reachable only through their `CH-` code**, with
   no `where` file#symbol. Only 362 carry an exact location. Those 1,625 still
   resolve, through the code index (§4.6).
5. **Controls are mapped but have no stable ID.** The clickable map lists all
   1,762 controls by source line, and a line number changes on every edit, so
   nothing can count taps on one control over time. 1,360 of them have no `CH-`
   code nearby, 144 have no label at all, and 576 build their label at run time.
6. **Nothing is sent.** D-68 (PROGRESS.md:1041): "the Bridge itself is wired
   later … nothing is sent to the Bridge". `Toast.tsx` reports nothing.
   `chReport` sends `ui`, `surface`, `action` and `severity`, but no code.

---

## 3. The model: one graph

Everything the Bridge shows is one graph, built at build time and shipped with
the app as `bridge-graph.json`:

```text
Page (P007 Messages)
 └─ Surface (messages.thread, messages.rail)           ← chReport's "surface"
     └─ Control (CTL-P007-014 "Send")                  ← NEW layer, from CLICKABLES + data-ch
         └─ Action (ACT-P007-SEND-MESSAGE)             ← action map
             └─ Outcome (Bridge ID 70603 · CH-7004)    ← bridge-contracts
                 └─ Signal (each time it happened)     ← NEW, Phase A
```

`node scripts/clubhouse/registry.mjs sync` already reads every source. It gets
one more output:

```ts
// docs/clubhouse/generated/bridge-graph.json (generated; never hand-edited)
interface BridgeGraph {
  builtAt: string; sha: string;
  pages: Record<PageId, { name: string; routes: string[]; roles: Role[]; gates: ManifestStatus;
                          catalog: string; docs: PageDocs; held: HeldPlan[];
                          // each manifest's `screens`: who each address is for and what each role gets
                          screens: { route: string; view?: string; audience: 'coach'|'player'|'shared'|'signed-out';
                                     coach?: string; player?: string; visitor?: string }[] }>;
  surfaces: Record<string, { page: PageId; files: string[] }>;
  controls: Record<ControlId, { page: PageId; label: string; where: string; board: string;
                                boardStatus: 'works'|'decided'|'GAP'|'hidden'|'data-gap';
                                actions: ActionId[]; role: Role|'both'; viewport: 'desk'|'phone'|'both' }>;
  actions: Record<ActionId, { page: PageId; label: string; handler: string; service: string;
                              tables: string[]; useActionName?: string; outcomes: Record<string, BridgeId>; tests: string[] }>;
  ids: Record<BridgeId, { ch?: string; page: PageId; category: number; name: string; meaning: string;
                          status: 'implemented'|'reserved'|'deprecated'; where?: string[]; tests?: string[];
                          catalogRow?: { when: string; theySee: string; how: string; test: string } }>;
  chIndex: Record<string, BridgeId>;            // CH-7004 → 70603
  codeIndex: Record<string, string[]>;          // CH-7004 → files that write it (§4.6)
  findings: Record<string, { page: PageId; screen: string; severity: 'S1'|'S2'|'S3'|'S4'; dimension: string;
                             standard: string; title: string; repro: string; fix: string; files: string[];
                             tier: 'W'|'S'|'D'|'C'; audit: string; status: 'open'|'fixed'|'wontfix' }>;  // F-0001…
  numberChecks: Record<PageId, { shown: string; expected: string; verdict: string; query: string }[]>;
}
```

The screens come straight from the routing labels already on `main`, so a
signal's address resolves to its page, its audience and the component the person
saw, and a control inherits its role from the screen it sits on.

Both the Bridge screens and the ingest endpoint read this file, so the browser
never looks anything up. A release's graph is kept by its SHA, so an event is
always read against **the contract that was live when it happened**.

---

## 4. Phase A: the signal spine (wiring D-68)

### 4.1 The envelope

```ts
interface ChSignal {
  v: 1;
  code: string;               // 'CH-7004' (or a Bridge ID for rows with no CH code)
  kind: 'state'|'toast'|'action'|'crash'|'view'|'vital'|'frustration';
  outcome?: 'start'|'success'|'failure'|'offline'|'busy'|'stopped-waiting'|'retry'|'cancelled';
  page: PageId; surface?: string; control?: ControlId; act?: string;  // useAction name, resolved to ACT on the server
  role: 'coach'|'player'|'signed-out'; teamId?: string; userId?: string;
  sessionId: string; seq: number; at: number;                          // monotonic order inside the session
  release: string; platform: 'ios-app'|'ios-safari'|'desktop'|'other'; viewport: 'phone'|'desk';
  online: boolean; reducedMotion: boolean; animationsOff: boolean;
  durationMs?: number;        // actions and waits
  serverCode?: string;        // '42501', '23P01', 'PGRST116'
  message?: string;           // failures only, redacted like /api/log-error
  trail?: string[];           // failures only: the last 12 chTrail breadcrumbs
  sentryEventId?: string; replayId?: string;
}
```

**As built (PR 1, 2026-11-24):** `src/lib/admin/clubhouse/signal.ts`. Three
changes from the sketch above. `kind` adds `tap` (E7). `code` may be left out
of a view, a tap and an action's start, where the server names it from the
page, the control or the action map. A failure carries `reported: true` when
`chReport` or `logError` already wrote its `admin_events` row; the route then
stamps the Bridge columns on that row (found by session and seq) instead of
writing a second one.

### 4.2 Where it is sent from: shared components, not the 467 call sites

| # | Shared component | Sends | Covers |
| --- | --- | --- | --- |
| E1 | `ui/Toast.tsx` (any toast with `code`) | `toast` + tone, plus whether Try again was offered or pressed | All 467 toast call sites |
| E2 | `lib/use-action.ts` | `action` start, then one outcome, `durationMs`, `serverCode` | Every `useAction` save. CH-1903 offline and CH-1991 stopped waiting come for free. |
| E3 | `ui/SectionBoundary.tsx`, `RouteErrorView` | `crash` + component stack | Section and page crashes |
| E4 | `ui/States.tsx`, `NoData`, `Retry`, `RefreshNotice`, `EmptyShape` | `state` when drawn (counted only) | Empty, failed to load, stale. A `code` prop is added where a page doesn't pass one yet, categories 04, 06 and 08 first. |
| E5 | `lib/track-server.ts` (`chLogServer`) | `state` failure from a server read | Loader failures, which today become a toast with no cause |
| E6 | `shell/ClubhouseFrame.tsx` | `view` (page, role), session start, team switch | Page views and sessions |
| E7 | `lib/press.ts` (`useChPress`) | `control` tap for elements with `data-ctl` (counted only) | Control Atlas taps |
| E8 | `instrumentation-client.ts` | `vital` (INP, LCP, CLS) and `frustration` (CH-1951 to 1953), with the page | Experience screen |
| E9 | Server actions through `observed-action.ts` | the server half of an action: duration, Postgres code, table | Shows whether a failure was the network, RLS or a constraint |

**As built (PR 1, 2026-11-24):** the client queue is `src/clubhouse/lib/signal.ts`.

- E1: `Toast`. An error toast nobody reported counts as a failure; Try again counts as a retry.
- E2: `useAction`. A throw is now reported once at medium, a handled failure
  once at low, and a quiet one not at all (the route writes its row). Each
  report runs inside `reportingSignal()`, so `chReport` adds the signal's
  place to its row without its callers' arguments changing.
- E3: `SectionBoundary` and `RouteErrorBoundary`. An offline route error counts
  under its transient or load code.
- E4: `EmptyState`, `InlineNotice` and `PageNotice`, through `ui/StateSignal.tsx`.
  `RefreshNotice`, `Retry` and `EmptyShape` draw through these. `NoData` takes
  no code, so it isn't counted.
- E6 to E8: these live in `src/clubhouse/shell/use-signals.ts`, called by
  `ClubhouseFrame`, not in `press.ts` or `instrumentation-client.ts`. Signals
  carry the page and the team, which only the shell knows. Taps count
  `[data-ctl]`, and no element carries one until §4.7 numbers the controls
  (PR 2). A rage click is 3 clicks on one element within 600 ms. It never
  counts an enabled button, a link or a field, or a click that selects text.
- E5 and E9 move to PR 3. They need server-side signals, which this route does
  not take yet.

### 4.3 Runtime contract checks (the creative part of the spine)

The ingest endpoint checks every envelope against the graph for the live
release, so drift is caught in production, not only in CI:

- **Unknown code:** not in `chIndex`. Recorded, and shown on B11.
- **Wrong outcome:** an action ended in a code its action-map row doesn't list.
- **Deprecated or reserved fired:** a retired or unbuilt state happened.
- **Silent action:** `start` with no outcome within 30 s and no `pagehide`.
- **Wrong page:** a code from P007 fired on a P011 route.

Each becomes a `drift` row, not an error. B11 lists them.

### 4.4 Transport

- Envelopes are queued in memory and flushed every 10 s, at 20 envelopes, and on
  `pagehide` / `visibilitychange` through `navigator.sendBeacon`. The app
  already uses that path in `src/lib/offline/partial-save-beacon.ts`.
- New route `POST /api/ch/signal`:
  - the same redaction as `/api/log-error`
  - its own durable limiter (`checkRateLimit`, Upstash): 240 envelopes per
    minute per session, and 30 batches per minute per IP
  - malformed batches dropped and counted
- **Kill switch:** the flag `clubhouse_signals` in `config/feature-flags.yml`.
  When it is off, `chSignal` does nothing. The B11 pipe panel shows "switched
  off", never "all clear".
- Sending never fails a tap: no await on the hot path, and every call is wrapped
  in try/catch.

**As built (PR 1, 2026-11-24):** the per-session limit counts batches: 12 a
minute, which at 20 envelopes a flush is the 240 above. A batch carries at most
50 envelopes, plus up to 50 earlier ones as context when it has a failure.
Before anything is stored, each envelope is resolved against the graph this
deploy shipped with (`graph-server.ts`). The route also stores nothing from a
Preview or Development runtime, since those hold production credentials.

### 4.5 Storage (shared production database)

| Table | One row per | Kept | Why |
| --- | --- | --- | --- |
| `admin_events` + new columns `ch_code`, `bridge_id`, `page_id`, `action_id`, `control_id`, `release`, `platform`, `session_id`, `server_code` (indexed) | failure: a failed action, an error toast, a crash, a failed load, a permission refusal | as now | Keeps one error store (DECISIONS 5). Incidents, the digest and auto-resolve keep working, and gain the code. |
| `clubhouse_signal_hourly` | hour × code × role × platform × release (count, users, p50, p95, p99) | 180 days | Success, empty, waits, views and taps without a row per skeleton. "Never seen" needs every count. |
| `clubhouse_sessions` | session (user id, role, team, platform, release, start, end, pages, failures, replay id) | 30 days | The Sessions index. No name or email is stored: the Bridge reads them live from `profiles` when a session is opened (D7). |
| `clubhouse_session_events` | envelope in a session **that has a failure**, plus the 50 before it | 14 days | The timeline, kept only where something went wrong. Volume stays bounded. |
| `clubhouse_drift` | drift kind × code × release (count, first seen, last seen) | 180 days | B11 |
| `bridge_notes` | an owner note: a code marked expected, a watch, a pack sent | forever | Bridge's own small state |

**As built (PR 1, 2026-11-24):** `supabase/migrations/20261124090000_clubhouse_bridge_signals.sql`,
**held** (`HELD.md`). The hourly key also carries kind, outcome, action and
page, so success and failure, and each page, count apart; p50, p95 and p99 are
read from a duration histogram. All writes go through one service-role function,
`clubhouse_ingest_signals(jsonb)`, called once per session per batch. While the
migration is held, the route writes failures to `admin_events` without the new
columns (they travel in `metadata.bridge`), stores no counts, and says
`persisted: false`. pgTAP: `supabase/tests/rls/clubhouse_bridge_signals.sql`.

**Volume bound:** hourly rows are at most the distinct codes that fired, × 3
roles, × 4 platforms, × the 1–2 live releases. In practice that is a few hundred
an hour, about 0.5M rows over 180 days. Failure rows are capped by the limiter.

**The rails:**

- additive DDL only
- `REVOKE ALL … FROM anon, authenticated`, with the ACL check
- read through `is_super_admin()`
- writes only by the service role in the route
- retention through pg_cron
- run on the local Docker stack first, then `db:apply`, then an
  `information_schema` check
- reviewed by `db-migration-reviewer`, and `security-reviewer` for the route

### 4.6 The code index (closes problem 4)

`registry.mjs sync` scans `src/` for `CH-` literals and `data-ctl` attributes,
and writes `codeIndex` and `controls` into the graph. `clubhouse:check` fails
on:

- a code written in the source but missing from the registry (problem 1)
- a `where` path that doesn't exist (problem 2)
- an action outcome that is deprecated (problem 3)

Every one of the 1,988 IDs then resolves to real files.

### 4.7 Numbering the controls (closes problem 5)

This builds on what already exists: `scripts/clubhouse/clickable-map.mjs`
(on `main`) already finds all 1,762 controls with the TypeScript parser, and
assigns each to its page and its nearest `CH-` code. It needs three additions.

- **A stable ID.** `clickable-map.mjs --assign` gives each control a permanent
  `CTL-P###-NNN` and writes it on the element as `data-ctl`. The ledger is
  `config/clubhouse/controls/P###.json`: each ID with its file, element, label,
  description, role, viewport and actions. A control keeps its ID when it moves;
  a new one gets the next free number; a removed one goes to the tombstones,
  like Bridge IDs.
- **A label for every control.**
  - The 144 with "(no label)" get one in the ledger.
  - The 576 built at run time get a template, for example "Open {player}'s
    stats", so the Bridge can still name them.
  - The board verdict (works, decided, GAP) is carried over from the Sept 30
    `CLICKABLES.md` snapshot where a row matches.
- **A link to an action.** Each control that runs a `useAction` gets that
  action's `ACT-` ID from the action map. A control with neither an action nor a
  link is listed on B11.
- **The gates:**
  - `clickable-map.mjs --check` goes into `clubhouse:check` (D11; today it is
    "not wired into CI … the owner's decision").
  - The check fails on a new control without `data-ctl` or a label.
  - The existing 1,762 are numbered in PR 2, so nothing is blocked before then.

---

## 5. Detection rules (numbered; they feed Pulse, the digest and the badges)

| Rule | Fires when | Severity |
| --- | --- | --- |
| R-01 Spike | a code's hourly rate beats its own baseline (same hour of week, previous 4 weeks) by a Poisson z-score > 4 with at least 5 events | by category: 06/08/07 high, others low |
| R-02 New after release | a failure code fires in a release for the first time, at least 3 users | high |
| R-03 Action degraded | an action's success rate falls 10 points under its 7-day baseline (at least 20 tries) | high |
| R-04 Slow action | p95 duration is 2× the baseline, or above the slow-save line | medium |
| R-05 Silent action | more than 2% of starts have no outcome | high |
| R-06 Crash loop | the same crash code fires 3 times in one session | high |
| R-07 Retry storm | a session presses Try again 5 times on one code | medium |
| R-08 Page went quiet | a page with usual traffic sends no views for 2 hours in its usual active hours | high (the instrument is broken) |
| R-09 Pipe silent | no envelopes for 15 minutes in active hours | critical: every "all clear" is marked untrusted |
| R-10 Contract drift | any §4.3 drift kind | low; B11 only |
| R-11 Frustration | rage or dead clicks on one control from more than 3 users a day | medium |
| R-12 Vital regression | a page's INP p75 rises past 200 ms, or its LCP p75 past 2.5 s, on iOS | medium |

The rules are pure functions in src/lib/admin/clubhouse/rules.ts (new), each with
a fixture test. Each one names the code, the page and the release, so every
alert opens a dossier.

---

## 6. The Bridge numbers itself

The Bridge has 15 screens, numbered B01 to B15. Every control and state on them
has a `BR-<screen><nn>` code:

- the code sits on the element as `data-br`
- it is listed in config/bridge/contracts.json (new), with a generated
  `BRIDGE_UI_MAP.md`
- it is forced by a test

The same four states repeat on every screen:

| Code | State |
| --- | --- |
| `xx90` | loading: a skeleton shaped like the screen |
| `xx91` | empty, with the reason |
| `xx92` | failed to load, with Try again |
| `xx93` | signal untrusted: R-09 fired, or the switch is off, so "nothing happened" can't be claimed |

**Category 25 (Helm Bridge action), empty today**, gets three rows per Clubhouse
page:

- `P###-25-01` "Open in Bridge"
- `-02` "Signal the Bridge reads"
- `-03` "Context pack"

The 25 categories then answer in both directions: what the page does, and what
the Bridge does with it.

---

## 7. Information architecture

### 7.1 The rail

| Section | Screen | Route | Key |
| --- | --- | --- | --- |
| **Clubhouse** | B01 Pulse | `/admin` | 1 |
| | B02 Pages | `/admin/clubhouse`, `/admin/clubhouse/[page]` | P |
| | B03 Controls | `/admin/clubhouse/controls`, `/[ctl]` | O |
| | B04 Actions | `/admin/clubhouse/actions`, `/[act]` | A |
| | B05 Codes | `/admin/clubhouse/codes`, `/[bridgeId]` | C |
| | B06 Incidents | `/admin/errors`, `/admin/errors/[fp]` (URLs unchanged) | 3 |
| | B07 Sessions | `/admin/clubhouse/sessions`, `/[id]` | S |
| | B08 People | `/admin/clubhouse/people/[userId]`, `/teams/[teamId]` | Y |
| | B09 Experience | `/admin/clubhouse/experience` | E |
| | B10 Releases | `/admin/clubhouse/releases`, `/[sha]` | V |
| | B11 Drift | `/admin/clubhouse/drift` | D |
| | B12 Readiness | `/admin/clubhouse/readiness` | G |
| | B13 Duet desk | `/admin/clubhouse/duet` | Q |
| **Platform** | Health, Jobs & Integrity, Database, Deploys & Infra, Auth, Releases (flags), Flight Recorder, Work log | unchanged | unchanged |
| **Customers** | Users & Teams, Activity, Utilization, Teams pulse | unchanged | unchanged |
| **More** | Golf (legacy), Baseball, Lift Lab, Engineering OS, Ben + Leah | unchanged | unchanged |

B14 is the command palette and B15 is the shell (toasts, banners). Shortcuts
1–9 keep their meaning, and plain `r` stays Refresh.

### 7.2 The command palette (B14): one box that finds anything

Type any of these and land on its dossier:

| You type | You get |
| --- | --- |
| `CH-7004` or `70603` | B05 code dossier |
| `ACT-P007-SEND-MESSAGE` or "send message" | B04 action |
| `CTL-P007-014` or "schedule with" | B03 control |
| `P011` or "rounds" | B02 page |
| an email or a name | B08 person |
| a team name | B08 team |
| a SHA (7+ hex) | B10 release |
| a fingerprint | B06 incident |
| `>pack 70603` | builds a pack straight away |

### 7.3 The scope bar: one filter that follows you

Every Clubhouse screen shares one bar:

- **window** (1h · 24h · 7d · 30d · custom)
- **role** (all · coach · player · signed out)
- **platform** (all · iOS app · iPhone Safari · desktop)
- **release** (all · live · pick)
- **team** (all · pick)

It lives in the URL (`?w=24h&role=coach&pf=ios-app`), so a link you paste
reopens the same slice, and moving between screens keeps it.

### 7.4 The look

The Bridge stays **Fairway** (its own design system; never `--ch-*`). Three
additions:

- **The category legend:** 25 fixed hues, used the same way on every screen
  (dots, matrix cells, timeline marks). Failure categories 06, 07, 08 and 11 use
  the error family; 09 Success uses the gain family; the rest use neutrals and
  accents.
- **Chips:** a page chip (`P011 Rounds`), an ID chip (`70603 · CH-7004`) and an
  action chip, each one click to its dossier, the same everywhere.
- **Two densities:** Desk (a dense table, the default on a laptop) and Glance
  (cards, the default on a phone).

The phone bar is **Pulse · Incidents · Sessions · ⌘K**, with More for the rest.

### 7.5 One anatomy for every screen

1. **The question line:** the one question this screen answers, in plain words,
   under the title.
2. **The truth line:**
   - when it was read
   - the pipe status (R-09)
   - the release
   - what the scope is
3. The scope bar.
4. The body.
5. **The evidence footer:** which tables and files the screen read, and Copy as
   Markdown.

---

## 8. The screens

Each screen gives:

- the question it answers
- a wireframe
- what each block shows
- its numbered controls: code, label on the button, what it does
- its states
- what it reads
- what it reuses

### B01 Pulse (`/admin`)

**The question:** "Is Clubhouse OK right now, and if not, where?"

```text
┌ Pulse ─────────────────────────────── live a1b2c3d · pipe ● 4s · 37 active ┐
│ [24h ▾] [All roles ▾] [All platforms ▾]                       ↻  ⧉ Copy    │
├─────────────────────────────────────────────────────────────────────────────┤
│ P001 Shell ▁▁▂▁ ●   P002 Home ▁▁▁▁ ●   P003 Roster ▁▃▁▁ ●   P004 Stats …    │
│ P007 Messages ▁▂▆█ ▲ 70603 ×41      P011 Rounds ▁▁▂▂ ●   …  (17 tiles)      │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ RISING                       │ ACTIONS SLIPPING                             │
│ 70603 CH-7004 Couldn't send  │ Send a message     91% ▼8   p95 2.4s         │
│   P007 · iOS app · since c3d │ Save practice plan 97%      p95 1.9s ▲       │
│ …                            │                                              │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ NEW INCIDENTS (5)            │ WHAT JUST CHANGED: a1b2c3d, 2h ago           │
│ …                            │ P007, P011 change logs · 3 PRs · 2 codes new │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

**The blocks:**

- **Page wall:** 17 tiles. Each shows the failure rate against its own baseline,
  a sparkline, the worst code, a dot each for coach and player, the manifest
  gates, and an R-08 "went quiet" mark. P017 Practice is included.
- **Rising:** R-01 and R-02 hits, ranked.
- **Actions slipping:** R-03 and R-04 hits.
- **New incidents:** the five newest unresolved incidents in scope.
- **What just changed:** the live release, its PRs, and the page change logs it
  carries.

| Code | Label | Does |
| --- | --- | --- |
| BR-0101 | Page tile | Opens that page in B02 |
| BR-0102 | Rising row | Opens the B05 code dossier |
| BR-0103 | Action row | Opens the B04 action |
| BR-0104 | Incident row | Opens B06 detail |
| BR-0105 | Release card | Opens B10 for that release |
| BR-0106 | Pipe dot | Opens B11 at the pipe panel |
| BR-0107 | Refresh (r) | Reads again; the screen stays up while it does |
| BR-0108 | Copy | A Markdown pulse report |
| BR-0109 | Pause live | Stops auto-refresh (the existing AutoRefresh) |

**Reuses:** TruthStrip, BlindnessBeacon, KpiTile, AutoRefresh,
ReleaseWatchPanel, CopyReportButton.

### B02 Pages (`/admin/clubhouse`, `/[page]`)

**The question:** "How is this page doing, against everything its contract says
it can do?"

**The index** is a table of the 17 pages, plus the
68 shared controls no page claims. Columns:

- IDs: implemented, reserved, deprecated
- categories answered out of 25
- controls, and controls tapped in 30 days
- actions
- 24-hour failures
- codes seen and never seen
- held plans
- the 7 manifest gates

**The page dossier** has a ViewRail with seven views:

1. **Overview:** routes, roles, features; the live failure rate by role and
   platform; top codes; incidents; server read failures (E5); the R-08 status.
2. **State matrix**, the screen's centrepiece:

   ```text
   P007 Messages · 122 IDs                       ▣ fired  ▢ never seen  ⊘ deprecated
              01 02 03 04 05 06 07 08 09 10 … (items)
   01 Core    ▣  ▣  ▣
   02 Load    ▣  ▣
   04 Empty   ▣  ▢  ▣  ▣  ▢
   05 Valid   ▢  ▣  ▢
   06 Server  ▣  ▣  █  ▣  ▢  ▢  ▣  ▢  ▢  ▢  ▢  ▣      █ = 70603 ×41 (failure)
   07 Network ▣  ▢  ▣
   08 Perm    ▢  ▣
   …
   ```

   - **fill** is how often it fired in the scope
   - **outline** is the status
   - a **red corner** means it fired as a failure
   - **hover** shows the meaning and the exact words the coach sees (from the
     catalog)

3. **Controls:** this page's `CTL-` rows (see B03).
4. **Actions:** this page's `ACT-` rows, with their funnels (see B04).
5. **Contract:** CONTRACT, PAGE, WIRING, DESIGN and VERIFY, plus the catalog,
   rendered at the live SHA; held plans; the change log, newest first; the phone
   spec.
6. **Phone:** the phone-only categories (17 haptic, 19 responsive) and the iOS
   app against Safari, side by side.
7. **History:** failures per release, marked where a release touched this page.

| Code | Label | Does |
| --- | --- | --- |
| BR-0201 | Page row | Opens the dossier |
| BR-0202 | Sort | Failures · coverage · never seen · gates |
| BR-0203 | View rail | Overview · States · Controls · Actions · Contract · Phone · History |
| BR-0204 | Matrix cell | Opens that ID's dossier (B05) |
| BR-0205 | Category label | Shows that category alone, with its default and exception note |
| BR-0206 | Show | All · fired · never seen · failures |
| BR-0207 | Doc link | Opens the doc on GitHub at the live SHA |
| BR-0208 | Force this state | Opens `/clubhouse-preview/<screen>?state=…` in an iPhone frame (D6) |
| BR-0209 | Context pack | The whole page's pack, to B13 |
| BR-0210 | Copy | The page report |

### B03 Controls (`/admin/clubhouse/controls`, `/[ctl]`): every button, labelled

**The question:** "What can a person press, what does it do, and does it work?"

This is the "all buttons labelled" screen. One row per control:

```text
CTL-P007-014  Send                   P007 Messages · thread composer · both · desk+phone
              → ACT-P007-SEND-MESSAGE   taps 1,204   success 91% ▼   p95 2.4s
CTL-P007-021  Schedule with this person   GAP on board (CLICKABLES) · taps 3 · → /calendar
CTL-P010-008  Acknowledge            P010 Team Hub · player · taps 0 in 30d  ⚠ never pressed
```

Each row has:

- the control ID
- the label as drawn
- a one-line description: what it does, in plain words
- page and surface
- role and viewport
- its board and board status (works, decided, GAP)
- its actions
- taps, success rate and frustration (R-11)

**Filters:**

- never pressed
- frustrated (rage or dead clicks)
- board GAP
- no `data-ctl` yet
- page, role and viewport

**The control dossier** has five parts:

- **What it is:** label, description, where on the board, where in the code
- **What it runs:** each action and its outcome IDs
- **Live:** taps per day; split by role, platform and viewport; the path people
  take to it (the step before, from the sessions)
- **Frustration:** the elements around it that get dead clicks
- **The board:** its CLICKABLES row and note

| Code | Label | Does |
| --- | --- | --- |
| BR-0301 | Control row | Opens the dossier |
| BR-0302 | Filter chips | Never pressed · frustrated · GAP · unlabelled |
| BR-0303 | Action chip | Opens B04 |
| BR-0304 | Code link | Opens the file at the live SHA |
| BR-0305 | Board note | Opens the CLICKABLES section |
| BR-0306 | Context pack | To B13 |

### B04 Actions (`/admin/clubhouse/actions`, `/[act]`)

**The question:** "When someone presses it, does the thing actually happen?"

**The table** has the 225 actions. Columns:

- page
- label
- tries
- success, failure, offline and stopped-waiting rates
- retries, and how many a retry rescued
- p50 and p95
- the server action
- R-03, R-04 and R-05 flags

**The action dossier:**

```text
ACT-P007-SEND-MESSAGE · Send a message · P007
 tapped 1,204 → in flight 1,204 → ✓ 1,096 (91%) │ ✗ 70603 41 │ offline 52 │ busy 15
                                 retried 38 → ✓ 31 rescued
 wiring  MessagesView.tsx#Composer → api.send → actions/messages.ts#sendGolfMessage
 tables  golf_messages (RLS: golf_messages_insert_member), golf_conversation_members
 why ✗   42501 ×29 (RLS) · network ×8 · 23505 ×4
 p95     iOS app 2.4s · Safari 1.1s · desktop 0.6s
```

The dossier has:

- **the funnel**
- **outcomes:** each outcome ID from the action map with its live count. A
  listed outcome that never fires is shown, and an unlisted one that does fire
  is a drift row.
- **wiring:** component, handler, server action, tables, and the policy names
  from the migrations
- **why it failed:** grouped by server code and by the server half from E9
- **timing:** a histogram by platform

| Code | Label | Does |
| --- | --- | --- |
| BR-0401 | Action row | Opens the dossier |
| BR-0402 | Sort | Failure % · p95 · volume · rescued |
| BR-0403 | Funnel segment | Opens that outcome's code |
| BR-0404 | Wiring link | GitHub at the live SHA |
| BR-0405 | Failure reason | Opens B06 filtered to it |
| BR-0406 | Sessions | Opens B07 filtered to sessions that hit it |
| BR-0407 | Context pack | To B13 |

### B05 Codes (`/admin/clubhouse/codes`, `/[bridgeId]`)

**The question:** "Everything about one number."

**The explorer** holds all 1,988 IDs plus the unregistered ones, as one virtual
table. Columns:

- ID and CH code
- page
- category (with its legend dot)
- name and meaning
- status
- fired in scope
- first seen and last seen
- tests
- "marked expected"

Search covers codes, meanings, the exact words the coach sees, files and tests.

**The code dossier:**

| Block | Content |
| --- | --- |
| Header | `70603 · CH-7004` · P007 Messages · 06 Server / system error · implemented |
| The contract | The catalog row: **When** "Sending a message throws" · **They see** "Couldn't send the message" + "It is in the thread, marked Not sent. Retry from there." · **How** `api.send` · **Test** `messages.test › CH-7004`. Plus any category exception and its why. |
| Where it lives | file#symbol (or the code index), tests, the actions that end in it, the controls that start those actions |
| Live | Count, users and teams; split by role, platform, release and viewport; a 30-day chart with release markers; first seen and last seen |
| Who | The latest 25: person, team, time, route, release, server code, duration. Each opens B07. |
| Why | Fingerprints with their stacks, the top server codes, a typical trail (the last 12 steps before it), the Sentry and replay links |
| Neighbours | Co-occurrence: what else fires in the same session within 10 s. The success/failure balance of the same action. |
| Changes | Releases and PRs that touched its files, the change logs that mention it, held plans on the page |

| Code | Label | Does |
| --- | --- | --- |
| BR-0501 | Code row | Opens the dossier |
| BR-0502 | Filters | Page · category · status · seen · expected |
| BR-0503 | Search | Codes, meanings, exact words, files |
| BR-0504 | Occurrence row | Opens B07 |
| BR-0505 | Sentry · Replay | Out to Sentry |
| BR-0506 | Mark expected… | A note on why this firing is normal; R-01 and R-02 skip it; stored with who and when |
| BR-0507 | Watch | Pins it to Pulse and the digest |
| BR-0508 | Force this state | The preview link (D6) |
| BR-0509 | Context pack | To B13 |
| BR-0510 | Copy | The dossier as Markdown |

### B06 Incidents (`/admin/errors`; URL and `/[fp]` unchanged)

**The question:** "What's broken, grouped by cause?"

**Kept:**

- the lens rail and the sources view
- the classification
- resolve and bulk resolve
- the archive and the release watch

**Added:**

- columns for the page chip, ID chips, action and platform, each one a filter
- three panels on the detail page:
  - **Contract:** the dossier's contract for each code in the incident
  - **Blast radius:** people, teams, roles and sessions, and how many a retry
    rescued
  - **Pack:** a context pack for B13

The Loop view and SelfHealFlow move under "More views". The jobs behind them
keep running unscoped (`bridge-scope.ts`).

| Code | Label | Does |
| --- | --- | --- |
| BR-0601 | Filter chips | Page · code · action · platform |
| BR-0602 | ID chip | Opens B05 |
| BR-0603 | People count | Opens B07 filtered |
| BR-0604 | Resolve / Reopen | As now, now numbered |
| BR-0605 | Send to Duet | A pack to B13 |
| BR-0606 | Copy report | As now, now with codes |

### B07 Sessions (`/admin/clubhouse/sessions`, `/[id]`)

**The question:** "What exactly did this person see, in order?"

```text
Cole Hart · player · Pine Valley · iOS app · a1b2c3d · 14:02–14:19 · 2 failures
P002 Home  ●──●───●
P007 Msgs        ●─●─◆─✗────↻─✗────●             ✗ 70603 "Couldn't send the message"
P011 Rounds                              ●──●──●     42501 golf_messages · trail ▸
           14:02     14:06     14:10     14:14    [Replay ▸ 14:08:31]
```

- **The index:** sessions with a failure first. Columns: person, role, team,
  platform, release, length, pages, failures, frustration.
- **The timeline:** one lane per page. Marks in category colours: views, taps
  (with their control), actions and outcomes, toasts (the exact words), empty
  and failed states, crashes, rage and dead clicks, vitals.
- **Clicking a mark** shows its envelope; a failure opens its trail and stack.
- **Beside the timeline:** the Sentry replay at that moment, and the same
  person's other sessions.
- **Banners and hidden controls:** the timeline marks banners as well as toasts.
  A state can be a banner with no toast: on #2586, round entry shows only the
  amber "updated on another device" banner and no longer raises the CH-11902
  toast (`screens/rounds/entry/ports.ts`). A control drawn behind a disclosure
  (Link rounds' "Change") counts as a tap only once it is revealed.

| Code | Label | Does |
| --- | --- | --- |
| BR-0701 | Session row | Opens the timeline |
| BR-0702 | Filters | Failure · role · platform · page · person · release |
| BR-0703 | Mark | Shows its envelope |
| BR-0704 | ID chip | Opens B05 |
| BR-0705 | Replay | Opens Sentry Replay at the moment |
| BR-0706 | Person | Opens B08 |
| BR-0707 | Reproduce | A pack written as reproduction steps (route, role, taps, state link) |

### B08 People and teams (`/admin/clubhouse/people/[userId]`, `/teams/[teamId]`)

**The question:** "How is Clubhouse treating this coach, this player, this
team?"

**A person:**

- role, team, devices and release
- the last 20 sessions
- the codes they hit most
- the actions that failed for them
- their open incidents
- a link to Users & Teams (account) and View as (read-only, existing)

**A team:**

- the people active
- the page wall for that team alone
- the worst codes
- its held features (D-61)
- the stage of its season (from its own calendar)

**Use:** before a call with a coach, or when one team has a bad day that
doesn't show in the totals.

| Code | Label | Does |
| --- | --- | --- |
| BR-0801 | Session row | Opens B07 |
| BR-0802 | Code row | Opens B05 filtered to this person or team |
| BR-0803 | View as | The existing read-only view-as, audited |
| BR-0804 | Account | Opens Users & Teams |
| BR-0805 | Context pack | Everything for this person or team |

### B09 Experience (`/admin/clubhouse/experience`)

**The question:** "Does it feel right on a real phone?"

It has four views:

1. **Vitals:** INP, LCP and CLS p75 per page, platform and release (CH-1954).
2. **Frustration:** rage, dead and slow clicks (CH-1951 to 1953) per control.
   With `data-ctl` (§4.7), a dead click names its button.
3. **Waits:** how long loading states (categories 02 and 03) showed; how often
   `useBusy` drew a skeleton; slow saves (CH-1991).
4. **iOS app vs Safari:** the same numbers, side by side.

Every number is labelled **field data, from real users**. The page says that it
is not the W/S/D lab tiers of `.claude/rules/browsers.md` and does not replace
them.

| Code | Label | Does |
| --- | --- | --- |
| BR-0901 | View rail | Vitals · Frustration · Waits · iOS app vs Safari |
| BR-0902 | Page row | Opens B02, Phone view |
| BR-0903 | Control row | Opens B03 |
| BR-0904 | Compare releases | Two releases side by side |

### B10 Releases (`/admin/clubhouse/releases`, `/[sha]`)

**The question:** "What did this release change for real people?"

For each production release:

- its PRs (Work log)
- the pages whose change logs it carries
- codes **new**, **rising** and **gone**, each against the previous release over
  the same hours after its deploy
- action success and p95 changes
- vital changes
- drift that started in this release

The first 24 hours after a deploy show a release-watch banner on Pulse.

| Code | Label | Does |
| --- | --- | --- |
| BR-1001 | Release row | Opens it |
| BR-1002 | Compare with | Picks the base release |
| BR-1003 | Delta row | Opens B05 or B04 |
| BR-1004 | PR | GitHub |
| BR-1005 | Context pack | A regression pack |

### B11 Drift (`/admin/clubhouse/drift`)

**The question:** "Are the docs still the truth?"

Nine lists, each a number to drive to zero:

| # | List | Found by | Today |
| --- | --- | --- | --- |
| 1 | Codes in the source but not in the registry | code index | **13** (practice plans) |
| 2 | Codes that fired but aren't in the registry | runtime (§4.3) | after Phase A |
| 3 | Deprecated or tombstoned codes still firing | runtime | after Phase A |
| 4 | Reserved codes that fired | runtime | after Phase A |
| 5 | Implemented, never seen in 30 days (split "rare by nature", such as offline and validation, from "should be common") | counters | after Phase A |
| 6 | `where` points at a missing file | build | **6** |
| 7 | Action outcomes that are deprecated, or that fired unlisted | build + runtime | **1** + runtime |
| 8 | Pages without Bridge IDs | build | P017 Practice: 0 IDs, until D12 is decided |
| 9 | Controls with no `data-ctl` | build | after §4.7 |

The **pipe panel** shows:

- ingest per minute and the lag
- rejected envelopes, and why
- the last envelope per page
- the kill-switch state
- R-08 and R-09

| Code | Label | Does |
| --- | --- | --- |
| BR-1101 | List tab | Switches list |
| BR-1102 | Row | Opens the code, the file or the page |
| BR-1103 | Export | Markdown or JSON, for Duet |
| BR-1104 | Pipe panel | Opens it |

### B12 Readiness (`/admin/clubhouse/readiness`)

**The question:** "How finished is Clubhouse, by its own rules?"

It is one grid. Rows are the 17 pages. Columns are:

- the 7 manifest gates
- the PROGRESS gates
- categories answered out of 25
- IDs on an element
- controls numbered and labelled (from the clickable map)
- held plans
- open audit findings by severity (`F-` rows), with the latest scorecard grade
- GO-LIVE runbook migrations applied, from `information_schema` (read-only)

Each cell links to its evidence.

**Two more views:**

- **Findings:** every `F-` finding from `docs/clubhouse/audit/*/findings.jsonl`.
  Columns: severity, page, screen, role, tier, dimension, standard, effort and
  status. Each opens its observed, expected, repro, fix and files.
  - A finding links to the codes and controls in its files.
  - When it is fixed, the Bridge checks the fix in production: the code it names
    stopped firing, or the control it names stopped drawing dead clicks.
- **Number truth:** the 13 Nov "numbers against staging" checks (8 pages),
  turned into **nightly read-only checks against production**.
  - Each figure Clubhouse shows (for example "6 tasks overdue") is compared with
    the same SQL the audit used, for a sample of teams.
  - A mismatch is a finding with the page, team and query. This catches a wrong
    number before a coach does, which no error log can.

| Code | Label | Does |
| --- | --- | --- |
| BR-1201 | Page row | Opens B02, Contract view |
| BR-1202 | Gate cell | Opens its evidence |
| BR-1203 | Held plan | Opens the plan |
| BR-1204 | Migration | Shows whether it is applied |
| BR-1205 | View rail | Grid · Findings · Number truth |
| BR-1206 | Finding row | Opens the finding (observed, expected, repro, fix, files) |
| BR-1207 | Finding → pack | Sends the finding to B13 as a pack |
| BR-1208 | Number check row | Shows the query, the shown and expected values, and the team |

### B13 Duet desk (`/admin/clubhouse/duet`)

**The question:** "What does Claude Duet need, in one paste?" (No fix loop runs
here.)

The desk has:

- **a queue of packs:** new, sent, waiting for a release, confirmed fixed,
  regressed
- **a preview of each pack**
- **after each release, automatic verification:** the pack's target code stopped
  firing (fixed), or kept firing (regressed)

| Code | Label | Does |
| --- | --- | --- |
| BR-1301 | Pack row | Opens the preview |
| BR-1302 | Copy pack | To the clipboard |
| BR-1303 | Download | `.md` with a JSON block |
| BR-1304 | Mark sent | Status: sent |
| BR-1305 | Verify after release | Sets the expected change; B10 decides it |
| BR-1306 | Archive | Takes it off the queue |

See §9 for the pack and the read-only API.

### B14 Command palette, and B15 shell and toasts

- **B14:**
  - `BR-1401` open (⌘K)
  - `-02` result
  - `-03` jump by code
  - `-04` by person
  - `-05` by SHA
  - `-06` build pack
- **B15:**
  - `BR-1501` rail item
  - `-02` section fold
  - `-03` scope bar
  - `-04` refresh
  - `-05` pause live
  - `-06` view-as banner exit
  - `-07` phone More
- **B15 toasts:**
  - `-20` resolved
  - `-21` resolve failed
  - `-22` copied
  - `-23` pack queued
  - `-24` marked expected
  - `-25` data stale
  - `-26` pipe silent

---

## 9. Claude Duet: the context pack and a read-only door

### 9.1 The pack

The pack is Markdown with one JSON block (`bridge-pack/v1`). It has seven parts:

1. **The ask:** what the pack is about (code, action, control, incident,
   session, release or page) and the question.
2. **The contract:** the catalog rows (When, They see, How, Test) for every ID
   involved; the action-map rows; the controls; the categories and any
   exception.
3. **The evidence:**
   - counts and their split
   - 3 representative envelopes, with trails
   - grouped stacks
   - server codes and the server half from E9
   - first seen and last seen
   - the release it started in
   - Sentry and replay links
4. **The code:**
   - file#symbol, or code-index paths, at the live SHA
   - the tests to run (`npm run test:file -- …`)
   - server actions, tables and RLS policy names
5. **What to read:**
   - the page's CONTRACT.md, WIRING.md and catalog section
   - the newest page change logs
   - held plans
   - matching `memory/incidents/` notes
   - `.claude/rules/clubhouse.md`
6. **How to reproduce:**
   - route and role
   - the preview `?state=` that forces it
   - the session's taps written as steps
   - the browser tier (W first, per browsers.md)
7. **Done means:**
   - the code that should stop (or start) firing
   - the test that should force it
   - `clubhouse:check` green
   - the drift lists it should shrink

The Bridge then checks it after the next release (BR-1305).

People's data is reduced to role, team and pseudonymous ids unless you choose
"include names" (D7).

### 9.2 A read-only door for Duet (owner decision D9)

`GET /api/admin/bridge/v1/{packs|codes|actions|controls|sessions|drift}`
lets Claude Duet pull a pack, or ask its own follow-up ("other sessions with
70603 on iOS since c3d"), instead of you pasting.

The rules:

- it uses a separate, server-only token held by Duet
- it is read-only, rate-limited and audited to `audit_log`
- it returns pseudonymous people by default
- it is off until you add the token

An MCP wrapper over the same routes is a small follow-up.

---

## 10. The daily digest and alerts

**The existing daily digest** (`src/lib/admin/` transport, you only) gets a
Clubhouse section:

- the page wall in words
- R-01 to R-07 hits from the last 24 hours, by code
- the release delta
- drift counts
- packs waiting on verification

**The badges:** Pulse's nav badge counts high and critical rule hits, not raw
errors.

**Push alerts:** only R-09 (pipe silent) and R-02 (new failure after release,
5 or more users) push, and only if you turn it on (D10).

---

## 11. What happens to today's 19 tabs

| Tab today | After |
| --- | --- |
| Overview | Becomes B01 Pulse (Clubhouse first). The cross-sport pieces move to Health. |
| Incidents | B06, enriched. URL unchanged. |
| Health, Jobs & Integrity, Database, Flight Recorder, Teams pulse | Unchanged, under Platform. |
| Users & Teams, Activity, Utilization | Unchanged, under Customers. B08 links to them. |
| Golf | Under More. Its incident panel already shows Clubhouse only. |
| Baseball, Lift Lab | Under More, unchanged. |
| Deploys & Infra, Releases (flags), Auth, Work log | Unchanged, under Platform. B10 reads the Work log. |
| Engineering OS, Ben + Leah | Under More, unchanged. Ben + Leah reports gain a "find their session" link to B07. |

Nothing is deleted, and every URL and shortcut still works.

---

## 12. Delivery: four large PRs

Each PR is built as a draft, with the local gates as the inner loop.
**Nothing is deployed, preview included, unless you say so.** PRs 2 and 3 are
built in their own worktrees, in parallel with PR 1, against a seeded fixture.

| PR | What's in it | Done when |
| --- | --- | --- |
| **0. Base (done)** | P017 Practice, `CLUBHOUSE_CLICKABLE_MAP.md`, `clickable-map.mjs`, and each screen's coach/player/shared/signed-out label | Landed on `main` with #2588 (`4d4cb8caf5`), which carried #2578 |
| **1. Spine + graph** | §3 graph in `registry.mjs`, including audit findings and number checks; §4.6 code index and checks; fixes for the six `where` paths and the deprecated outcome; P017 Bridge IDs as D12 decides; emitters E1–E9; `/api/ch/signal` with redaction, limiter and kill switch; §4.3 runtime checks; §4.5 migration; §5 rules with fixtures; manifests `bridge: wired`; D-68 noted in PROGRESS | Unit tests offline for envelope, resolver, rules and redaction. `clubhouse:check` green with the new checks. `test:rls`. `build`. W-tier: a forced CH-7004 lands one `admin_events` row with `bridge_id 70603`, and a forced empty state adds one counter. Migration on local Docker; db-migration and security reviews. Then the migration waits for you in the rollout thread. |
| **2. Registry screens** | B02, B03 (plus §4.7 control numbering for all pages), B04, B05, B12, B14 palette, the scope bar, the category legend, chips. Each works with no live data ("No signal yet", BR-xx93). | Page tests for every BR code; `admin-gate-coverage` (`requireSuperAdmin` on every entry); Safari pass on desktop and phone |
| **3. Live lenses** | B01 Pulse, B06 additions, B07, B08, B09, B10, the digest section | The same tests, plus seeded-fixture tests per rule and per screen |
| **4. Drift, Duet, numbering** | B11, B13, the §9.2 read-only API (off by default), config/bridge/contracts.json (new) + BRIDGE_UI_MAP.md (new), category 25 rows, the rail regrouping, docs (DECISIONS, a Bridge feature doc, registry docs) | Full gates once; `verifier` agent on the done claim |

**PR 1 as built (draft #2611, 2026-11-24):**

- Done: the graph, the code index and its checks, the six `where` paths, P017,
  the envelope, the resolver and the 12 rules, the route, the held migration,
  and emitters E1 to E4 and E6 to E8.
- Moved: E5 and E9 to PR 3. The manifests stay `bridge: reserved`: the
  registry has no `wired` value, and D-68 says they move when signals reach
  the Bridge, which is once the migration is applied and the flag is on.
- Waiting on the owner: applying the migration, and the W-tier check (a forced
  CH-7004 landing one row with `bridge_id 70603`), which needs it.

**PR 2 as built (branch `bridge/pr2-registry`, 2026-11-25):**

- Done: B02 to B05 and B12 with their dossiers, the scope bar, the category
  legend and chips, the ⌘K graph search (`/api/admin/clubhouse/search`), the
  BR- codes (`br-codes.ts`), the Clubhouse rail section (D3), and all 1,784
  controls numbered `CTL-P###-NNN` with ledgers in `config/clubhouse/controls/`.
- Changed: the screens take Shift+H, I, J, C and M, because the §7.1 letters
  are retired shortcuts still in use.

**PR 4 as built (branch `bridge/pr4-drift-duet`, 2026-11-25):**

- Done: B11 Drift (the nine lists, plus the §4.3 and §4.7 lists), B13 Duet desk
  and the §9.1 pack with pluggable live sources, the "Context pack" controls on
  B02 to B05 and ⌘K `>pack`, the §9.2 door, `config/bridge/contracts.json` with
  the generated `docs/bridge/generated/BRIDGE_UI_MAP.md` (checked by
  `clubhouse:check`), category 25 rows for all 17 pages, and the docs.
- Changed: the door's routes are `/api/admin/clubhouse/duet/{packs,drift}`, not
  `/api/admin/bridge/v1/…`; codes, actions and controls come through `packs`,
  and sessions wait for PR 3. Its switch is `BRIDGE_DUET_TOKEN`. Drift is
  Shift+N; Duet desk has no key (D and Q are retired shortcuts). The rail
  regrouping had already landed in PR 2.
- Drift today: lists 1, 6, 7 (build half), 8 and 9 are zero and held by
  `clubhouse:check`. Lists 2 to 5, the run-time half of 7 and the wrong-page
  list wait for signals. The §4.7 list (controls with neither an action nor a
  link) is not zero and is not gated.
- Waiting on the owner: the migration (for the run-time lists, the incidents
  evidence and the B13 queue) and the Duet token.

---

## 13. How we'll know it worked

| Measure | Target |
| --- | --- |
| From a coach's complaint to the evidence on screen | under 1 minute (⌘K → person → session) |
| Implemented IDs seen at least once in 30 days, or marked "rare by nature" | 100% classified |
| Drift lists 1, 6, 7, 8 and 9 | zero, and held there by `clubhouse:check` |
| Controls with `data-ctl` | 100% of pressable elements |
| Duet packs confirmed fixed by the next release | tracked on B13 from the first pack |
| Signal pipe uptime in active hours | R-09 never fires unnoticed |

---

## 14. Risks and how they are handled

| Risk | Handled by |
| --- | --- |
| Logging slows a tap | No await on the hot path, batched sendBeacon, try/catch, the kill switch; an E2 test asserts `run` resolves before the flush |
| Load on the production database | Counters instead of rows; failure rows capped by the limiter; 14- and 30-day retention on session data; indexes on the new columns only |
| Personal data, including minors' | Super-admin only; the same redaction as `/api/log-error`; sessions store user ids only, with names read live (D7); packs pseudonymous by default; session events kept 14 days; security review |
| The graph and the running release disagree | One graph per SHA; events read against their own release's graph |
| A false "all clear" | R-08 and R-09, plus the `xx93` state on every screen |
| 92 `data-ctl` today, 666+ controls | PR 2 numbers them page by page, seeded from CLICKABLES; the check only blocks new unlabelled controls until the count is done |

---

## 15. Your decisions

**Locked on 2026-11-24, on your yes:** every default stands except D7, where
sessions keep user ids only and names are read live. D8 and D12 are done.

| # | Question | Decided |
| --- | --- | --- |
| D1 | Storage as in §4.5: new columns on `admin_events` plus five small tables | **Yes** |
| D2 | Count every success, empty state and tap (not sampled) | **Yes.** "Never seen" needs it. |
| D3 | Lead the rail with Clubhouse; Golf (legacy), Baseball and Lift Lab under More | **Yes**, URLs and keys unchanged |
| D4 | `BR-` codes on the Bridge's own controls; category 25 rows per page | **Yes** |
| D5 | The self-heal views go under More views, and their jobs keep running | **Yes**, nothing deleted |
| D6 | "Force this state" opens the preview app from the Bridge | **Yes, if `/clubhouse-preview` is served in production** (PR 2 checks); otherwise the button is labelled "local" |
| D7 | Names and emails in sessions, inside the Bridge | **Changed: user ids only.** `clubhouse_sessions` and `clubhouse_session_events` store no name or email; the Bridge reads names live from `profiles` when you open a session or person (you only, super-admin). Packs stay pseudonymous unless you tick "include names". |
| D8 | Land #2578 (Practice as P017, the clickable map) before this work starts | **Done.** It landed with #2588 on 2026-11-18. |
| D9 | The read-only API for Duet | **Built, off until you add its token** |
| D10 | Push alerts for R-09 and R-02 | **Off.** The digest only, until you ask. |
| D12 | Practice's codes: give P017 its own catalog block (registering the 25 `CH-17xxx` codes the code already writes), or keep them under P013 as `CH-1308x` and rename the code's codes | **A P017 block. Done** on `bridge/pr1-spine`: `catalog/practice.md` and Bridge IDs 170501–172301. |
| D11 | Number the controls (`CTL-`), and block new unlabelled buttons in `clubhouse:check` | **Yes** |

---

## 16. Not in this plan

- running any fix loop (Claude Duet does that)
- the CRM
- Clubhouse styling inside the Bridge
- redesigning Baseball and Lift Lab
- lab screenshots and audit runs (`.helm/` is local; the Bridge links VERIFY
  rows and docs, not images)
