# Handoff — GolfHelm mobile UI/UX audit (AUDIT phase complete)

**Coordinator:** A00 · **Workspace:** `~/worktrees/helmv3/mobile-ui-audit` · **Branch:** `agent/mobile-ui-audit`
**Baseline:** `3c90f9f174ac103af5fafc600aebecd98243decc` (current `origin/main` at start)
**Status:** AUDIT complete. **No source file was modified.** Nothing is designed, implemented,
tested, device-verified, visually approved, release-ready, or released — those are eight separate
words per the plan's §18 and only the first one applies.

---

## 1. What was run, and what was not

Executed the plan's twelve-lane audit, scoped to mobile UI/UX, with **eleven** read-only Sonnet
lanes: A01–A09, A11, A12.

**Deliberately not run:**
- **A10** (database invariants, RLS, grants, migrations) — not UI/UX, and DB work is governed
  separately in this repo. Everything needing schema truth is filed `BLOCKED` with A10 named.
- **Messaging** — a separate session and worktree own the Messages tab. Lanes recorded messaging
  observations as referrals and proposed no messaging repairs.
- **A11 was scoped** to render/interaction responsiveness and recurring-work ownership; server and
  query cost belong to A10.

**Evidence discipline.** No device, no simulator, no release build, no profiler, no screenshots, no
authenticated fixtures, no database. So `OBSERVED` and `REPRODUCED` were **forbidden labels** for
this phase, and no lane used them. All 95 findings are `SOURCE`, `RISK`, `PROPOSAL`, or `NOT_RUN`.
A `NOT_RUN` never means passed.

---

## 2. Where everything is

```
premium-audit/
  findings.jsonl              ← CANONICAL consolidated register, 95 records, severity-sorted
  BLOCKERS.md                 ← open decisions for the owner, hard blockers, unresolved confusions
  HANDOFF.md                  ← this file
  baseline.json               ← pinned SHA, environment, and an explicit unavailable-capabilities list
  decisions.md                ← A00 decisions D1–D6 (scope, labels, leases)
  ownership.json              ← the read-phase write lease
  WORKER_BRIEF.md             ← the brief every lane was given
  verification/
    emitted-css-check.md      ← A00's Tailwind compile that refuted A03-003
  narratives/                 ← A00-captured reports for lanes whose report.md write was refused
    A05.md A06.md A09.md A11.md
  lanes/A01..A12/
    findings.jsonl            ← per-lane records (A05 stops at A05-014 — see §5)
    report.md | report.txt    ← where the lane could write one
```

**Consume `premium-audit/findings.jsonl`, not the per-lane files.** It is the only place that
contains A05-015 and the A03-003 override.

---

## 3. The register

95 findings. Effective severity after coordinator override: **3 P0 · 31 P1 · 33 P2 · 28 P3.**

| Lane | Scope | n |
|---|---|---|
| A01 | native shell, launch, keyboard, haptics | 9 |
| A02 | app state, navigation, recovery, caching | 7 |
| A03 | design system, materials, component craft | 11 |
| A04 | Home and Rounds library | 9 |
| A05 | round setup, live entry, durability, completion | 15 |
| A06 | Stats, CoachHelm, metric provenance | 8 |
| A07 | Calendar, event actions, timezone | 9 |
| A08 | invitations, auth, account lifecycle | 5 |
| A09 | attention, notifications, badges | 9 |
| A11 | responsiveness, recurring work, observability | 8 |
| A12 | accessibility, adversarial, verification | 5 |

### The three P0s

**A02-001 — a dirty form can be destroyed by a transport blip.** Four uncoordinated global reload
mechanisms mount together in the root layout. A bare `"load failed"` triggers a full
`location.replace` with **no unsaved-work guard**, and the chunk handler wipes the reload budget on
every successful hydration, so a repeating failure regains full budget each cycle. A11-002 adds the
precise race: two of those paths match overlapping stale-server-action text under **different guard
keys**, and `error-logging.ts:499-506` contains a comment stating the exact "one source of truth"
invariant the file beside it violates. Confirms G01+G02. Owner A02.

