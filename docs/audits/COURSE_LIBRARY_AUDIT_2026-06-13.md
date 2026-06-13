# GolfHelm Cloud Course Library — System Audit (2026-06-13)

> Produced by a 7-agent parallel audit of the live repo before any implementation.
> Scope: courses, rounds, holes, pars/yards, tees, shot tracking, scorecard, stats,
> saved courses, dedup, RLS, types, migrations. Decision doc for the Cloud Course
> Library build.

---

<!-- AUDIT BODY -->

# GOLFHELM COURSE SYSTEM AUDIT
## System Design for Cloud Course Library + Tee-Set Unification

---

## EXECUTIVE SUMMARY

**Current State:** GolfHelm stores courses across 3 tables — `golf_courses` (global master), `golf_course_holes` (per-hole config), and `golf_player_courses` (player-saved configs with JSON-serialized extended fields). Rounds reference courses by optional FK + mandatory string `course_name`. Tees are stored as free-text `golf_rounds.tees_played`. **No multi-tee-set support exists.** Yardage is snapshot-copied to `golf_holes` at round creation but never validated against course master.

**Key Finding:** Round data is an immutable snapshot (par, yardage, score frozen at submission time). Course edits do NOT retroactively affect historical analytics. This is **correct** for data integrity but creates **identity risk** if courses are de-duplicated/merged without backfilling `golf_rounds.course_name`.

---

## §1: COURSE STORAGE + IDENTITY

**Three tables house course data:**

1. **`golf_courses`** (global master) — `id, name, city, state, country, holes, par, course_rating, slope_rating, created_at`. **No ownership, no RLS.** Shared read-only reference. **No unique constraint** on `(name, city, state)` — duplicates possible.
2. **`golf_course_holes`** (per-hole) — `id, course_id (FK), hole_number, par, yardage, handicap_index`. Unique `(course_id, hole_number)`. One config per hole — **no tee dimension**.
3. **`golf_player_courses`** (PLAYER-saved configs) — `id, player_id (FK), course_id (nullable FK), course_name, relationship, rounds_played, best_score, average_score, last_played_at, notes (JSON), ...`. Extended fields (city/state/rating/slope/**tees text**/holeConfigs[]) live as JSON in `notes`. **Player-owned, not team.** (`src/app/golf/actions/golf.ts:20-48`)

**Usage:** new round → pick saved course (loads `holeConfigs` defaults) OR manual entry → server `resolveCourseId()` fuzzy-matches name → writes `golf_rounds.course_id` (often NULL) + `course_name` (always).

**Dedup risk (HIGH):** analytics group by `golf_rounds.course_name` STRING (`stats-data.ts:1991-2089`), not `course_id`. Merging course rows without backfilling `course_name` splits stats.

## §4: SHOT TRACKING + SNAPSHOT (first-class concern)

Round creation freezes par/yardage into `golf_holes` (`golf.ts:1307`); shots store `round_id + hole_number (+ nullable hole_id)`, distances, lies, putt specifics (`golf_shots`). SG reads `golf_holes.par/yardage` (frozen) → caches into `golf_round_stats_cache`/`golf_player_stats_cache`. **A shot does NOT store course yardage/tee** — it relies on the frozen `golf_holes` row.

**Therefore editing course master later does NOT corrupt old rounds** — the snapshot model already protects history. ✅ (This is the single most important finding: the "rounds must snapshot" requirement is already met.)

## §14: ROUND/COURSE REFERENCE + MULTI-TEE PROBLEM

Round references course by `both` (`course_id` FK + `course_name` text) + free-text `tees_played`. Today's flow **assumes one hole config per course** (`golf.ts:752` single `holeConfigs` array; `new-round-client.tsx:844` skips the hole-config step if the course already has pars) → **cannot represent White vs Blue tees**. Tee is free text with no FK. Qualifiers store course as string, no tee bucketing.

**Fix needs:** a tee-set table with per-tee par/yardage, a `tee_id` FK on rounds, a tee-selector in round entry, and `(course_id, tee_id)` as the round's course reference.

