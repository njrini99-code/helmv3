## Course Library + What's New [both]

End-to-end audit of two distinct dashboard surfaces that share this audit unit:

1. **Course Library** — `/golf/dashboard/courses` (route is reachable by BOTH coach and player; "Save to team" is coach-only).
2. **What's New** — `/golf/dashboard/whats-new` (coach-only lifecycle change feed).

Date: 2026-06-20. Auditor traced page → components → server actions → tables, and verified live RLS + columns via Supabase MCP.

---

### A. Course Library — actual end-to-end wiring

- **Route**: `src/app/golf/(dashboard)/dashboard/courses/page.tsx`
  - `getGolfSessionProfile()`; redirects to `/golf/login` if no session OR no `role` (`page.tsx:21-24`). `export const dynamic = 'force-dynamic'` so the library reflects new courses/tees/photos immediately (`page.tsx:18`).
  - Server-side fetches: `listCourses({ limit: 200 })`, then `Promise.all([getCourseTeeCounts(ids), getTeamSavedCourses()])` (`page.tsx:26-30`).
  - Renders `CourseLibraryClient` with `canManageTeam={userRole === 'coach'}` (`page.tsx:38`).
- **Client**: `src/components/golf/courses/CourseLibraryClient.tsx`
  - Search is **client-side filter only** over the already-fetched 200 courses (`CourseLibraryClient.tsx:42-50`); it does NOT re-query the server's `listCourses({ query })` path. The server search path exists and is used by `TeePickerDrawer`, but the library page never calls it.
  - Hero = top saved course else first course; "Your team's courses" section; "All courses" grid. Empty state present (`EmptyState`, line 211).
  - `CourseCard` (whole card is one tap target) → `onSelect(courseId)` → opens `CourseDetailDrawer`.
  - "Add course" → `CourseFormDrawer` (create) → `createCourse` → on save jumps into the new course detail (`CourseLibraryClient.tsx:181-189`).
- **Detail drawer**: `src/components/golf/courses/CourseDetailDrawer.tsx`
  - `getCourseDetail(courseId)` loads course + active tees (`CourseDetailDrawer.tsx:53-60`). Loading skeleton for the tee list (line 232). Tee empty state (line 238).
  - Photo upload: client uploads directly to the public `course-images` bucket via `uploadCourseImage()` (avoids the 2 MB server-action limit), then `setCourseImageUrl()` validates the URL is in OUR bucket before persisting (`upload-course-image.ts` + `course-library.ts:646-662`, validator `isCourseImagePublicUrl`). Remove photo → `removeCourseImage`.
  - "Save to team" / "Saved" toggle ONLY rendered when `canManageTeam` (coach) — `CourseDetailDrawer.tsx:185`. → `saveTeamCourse` / `unsaveTeamCourse`.
  - "Edit course" → `CourseFormDrawer` (edit) → `updateCourse`. "Add tee" / "Edit" → `TeeFormDrawer` → `createTee` / `updateTee`.
- **Actions**: `src/app/golf/actions/course-library.ts` — every action calls `supabase.auth.getUser()` first (`getActor`/`getCoachTeam`) and returns an error (never throws) when unauthenticated. Mutations call `revalidateLibrary()` (revalidates `/golf/dashboard/courses` + `/golf/dashboard/rounds`).
- **Tables** (verified live): `golf_courses`, `golf_course_tees`, `golf_course_tee_holes`, `golf_team_saved_courses`, `golf_course_edit_history`, `golf_course_tee_edit_history` — all sport-prefixed; all columns referenced in the action exist (verified `information_schema.columns`).
- **Grow-from-saves**: `contributeCourseFromRound` is wired into the real round-submit flow at `new-round-client.tsx:977` and `:1043` (and the Fairway picker via `getRecentlyPlayedCourses` in `FairwayCoursePicker.tsx:105`). Purely additive; never touches `golf_rounds/holes/shots`. Has unit tests.