**A05-008 / A05-015 — invalid round data admitted by two gates, invisible everywhere after.** An
incomplete cloud tee pads holes to `par 4 / yardage 0` and the "usable config" gate checks only
`par > 0`, which the padding always satisfies. A second, weaker gate on the quick-pick path uses
`.some(h => h.yardage > 0)` rather than `.every`. **Nothing downstream flags the result**: the
scorecard header renders "0 yds" as unstyled fact, the aria-label says "0 yards" with no anomaly
framing, and the progress math substitutes `|| 1` so the hole silently behaves as a 1-yard hole.
Zero yardage references in any completion or summary sheet. Owner A05.

**A01-001 / A08-001 — native URL classification, both directions wrong.** The classifier is an
unanchored `url.contains("/golf/")` with **no host or origin check**. It wrongly *rejects* real
destinations — A01 traced the super-admin post-login redirect to `/admin` and live Baseball invite
links to `/baseball/join/<code>`, both under GolfHelm's own AASA entry, both hard-bounced to
`/golf/login`. It also wrongly *accepts* any off-origin URL containing that substring. Confirms G24,
materially worse than the seed framed it. Owner A01, shared lead A01/A08. **Cross-product blast
radius: any fix needs Baseball and admin-console smoke tests in its negative tests.**

### Cheapest high-visibility win, unrelated to the P0s

**A03-001 (P1)** — the root layout mounts the legacy sonner Toaster, not Fairway's `ToastStack`.
`fairwayToast()` is called from ~16 production files and dispatches into sonner's global store, so
the crafted toast — tone icons, warm glass, and the documented bottom-nav safe-area fix — has never
reached a user. The fix is which component the root layout mounts.

---

## 4. Independent verification (A12)

A12 re-derived five high-severity claims from source rather than trusting the reporting lane. **All
five CONFIRMED** at exact line numbers: A02-001, A05-008, A05-015, A01-001, A06-002.

A12's own contribution is the part that changes scheduling: **the T01–T28 fault matrix has 6 tests
adequately covered, 2 partial, and 20 weak or uncovered** — 9 of those 20 being blocking gaps in a
required job rather than silent green skips. Specifically, **A02-001's P0 mechanism has misleading
or absent regression tests**: the one existing test file tests an unrelated field-name concern, and
two of the four mechanisms have no test file at all. A regression restoring the exact P0 would pass
every existing suite.

Also worth carrying forward: axe coverage exists for 8 files, **all** under admin/CRM — **zero** for
the mobile player and coach surfaces this entire program is about.

---

## 5. Two register defects the next owner must know

**A05-015 was not in any lane file.** A05 found the second skip gate after writing its
`findings.jsonl`; it lived only in prose until A12 caught it. A00 added it to the consolidated
register with a `_coordinator_note`; `lanes/A05/findings.jsonl` is untouched and still stops at
A05-014. The general failure mode — a late discovery never reaching the register — applies to
anything else found after a lane closed its file.

**A03-003 is refuted and carries a coordinator override.** A03 filed it P1/BLOCKED: 133+ form sites
use `/NN` alpha shorthand over `color-mix()` token vars, with the repo contradicting itself about
whether that compiles. A00 compiled it — **it works**, 7/7 probe utilities emitted valid rules
(`verification/emitted-css-check.md`). Effective severity P3, and the remaining work is deleting the
stale `segmented.tsx` comment before someone "fixes" working code on its authority. The record keeps
A03's original severity in `severity` and the override in `_coordinator_override`, so nothing was
silently rewritten. **What this does not prove: emitted is not rendered.** Contrast, per-theme
variable definition, and `color-mix()` support across the supported WebView range are still browser
checks.

---

## 6. Before any repair starts