## STATS DEPENDENCY

Almost ZERO analytics read `golf_courses`/`golf_course_holes` — everything keys to `golf_holes` (frozen snapshot) or `golf_rounds.course_name` (string). Best round, GIR%, fairway%, SG all read the frozen snapshot. Course JOIN in round-review is display-only. **Conclusion:** the snapshot model is sound; the only real risk is the `course_name`-string grouping when deduping.

---

# APPENDICES (structured findings)

## A. Round → course reference today
`both` — `golf_rounds.course_id` (nullable FK, often NULL for manual courses) **and**
`golf_rounds.course_name` (free-text string, always set; **all analytics group by this string**).
Tee = free-text `golf_rounds.tees_played` (no FK, no tee-set concept).

## B. What a round must snapshot (ALREADY satisfied today)
Immutable post-submit: `golf_holes.par`, `golf_holes.yardage` (per hole 1-18), `golf_rounds.tees_played`, `golf_rounds.course_rating/course_slope`, `golf_shots.distance_to_hole_before/after`, `golf_shots.lie_before/after`. SG baseline reads frozen `golf_holes` → caches into `golf_round_stats_cache`, never recalculated on master edit. **The new tee-set tables must NOT change how rounds snapshot — rounds keep freezing par/yards into `golf_holes`; the tee tables only feed the DEFAULTS at round-creation time.**

## C. Breaking changes to guard
- Merging/deduping `golf_courses` without backfilling `golf_rounds.course_name` → Best-Round / course filter / teammate stats / CoachHelm patterns split across old+new strings. **Backfill required before any merge.**
- Making `golf_courses.course_id` NOT NULL → ~30-50% of rounds have `course_id=NULL` (manual). Backfill or keep nullable.
- Adding `tee_id` to rounds → existing rounds have only `tees_played` text. Either fuzzy-backfill or accept only new rounds are tee-bucketed.
- Enforcing RLS on `golf_courses` (today global, no RLS) → must design team-saved vs global-cloud split carefully so coaches still read all cloud courses.
- `golf_shots` never stored shot yardage → cannot backfill; only capture going forward.

## D. Proposed tables (golf_ convention; ADDITIVE, non-destructive)
- **`golf_course_tees`** — tee-set master per course: `id, course_id FK, tee_name, normalized_tee_name, tee_color, category, total_yards, total_par, course_rating, slope_rating, holes_count, source, created_by_user_id, created_by_team_id, last_edited_by_user_id, last_edited_by_team_id, last_edited_at, deleted_at, created_at, updated_at`. Unique `(course_id, normalized_tee_name)`.
- **`golf_course_tee_holes`** — per-tee hole: `id, tee_id FK, hole_number, par, yardage, handicap_index, created_at, updated_at`. Unique `(tee_id, hole_number)`.
- **`golf_courses` (modified, additive)** — add `normalized_name`, `slug`, `country`, `address`, `website`, `image_url`, `source`, `created_by_*`, `last_edited_by_*`, `last_edited_at`, `deleted_at`. Add normalized-name unique guard.
- **`golf_team_saved_courses`** — `team_id, course_id, default_tee_id, pinned, last_played_at, times_played, created_at, updated_at`. Unique `(team_id, course_id)`.
- **`golf_rounds` (modified, additive)** — add `tee_id` (nullable FK) + keep `tees_played` text fallback. (Par/yards STILL snapshot into `golf_holes` — unchanged.)
- **`golf_course_edit_history` / `golf_tee_edit_history`** — optional append-only audit (who/when/what). Lightweight; "strongly preferred."
- `golf_player_courses` (existing) → migrate into `golf_team_saved_courses` (player→team) + relational tees; keep readable during transition.

