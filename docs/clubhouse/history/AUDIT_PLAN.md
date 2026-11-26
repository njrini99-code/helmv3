# Clubhouse swap audit: execution plan

The plan for running the owner's audit
(`GolfHelm_Clubhouse_Complete_Swap_Audit.md`) end to end against the
released code. Findings go to `SWAP_AUDIT.md`; fixes go to the CHANGELOG.
The owner chose "fix as I go": each fix lands on `agent/swap-audit` with a
regression test.

## Baselines

- Production: `ef6e017a2` (served, verified by `release:status`), flag off.
- main: `ef6e017a2` (#2110 squash: #2102, #2104, #2108, #2109).
- Candidate: `agent/swap-audit`, branched from main for this audit.
- Preview (flag on, production database): built from `ef6e017a2`.

## Ground rules

- Every runtime test runs on the local Supabase stack with synthetic
  accounts. The launcher refuses any non-local URL or the production
  project, and blanks email, push, Sentry, Stripe and the AI key.
- The app runs as a production build (`next build` + `next start`) with
  `VERCEL_ENV=preview`, so the Clubhouse flag is on. Every journey asserts
  `[data-ui="clubhouse"]`, so a Fairway page can never pass as Clubhouse.
- Laptop safety: build only with Docker off; one app server; one headless
  browser; the guard watches memory, swap and disk; Docker is stopped when
  a phase ends.
- Production: read-only SQL only. No migrations, no flag flips. Held
  migrations stay held (the local stack has them applied; Stats results
  are labelled "on the held-applied schema").
- Evidence labels from audit §2. A skipped check is "Blocked / not
  exercised", never a pass.

## Phase 0: environment (mostly done)

- Done: local stack; one coach, two players, one team; an 18-hole course
  (Audit Links, Blue tee, par 72); the production build pattern; the
  Messages journey (7/7).
- To do: widen the fixtures to the audit §6.2 matrix where it matters for
  the gates:
  - an assistant coach;
  - a second team with its own player (cross-team checks);
  - an inactive player and a player with no team;
  - a 9-hole back-nine tee;
  - a team time zone different from the browser's.
- To do: an oracle client (service role, local only) that reads rows after
  every step.

## Phase 1: runtime journeys, in priority order

### 1. Round preservation (audit §9, the first gate)

- RND golden path, 18 holes, at 390 px:
  - start, then shots and a penalty;
  - save after hole 6, cold reload, continue;
  - edit hole 3, finish, submit;
  - check the review, Stats and the database (status, hole and shot
    counts, score, strokes gained).
- 9-hole back nine: hole labels and per-18 stats.
- Faults:
  - double submit (one completed round);
  - acknowledgement lost (submit, drop the response, retry);
  - offline mid-round, then reconnect: the queue syncs (first runtime
    proof of F-14);
  - discard race (confirmed discard while autosave is in flight);
  - exit paths: Keep playing; Discard then Cancel;
  - a device-only round after a failed submit: reproduce F-02, which
    feeds the owner's recover-route decision.
- Qualifier round: slot assignment and identity kept at submission.

### 2. Stats (audit §10)

- Feed the oracle from the rounds above plus two or three more through
  the real submit path.
- Check each §10.3 fixture by hand: per-18 mean with a 9-hole round,
  pooled FIR and GIR, putt make with its denominator, the no-data bucket,
  a real zero strokes gained.
- Compare Home, Stats team, Stats player and Round review under the same
  filter; check the filter chips and 9/18/Both.
- Visual truth (§10.4): bars from value, signed strokes-gained bars
  anchored at zero, null different from zero, rounding at display only.

### 3. Calendar (audit §8, the calendar gate)

Run with the browser in Los Angeles and the team in New York.

- The coach creates a recurring practice for selected players, with an
  attachment.
- The player sees it and replies; the coach sees the reply.
- The coach moves one occurrence; the player sees the new time.
- Attendance is marked, then one occurrence is cancelled.
- Week, day, month and agenda views agree; the feed output agrees.
- Also: deep link `?event=`, `?new=1&with=`, Duplicate, double Publish,
  and that a player's direct call to a coach-only action is refused.

### 4. Qualifiers (audit §11)

- A three-round qualifier with linked rounds; duplicate-slot and closure
  checks.
- Tied results at the cut, to reproduce F-03 on real data for Q-104.
- Confirm the squad; the selections are stored once.

### 5. Messages, the rest (audit §12)

Edit, react, delete, an attachment (upload, open, the non-member denied),
mute and unmute, group add and leave, search into older history,
announcement acknowledgement, double send.

### 6. CoachHelm (audit §13)

- Synthetic rounds that should trigger one insight, run through the
  generators locally.
- Check the evidence shown, focus assignment and the player's reply,
  dismiss and undo.
- Read the lifecycle cron thresholds from code; never guess them.

### 7. Shell and routes (audit §7)

- A crawler opens every dashboard `page.tsx` for coach and player, with
  the flag on and off, plus every live notification link. It records
  Clubhouse, NotRebuilt, alias target, Fairway (flag off) or error.
- SH-01 to SH-12 where testable: team switch, back and forward, expired
  session, sign-out.

## Phase 2: visual audit

- Screenshot every Clubhouse screen and state at 390, 430, 924 and 1280
  px: the live local app for data states, `/clubhouse-preview` for
  catalog states.
- Compare with the handoff boards in `design/handoff/` (desktop and
  mobile), a screen at a time.
- Scans: `npm run clubhouse:a11y` (axe), `scripts/clubhouse/native.mjs`
  (tap targets, 16 px inputs, sideways scroll), reduced motion and
  Animations off.
- Chart vocabulary, tokens and doctrine (red for under par, gains green,
  losses amber; no uppercase, no emoji) on every chart, sheet and empty
  state, including round tracking.
- The owner's iPhone pass on the preview, using a checklist made from the
  same list.

## Phase 3: code audit

- Interaction ledger (audit §5.2) from the catalogs, `CLICKABLES.md` and
  the action map. Flag empty handlers, unchecked `result.success`,
  zero-row updates reported as success, swallowed errors and navigation
  before persistence.
- Transitive Fairway imports and `--fw-*` tokens reachable from
  `src/clubhouse`.
- Server-action authorization, RLS and storage for every Clubhouse write:
  a `security-reviewer` subagent.
- Held-migration matrix (audit §16), one row a file: dependency, which
  code uses it, the fallback, old and new client compatibility.
- Flag-off regression slice: the Fairway paths changed by #2104, #2109
  and #2108.

## Phase 4: performance

- Lighthouse on the built app at a phone profile for the five priority
  pages, against the production baseline (Speed Insights RES 69 on the
  current UI).
- Request counts and waterfalls, payload sizes, realtime subscriptions,
  memory after navigation, layout shift.

## Phase 5: report

- Update `SWAP_AUDIT.md`: the scorecard, each finding with its evidence
  label, the blocked list and a readiness verdict per gate.
- Owner decisions, batched: Q-103 (routes to build, alias or retire),
  Q-104 (tie rule), Q-105 (player CoachHelm views), and any new ones.
- One PR from `agent/swap-audit` with the fixes and docs; CI green before
  asking.

## Order and time

1. Fixtures and the oracle (30 min).
2. Round preservation (2 to 3 h).
3. Stats (1 h).
4. Calendar (1 to 1.5 h).
5. Qualifiers (1 h).
6. The rest of Messages (45 min).
7. Shell and routes crawler (45 min).
8. Visual pass (2 h, plus the owner's iPhone pass).
9. Code audit (runs alongside in a subagent).
10. CoachHelm (1.5 h).
11. Performance (45 min).
12. Report.

What needs the owner: the iPhone pass on the preview, the decisions
above, and any merge or deploy that follows.
