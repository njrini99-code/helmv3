# Course Carousel System — Front-to-Back Audit (2026-06-14)

Branch: `fix/picker-premium-redesign`. Audited the full cloud course library + picker
("carousel") system end to end: data layer, the picker/carousel component, round-flow
integration, and imagery. Method: read the picker directly + three parallel deep-audit
agents (data / round-flow / imagery), each finding adversarially verified against the
actual code and — for the prod-state claim — against the live database.

**Verdict:** the core flow (browse → pick course → pick tee → pre-fill round) works.
The crash history is resolved (the carousel is plain native scroll-snap with zero
per-frame transforms / no `useScroll` on a conditional container, so React #310 cannot
recur). Found and **fixed** 6 real defects; **confirmed 1 critical prod bug** (migration
written, not applied); **reported** several integration/product items that need an owner
decision before changing the critical round-save path.

---

## FIXED this session (committed on `fix/picker-premium-redesign`)

| # | Sev | Area | Fix | Commit |
|---|-----|------|-----|--------|
| 1 | HIGH | Imagery | `CourseImage` was a server component with no `onError` → a broken uploaded URL showed the browser broken-image box. Now a client component with two-tier graceful fallback: uploaded → bundled real/default → warm gradient + initial. | c3e091d3 |
| 2 | HIGH | Picker CLS | Loading-skeleton tiles (`aspect-[16/10]`/`sm:[2/1]`, `w-[88vw]`/`sm:w-full`) matched neither the real card (`aspect-[3/2]`) nor the slide width → guaranteed layout shift on every open (CLS is a hard Lighthouse-CI error). Reshaped to the exact slide footprint + shimmer `Skeleton` (was `animate-pulse`). | c3e091d3 |
| 3 | MED | Round flow | A cloud tee recorded with pars but no yardages was bounced to the manual hole-config step (`hasValidYardages` gated on `yardage>0`), breaking the "pre-fills your pars and yardages" promise. Cloud picks now gate on `par>0`; manual/legacy courses still require a yardage. | c3e091d3 |
| 4 | LOW | Picker doc | Stale file-header still described an imperative "COVERFLOW" (replaced by plain native scroll-snap in #292). Rewrote so the doc matches the code and the #310 rationale stays accurate. | c3e091d3 |
| 5 | LOW | Picker search | Empty-normalized query (e.g. `"no"`, `"#"`) made `includes('')` match the whole library. Guarded `nq.length > 0`. | c3e091d3 |
| 6 | LOW | Picker race | Rapid taps on two course cards could let the slower tee-load overwrite the newer selection. Added a monotonic request token that drops stale responses. | c3e091d3 |

---

## CONFIRMED PROD BUG — migration written, NOT applied (owner decision)

**C1 (CRITICAL) — `golf_courses` has no UPDATE/DELETE RLS policy → course editing is silently broken on prod.**
Verified against the live DB (`pg_policies`): RLS is *enabled* on `public.golf_courses`,
but only `INSERT` + `SELECT` policies exist. Under RLS, a command with no matching policy
is denied, so every `UPDATE` by `authenticated` matches **zero rows** — silently:
- `updateCourse` / `setCourseImageUrl` → `.update().select().single()` → "no rows" error.
- `softDeleteCourse` / `restoreCourse` → `.update(deleted_at)` → 0 rows, returns success,
  tombstones nothing.
- Course *creation* works (INSERT policy present), so courses are created but cannot be
  edited or soft-deleted in production.

Fix shipped as a migration file only — **`supabase/migrations/20260614010000_course_library_update_policy.sql`**
(adds `golf_courses_update_authenticated` mirroring the INSERT gate `auth.uid() IS NOT NULL`;
no hard-DELETE policy since the table is soft-delete). **Apply via the normal migration/deploy
path after review** — applying RLS to the live DB is a deploy decision, not done by the audit.

---

## REPORTED — real, but need an owner decision (NOT changed blind on the round-save path)

- **R1 (HIGH) — "Grow the library from saves" only fires for hand-typed courses that reach
  the holes-config step AND have the "save course" box checked** (`new-round-client.tsx:967`,
  the sole `contributeCourseFromRound` call site, inside `handleHolesSave`). Cloud picks
  correctly skip it; but saved-player-course quick-picks (which skip holes-config) and any
  round where the user doesn't tick "save course" never contribute. **This is a
  product/data-governance trade-off, not a clear bug**: auto-contributing on every submit
  would realize "grows from saves" fully but pollute the shared catalog with every typo'd
  course name. Recommendation: contribute on submit for courses that came from a *saved*
  player course (already curated) OR when "save course" is checked — extends coverage
  without ingesting junk. Decide the policy before changing it.

- **R2 (HIGH) — Editing course fields after a cloud pick keeps a stale `tee_id`/`course_id`**
  (`handleTeePick` sets `selectedCourseId=null`, so the read-only "Course ready" summary
  isn't shown and the editable form appears pre-filled; editing the name then submits the
  edited name with the original tee/course link). Fix: render a read-only "Course ready"
  confirmation for cloud picks (drive it off `selectedTeeIdRef`, not `selectedCourseId`),
  or clear the refs when the user edits course fields away from the picked values. UI change
  on the critical round path → wants eyes-on QA.

- **R3 (MED) — `savePartialRound` never persists `tee_id`** (`buildPartialRoundData` /
  `PartialRoundData` omit it), so a save-for-later round started from a cloud tee is unlinked
  from the tee until/unless it is later submitted. Additive fix: add `teeId?` to
  `PartialRoundData`, send `selectedTeeIdRef.current`, COALESCE-preserve in the RPC (the RPC
  already maps `tee_id`). Low-risk but touches the partial-save RPC contract.

- **R4 (MED) — `getTeeRoundDefaults` returns partial hole data for a draft tee** (e.g.
  `holesCount:18` with a 5-entry `holes` array) with no completeness gate; `pickTee` doesn't
  check `isDraft`. The round form then pre-fills 5 of 18 holes. Fix: have the form treat
  `isDraft || holes.length !== holesCount` as "fill the gaps" rather than assuming a complete set.

- **R5 (HIGH) — Legacy `courses.ts updateCourse` does DELETE-then-INSERT on hole data**
  (`courses.ts:239-262`) — the banned destructive-write pattern; a transient failure leaves a
  course with zero holes. The cloud `updateTee` already does this correctly (stage-and-swap).
  Recommendation: convert to upsert+prune, or retire `courses.ts` if the cloud library
  supersedes it.

- **R6 (LOW) — TS↔SQL `normalizeName` drift risk** on `\b` vs `\y` word boundaries for inputs
  with digits/punctuation; add fast-check parity tests and a name-based secondary re-fetch on
  the 23505 dedup race. **R7 (LOW)** — `listCourses` is bare inside the picker's `Promise.all`
  (outer catch exists, so it's not an unhandled rejection, but one failure blanks all three
  feeds; wrap it like recent/team). **R8 (LOW)** — dead `redesign ? FairwayCoursePicker`
  branch in the legacy setup block (unreachable; the redesign picker renders in the early
  return). **R9 (LOW)** — picker auto-opens offline and fails to load with an error toast;
  skip the auto-open / show an offline empty-state when `!isOnline`. **R10 (LOW)** —
  `(supabase as any)` casts + `Record<string,unknown>` mappers in the legacy paths defeat
  generated DB types.

---

## VERIFIED-OK (checked, no defect)

- React #310 crash is gone: `CourseCarousel` is plain native scroll-snap, edge-triggered
  arrow state only, no `useScroll`/`useTransform` on a conditional container.
- `useToast` refetch loop is fixed: `showToast` held in a ref → data callbacks stable →
  the open-effect doesn't thrash/refetch.
- Auth: all 23 `course-library.ts` actions check auth first; team-saved writes are coach-gated.
- Dedup is enforced server-side (UNIQUE normalized_name index + BEFORE trigger) and the
  23505 race is handled gracefully (re-fetch the existing course).
- No destructive writes in the cloud write paths; `updateTee` is true stage-and-swap;
  `contributeCourseFromRound` is purely additive to the catalog and never blocks the round.
- PostgREST 1000-row cap respected (`listCourses` capped at 200, all `IN`-list reads bounded).
- `getTeamSavedCourses` upsert grant present (`golf_team_saved_courses` has UPDATE grant +
  FOR ALL policy).
- TeeRoundDefaults → round-form mapping is complete; final submit persists `tee_id` and
  derives authoritative `course_id` from the tee.
- Imagery precedence (uploaded > real(normalized) > default(hash)) is correct; all 15
  bundled assets exist on disk; CREDITS.md present; all licenses free-for-commercial;
  next/image `remotePatterns` cover the Supabase public bucket; alt text present; ARIA APG
  carousel pattern followed.
