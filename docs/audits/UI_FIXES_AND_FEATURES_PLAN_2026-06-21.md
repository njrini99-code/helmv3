# Plan — UI fixes + features (2026-06-21 evening)

Captures everything from this session: the brand-color regression, the screenshot
bugs, the tab/text overflow, the remaining worth-doing CSV items, and three new
features (development stat targeting, qualifier per-round courses, editable
shot-tracking course screen). Source screenshots live on the user's Desktop
(`Screenshot 2026-06-21 at *.png`).

Legend: **DO NOW** = clear, code-only, shipping this pass · **FEATURE** = needs a
migration + larger build.

---

## A. Brand color regression — "buttons are hunter green, not the light green"  · DO NOW
**Root cause (confirmed):** `src/components/fairway/controls/button.tsx` primary +
`IconButton` primary use `bg-accent-700` (`oklch(0.488 0.124 150)` — a deep/hunter
green). This was the P415 WCAG fix (cream-on-`accent-500` is ~3.0:1). The brand
green is `accent-500` = #16A34A ("locked" in `design-tokens.css`), which is what
the user wants and what `CLAUDE.md` documents as the button color.
**Fix:** primary fill → `bg-accent-500`, hover → `bg-accent-600` (was 700/800), on
both `Button` and `IconButton`. Keep cream text. This is an intentional brand
decision (brand #16A34A > strict 4.5:1 on the CTA; the bold ≥14px label meets the
3:1 UI-component/large-text bar). Document the tradeoff in the code comment so a
future a11y pass doesn't silently re-darken it. Audit other text-bearing
`accent-700` *fills* repo-wide and align.