#### Snapshot / destructive-write safety (PASS)
- Course/tee deletion is **soft** (`deleted_at`), never hard-delete (`softDeleteCourse`/`softDeleteTee`).
- Tee hole replacement is **stage-and-swap**: upsert new rows by `(tee_id, hole_number)` FIRST, then delete ONLY surplus hole numbers (`updateTee`, `course-library.ts:905-929`); empty-set replace is refused (line 902). No wipe-and-reinsert. Conforms to the "no destructive delete-then-insert" rule.
- `saveTeamCourse` uses `.upsert(..., { onConflict: 'team_id,course_id' })` (idempotent).

#### RLS (verified live — PASS)
- `golf_courses`: SELECT `true`; INSERT/UPDATE gated on `auth.uid() IS NOT NULL`. **The UPDATE policy IS present** (`golf_courses_update_authenticated`, cmd `w`). The historical "no UPDATE RLS → edits silently no-op" bug is fixed. No anon/over-broad grant in policy expressions.
- `golf_course_tees`: SELECT `true`; INSERT check `created_by_user_id = auth.uid()`; UPDATE check `last_edited_by_user_id = auth.uid()`.
- `golf_course_tee_holes`: `*` write `true`/`true` (open contribution — intended).
- `golf_team_saved_courses`: write gated `is_golf_team_coach(team_id)`; SELECT `is_golf_team_coach OR is_golf_team_player`.
- `golf_course_edit_history` / `golf_course_tee_edit_history`: INSERT check `edited_by_user_id = auth.uid()`; SELECT `true`.

### B. What's New — actual end-to-end wiring

- **Route**: `src/app/golf/(dashboard)/dashboard/whats-new/page.tsx`
  - `getGolfSessionProfile()`; no session → `/golf/login`; **no coach** → `redirect('/golf/dashboard?message=What%27s+New+is+a+coach-only+feature')` (`page.tsx:194-200`). Correct coach-only gate (does not rely on nav hiding).
  - Calls `getWhatsNewForCoach()`; groups items by day; renders legacy feed OR `FairwayWhatsNew` when `isRedesignEnabled()` (`page.tsx:222-227`).
- **Action**: `src/app/golf/actions/whats-new.ts` — `getWhatsNewForCoach()` re-checks `getGolfSessionProfile()` + `coach` (defense in depth). Resolves active team via `resolveCoachTeamIdWithCookie`. Runs 5 parallel lifecycle queries (matured/resolved, detected, pattern_validated, focus created, focus completed) over `golf_coach_insights`, `golf_patterns_v2`, `golf_player_focus_areas`, scoped by `team_id`/roster. Insight branches pass through `applyInsightVisibility` (v3 product-visibility contract). Soft-fails individual branches (logs, keeps going). Caps to 50 items after a chronological sort.
- **Presentation**: `FairwayWhatsNew.tsx` (flag-on) and inline legacy renderer are pure presentation over the same `{ success, error, items }`. Empty state + error state both present in both renderers. Player-name links → `/golf/dashboard/players/${playerId}`.
- **States**: route has both `loading.tsx` (skeleton) and `error.tsx` (`RouteErrorBoundary`).

### Expected-vs-actual (spec comparison)