Read **`BLOCKERS.md`** first. It carries 11 owner decisions (D1–D11), the hard capability blockers,
and the unresolved tooling confusions. Three items gate scheduling specifically:

1. **Writer budget.** `git worktree list` shows 6 checkouts against a default cap of 3 mutation
   workspaces. The audit consumed none. Do not raise `HELM_MAX_MUTATION_WORKTREES` to fit the plan,
   and do not park another session's worktree to make room — that is the owner's call.
2. **Three contested chokepoints** need ownership settled before code is written:
   `CoachHelmShell.tsx`'s padding owner (~15 mounts; A06 vs A03), `StageRouter.tsx` (A02 owns it;
   A06 and A12 both want changes), and the root layout recovery stack (A02, A03 and A11 all have
   findings inside it).
3. **Messaging shares the same global writer budget** and must sign off on shared-shell changes —
   the root layout Toaster mount, `Sheet.tsx`, badge formatting, and global CSS all qualify.

The repair phase is **not authorized by this audit**. Each repair needs a coordinator-approved packet
with an exact file list, per the plan's §14.

---

## 7. Contracts the lanes asked to be frozen

| Contract | Requested by | What they need in it |
|---|---|---|
| C01 release identity | A11 | a field recording *which* reload mechanism fired, so A11-002's two paths can be reconciled |
| C02 scoped read | A02 (author), A04, A06 | one canonical request-generation/cancellation idiom, so five adapters stop reinventing it |
| C03 durable operation | A05 | a real per-hole persisted-state signal distinct from optimistic UI state |
| C04 view/return state | A02 (author), A04 | return anchor and filter restoration |
| C06 feedback | A01, A05, A09 | one haptic owner; an explicit foreground-vs-background push presentation rule |
| C07 metric provenance | A06 | a per-metric sample/denominator distinct from a rounds count, plus a validity timestamp |
| C08 material/control | A03 (author), A06, A12 | single padding owner; a control contract a hand-rolled widget cannot silently opt out of |
| C09 recovery | A02 (author), A12 | one testable recovery-decision surface instead of four independent scripts |
| C10 attention | A09 | an exact set + clearing action per count; whether composite badges decompose |

A02 drafted C02/C04/C09 against existing infrastructure, and A03 produced the visual transformation
contract, token migration map, component inventory, and quality-lab spec. Those drafts are in
`lanes/A02/report.md` and `lanes/A03/report.md`.

---

## 8. Section 12 seed verdicts

Do not treat the plan's seed list as a to-do — it was written against a baseline five commits older,
and three entries did not survive contact:

- **Already fixed:** G11 (9/18 reseed, commit `d0a4a4724` / #1732), G13 + UX14 (prediction units).
- **Refuted as framed:** G09 (keyboard/resize), A03-003 (alpha shorthand, refuted by A00's compile).
- **Confirmed still present:** G01, G02, G05, G10, G12, G15, G16, G17, G18, G19, G20, G21, G22, G24
  (materially worse than framed), G25 (expanded — the missing visibility pause was not in the seed).
- **NOT_RUN:** G26, G27, G28, G29 (partly), G30 — all need a device, fixtures, or a database.

Two seed concerns were verified **not** to be problems and should not be re-flagged: unfinished-round
resume is correctly id-scoped, and Coach Home is a genuinely distinct composition rather than the
player layout with a team name substituted.

---

## 9. Honest statement of what this audit is worth

It is a source audit. Every finding cites a file and line at a pinned SHA, and A12 independently
re-derived the most severe ones. That is real, and it is the strongest evidence obtainable without a
device.

It is **not** proof that any of this reproduces on your phone. The audit never ran the app, never
signed in, never read the database, and never rendered a pixel. The production binary may differ
from this SHA — 13 commits sit merged but unshipped, and merging does not deploy. Every claim about
what a user *sees* is an inference from source, and the NOT_RUN ledgers in each lane name exactly
which dependency would settle it.