## E. Migration needs
- Non-destructive first: add all new tables + columns; keep `golf_course_holes` + `golf_player_courses` readable.
- Backfill: one `golf_course_tees` ("Default"/"Team Saved Tees") per course from `golf_course_holes`; map `golf_player_courses` → `golf_team_saved_courses` (+ tee from its JSON `holeConfigs`/`tees` text).
- Dedup existing `golf_courses` by normalized key, backfilling `golf_rounds.course_name` to the survivor BEFORE merge (the one risky, analytics-affecting step — do last, validated).
- Old rounds with `tee_id=NULL` keep reading their frozen `golf_holes`. Fully backward compatible.

## F. Dedupe strategy
Normalized course key: `UNIQUE(lower(trim(name)), coalesce(lower(trim(city)),''), coalesce(upper(state),''), country)` + a slug. Normalize "No." / "#" / "Number", punctuation, whitespace, case. Search-before-create; obvious match → route to existing; likely match → confirm; none → create. DB-level normalized unique guard (not just frontend). Tee dedupe: `UNIQUE(course_id, lower(trim(tee_name)))` + warn on near-identical yards/par. (Fuzzy matching beyond normalization left as a clear TODO.)

## G. Installed UI libraries (carousel reuse — no new deps needed)
`framer-motion` v12.40.0 ✅ · Radix primitives (dialog/dropdown/popover/tabs/tooltip/…) ✅ · **embla ❌** · **shadcn ❌** (project uses Radix + Tailwind). Plan: framer-motion for the cinematic carousel + shared-layout transitions; Radix for tee dropdowns/sheets. Add `embla-carousel-react` ONLY if framer swipe proves insufficient.

## H. Open decisions (product/architecture sign-off)
1. **Edit governance:** open contribution (anyone edits cloud tees, tracked by last-edited metadata) vs gated/approval. Spec leans open + metadata.
2. **Edit history now vs later:** append-only `*_edit_history` tables now (spec: "strongly preferred if not too heavy") vs last-edited metadata only.
3. **Soft-delete:** soft-delete (`deleted_at`) for courses/tees to protect round/stats integrity (spec: yes).
4. **Saved-course scope:** existing PLAYER saved courses → TEAM saved courses (spec §11: yes) — confirms a player→team ownership move.
5. **Tee-set versioning:** edit-in-place + metadata (MVP) vs versioned tee rows (`effective_date`). Spec: edit-in-place is fine; versioning deferred.
6. **The risky data step:** WHEN to run the live `golf_courses` dedup + `course_name` backfill (affects live analytics) — recommend LAST, on validated data, reversibly.

## I. Phased implementation plan (adapted to this codebase)
**P1 — Backend foundation (additive, non-destructive):** new tables (`golf_course_tees`, `golf_course_tee_holes`, `golf_team_saved_courses`, edit-history), additive columns on `golf_courses`/`golf_rounds`, RLS (cloud read-all-auth / write-with-metadata; team-saved team-scoped), normalized keys, TS types. No existing data touched. Migrations applied to prod additively + verified.
**P2 — Data access layer:** course search (team-saved → recent → cloud ranking) + dedupe-checked create + create/edit tee set + save-to-team + recently-played + round-snapshot wiring (rounds default from tee, still freeze into `golf_holes`).
**P3 — New-round integration:** replace the saved-course picker with course-search → tee-select → confirm holes → add-missing-tee → start; ensure shot tracking + scorecard unchanged (read frozen snapshot).
**P4 — UI/UX:** cinematic course carousel (framer-motion), collectible course cards, course-detail + tee manager, add/edit-tee bottom sheet, skeleton/empty/error states, mobile-first. (Uses the 5 reference screenshots.)
**P5 — Migration/compat:** map `golf_player_courses` → `golf_team_saved_courses` + tees; hide old saved-courses UI; keep old data readable; run the course dedup last.
**P6 — Testing:** the 6 scenarios (existing course+tee, missing tee, new course, women's-team-adds-tees, tee-edited-later-history-stable, dedupe-prevention) + regression of existing rounds/shots/stats.

Critical path P1 → P2 → P3 → P4; P5/P6 fold in. The destructive course-dedup is isolated to the very end and gated.