## B. Screenshot bug — New Message: every player row is a solid green bar · DO NOW
`FairwayNewMessageSheet.tsx` rows are correctly tinted (`hover:bg-surface-sunken`,
selected `bg-accent-50`) — so the green-bar screenshot is the **legacy**
`GolfNewMessageModal` still wired on that surface (bottom drawer, green rows), not
the Fairway sheet. Fix = route the Messages "New message" entry to
`FairwayNewMessageSheet` on the live path (or, if already wired, fix the legacy
modal's row background). Verify on `/golf/dashboard/messages`.

## C. Screenshot bug — Player CoachHelm "Your edge this week" renders a black block · DO NOW
`FairwayPlayerCoachHelm.tsx` — the headline insight card ("Lag putts + 3-putt
cascade") paints as a giant solid-black rectangle on the light canvas. Likely a
dark-themed surface/hardcoded dark bg leaking onto the Fairway light canvas, or a
chart container with no data painting its background. Fix to a light Fairway
`Surface` with honest content/empty state.

## D. Tabs / buttons overflow their text · DO NOW
"Some buttons on tabs don't hold the text — they overfill and look like crap."
Audit `controls/tabs.tsx`, `selectable-pill`, segmented controls and button sizes
for fixed widths / missing `truncate` / no `min-w-0` / no wrap handling. Fix so
labels never overflow the control (truncate w/ title, or size-to-content).

## E. Remaining worth-doing CSV items (verified-real) · DO NOW
- **P089** — Development Plans `loading.tsx` renders the legacy skeleton; author a
  Fairway-shaped skeleton mirroring `PlayersGridView`.
- **P220** — Classes `loading.tsx` legacy skeleton; Fairway-scoped skeleton
  matching the redesigned masthead + readouts + weekly grid.
- **P338** — Course Library website link isn't scheme-normalized; on save, prepend
  `https://` when no scheme, reject obviously-invalid input, guard the render.
(The other 59 undone CSV rows are unverified low-confidence nitpicks — skip.)

---

## F. FEATURE — Development: pick the stat + target value + timeframe
The coach "New focus area" modal already has Measurable target (Target metric +
Current value + Target value). **Missing: the timeframe** ("by date" OR "in N
rounds"). 
- **Migration:** `golf_player_focus_areas` add `target_kind text` ('date'|'rounds'|null),
  `target_date date`, `target_rounds int`. Additive, nullable.
- **UI:** in the focus-area modal, after Target value, a small segmented
  "By date | In rounds" + the matching input. Player + coach surfaces show
  "Target: 28.5 by Apr 12" or "…within 5 rounds" and progress vs it.
- **Save:** extend the create/update focus-area action + types.

## G. FEATURE — Qualifiers: assign a course to each round (coach), reflected player-side
`golf_qualifiers` has a single `course_id`; no per-round structure or rounds count.
- **Migration:** add `golf_qualifiers.num_rounds int` (default 1) + new table
  `golf_qualifier_round_courses(id, qualifier_id, round_number, course_id,
  course_name, tee_id, created_at)` with a UNIQUE(qualifier_id, round_number).
  RLS: coach of the team writes; team members read.
- **Coach UI:** in qualifier create/edit, when num_rounds > 1, a per-round list to
  pick a course (cloud catalog picker) for each round.
- **Player UI:** the qualifier detail shows the assigned course per round.

## H. FEATURE — Shot tracking: editable hole/yardage screen after picking a cloud course
`FairwayHoleConfig.tsx` (a full par/yardage editor) ALREADY exists but isn't shown
when a course is picked from the cloud catalog (the catalog seeds pars/yards and
skips the editor). The user wants the cloud course treated as a **baseline they can
edit before the round**, and the post-pick screen redesigned ("looks like crap").
- Wire `FairwayHoleConfig` into the cloud-course pick flow in `FairwayNewRoundEntry`
  / `FairwayCoursePicker` so after selecting a course the player lands on the
  hole-by-hole screen seeded from the cloud course's tees, fully editable
  (par/yardage per hole), then proceeds to the round.
- Redesign that post-pick screen to Fairway premium (the user called it "crap").
- No schema change (rounds/holes already store per-hole pars/yards); ensure edits
  persist to the round, not the shared catalog.

---

---

## QUALITY WAVE (added 2026-06-21 — cross-surface sloppiness the user flagged)
Runs AFTER the Fixes+Features workflow finishes (the roster work collides with
Feature F's `PlayersGridView` edits, so it must be sequenced, not concurrent).

### Q1. Round-review hole flyovers overlap (screenshot 1.35.25) · QUALITY
`FairwayHoleHero.tsx` (per-hole SVG, viewBox 320×104, wide aspect) is rendered in
the `FairwayRoundDetail` hole grid squished into tall-narrow columns → trees, shot
dots, and per-hole label text collide; dark/garish; no breathing room. Fix the
grid layout + hero aspect/scaling so each hole reads cleanly (right aspect ratio,
spacing, legible labels, no overlap), and calm the green.

### Q2. In-round shot tracking looks unfinished (screenshot 1.33.33) · QUALITY
`FairwayShotTracking.tsx` + `FairwayShotEntry.tsx` + `FairwayScorecardHeader.tsx`:
dark cut-off scoreboard strip clashing with the light body, a floating mid-screen
card, an unclear slider, wasted side margins. Redesign to premium Fairway: cohesive
light surfaces, a legible scorecard header, clear shot-entry hierarchy, full-width
use, consistent with the rest of the app. (Note: `FairwayHoleHero` is shared with
Q1 — do Q1+Q2 in ONE bucket to avoid collisions.)

### Q3. Roster/player rendering is inconsistent across pages · QUALITY
`FairwayPlayerCard.tsx` is the canonical roster card, but CoachHelm
(`PlayersGridView` — own DataTable + "who needs attention" rows), Messages (own
rows), and Qualifiers (own card) each roll their own player treatment. Unify on a
shared player-identity component (avatar + name + class/meta) so a player looks the
SAME everywhere (roster, CoachHelm, messages, qualifiers, dev focus-area picker).
Keep page-specific affordances (attention score, message button) but standardize
the identity block + card chrome.

## Housekeeping (done)
- `.gitignore` now excludes `.design-sync/ .ds-sync/ ds-bundle/ docs/redesign/`
  (the ~58MB of scratch that showed as `+39,028` in the working tree).

## Open PRs / red CI (answer)
Most open PRs are red on the **same infra checks** (Playwright OOM/timeout +
lighthouse-preview flake + the build OOM now fixed on main) — not real failures —
which is why auto-merge never fired. Recommendation: patch/minor Dependabot
(undici/hono/dompurify/dotenv) worth merging for the flagged vulns; **major**
bumps (eslint 9→10, typescript 5→6, tailwind 3→4, vite 7→8) are risky — test
individually. Stale nightly-health-check PRs (#205/#216/#218/#278) → close.