The feature doc is **stale** for this unit. `golfhelm-features.md` #1 Round Tracking still lists the OLD course model (`golf_player_courses`, `golf_course_holes`) and the live DB doc (`golfhelm-database.md:389`) still shows the pre-cloud `golf_courses` shape. There is **no feature-doc section** for the Cloud Course Library or for What's New at all. So "expected" had to be reconstructed from the action docstrings + the prior course-library audit referenced in `course-library.ts:10`. Against THAT intended behavior, the implementation matches: snapshot-safety, soft-delete, stage-and-swap, dedup-on-normalized-name, open contribution + coach-gated team saves, grow-from-saves, image-precedence resolver. The memory note claiming "golf_courses has NO UPDATE RLS policy" is OUT OF DATE — the policy is present on prod. The remaining gaps are discoverability (no nav/palette entry for Courses) and a couple of presentation/robustness items below.

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| MEDIUM | ux-gap | `src/app/golf/(dashboard)/FairwayDashboardShell.tsx:95-159` | The Course Library route `/golf/dashboard/courses` is in NEITHER the coach nor player nav section built by `buildNavSections`, and has NO entry in `CommandPalette.tsx` either. It is only reachable by typing the URL or via the in-round tee/course picker. | A primary feature (manage courses, tees, photos, team-saved library) is effectively undiscoverable from the app chrome for both roles. | Add a "Courses" nav item (both roles) and/or a CommandPalette quick action pointing at `/golf/dashboard/courses`. |
| LOW | no-error-state | `src/app/golf/(dashboard)/dashboard/courses/` (has `loading.tsx`, no `error.tsx`) | The Courses route has a `loading.tsx` skeleton but no route-level `error.tsx`, unlike `whats-new/` which has one. If a server fetch throws, it bubbles to the nearest ancestor boundary instead of a course-specific error UI. | Degraded error UX (generic boundary copy) on the courses route only. Note: the actions themselves return `[]`/`null` on failure so the page rarely throws — low real-world risk. | Add `courses/error.tsx` using `RouteErrorBoundary` mirroring `whats-new/error.tsx`. |
| LOW | pagination-cap | `src/app/golf/actions/course-library.ts:220-236` (`getCourseTeeCounts`) | Selects `golf_course_tees.course_id` filtered `.in('course_id', courseIds)` for up to 200 courses with no pagination. PostgREST hard-caps responses at 1000 rows. ~5+ tees across 200 courses can exceed 1000 → tee counts silently undercount on the busiest libraries. | Course cards show a too-low "N tees" badge once the catalog is large; cosmetic, not data loss. Not a concern at current data volume. | Paginate via `fetchAllRowsResult`/`.range()`, or aggregate counts in a DB view/RPC. |
| LOW | wrong-data | `src/app/golf/actions/whats-new.ts:314` | `pattern_validated` items set `title: row.pattern_type ?? 'Pattern validated'`, surfacing the raw enum/string `pattern_type` (e.g. `tee_strategy`) as the feed title verbatim. | Coach sees a machine token instead of a human-readable pattern label in the What's New feed. | Map `pattern_type` through a label dictionary (same pattern the patterns UI uses) before display. |
| INFO | revalidation | `src/app/golf/actions/course-library.ts:55-58` | `revalidateLibrary()` revalidates `/golf/dashboard/courses` and `/golf/dashboard/rounds`, and the client drawers also call `router.refresh()` (`CourseLibraryClient.tsx:57`) / local `reload()`. Mutations correctly refresh both server cache and the open drawer. No bug — recorded as positive confirmation. | n/a | n/a |
| INFO | role-leak | `src/app/golf/actions/course-library.ts:358-385` (`getTeamSavedCourses`) | A player reaching `/golf/dashboard/courses` gets their OWN team's saved library (resolved via `golf_team_members`), and "Save to team" is hidden for players (`CourseDetailDrawer.tsx:185`, `canManageTeam` false). Players CAN still add/edit cloud courses+tees — this is intentional "open contribution" per the action's documented contract and the open RLS. No cross-team leak. | n/a — by design. | n/a |

### Coverage notes
- Could not exercise the running app; all findings are code/schema-grounded. The MEDIUM nav/discoverability finding and the LOW error-state finding are best confirmed by clicking through the live app (is there any other surfaced entry point to `/golf/dashboard/courses` I did not find in `Link`/`href`/CommandPalette greps?).
- The `getCourseTeeCounts` 1000-row cap is a real PostgREST behavior but only bites at large catalog scale — verify against production row counts before prioritizing.
- Feature docs (`golfhelm-features.md`, `golfhelm-database.md`) are stale for the cloud course tables; recommend a docs:regen / manual section so future audits have a real "expected" reference.
