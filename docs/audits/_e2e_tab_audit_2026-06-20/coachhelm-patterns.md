## Patterns [coach]

End-to-end audit of the coach-only Pattern Management tab.

Route: `/golf/dashboard/patterns`
Primary table: `golf_patterns_v2`
Action file: `src/app/golf/actions/pattern-management.ts`

---

### How it is actually wired end-to-end

**Auth + role gate (correct).**
`src/app/golf/(dashboard)/layout.tsx:34-35` redirects unauthenticated users to `/golf/login` and resolves role server-side via `getGolfSessionProfile()` (`src/lib/auth/session.ts:142-167`). The page itself (`page.tsx:48-64`) re-checks the session, and if `!coach` it returns `FeatureUnavailable` for a player (with a link to `/golf/dashboard/coachhelm`) or an `ErrorState` for no-profile. So a player cannot view coach pattern data — clean coach-only gate.

**Two render paths, gated by `NEXT_PUBLIC_REDESIGN`** (`src/lib/redesign/flag.ts:62-65`). The redesign flag is ON in production (per project memory: "prod RE-PROMOTED from main 2026-06-02 — Fairway shell redesign LIVE"), so the LIVE path is the redesign branch.

- **Flag OFF (legacy):** `page.tsx:113-122` renders `PatternsDashboardClient` (`PatternsDashboardClient.tsx`) → `PatternDashboard` (`PatternDashboard.tsx`) → `PatternCard` / `PatternByPlayerView` / `PatternTimeline` / `PatternValidationModal`. Data comes from `getTeamPatterns()` + `getPatternStats()` fetched in parallel server-side (`page.tsx:67-70`).
- **Flag ON (live):** `page.tsx:78-107` renders `FairwayCoachHelmSignals` with `signalSource='patterns'`, seeded `initialPatterns` from the SAME `getTeamPatterns()` read. The component projects patterns through the pure adapter `patternToInsightVocabulary.ts` into a unified `SignalRow` vocabulary and renders them as `InsightCard`s with per-row Confirm / Address / Resolve / Dismiss buttons.

**The read (`getTeamPatterns`, `pattern-management.ts:224-404`)** is correctly wired: auth-checks `getUser()` first, resolves the coach's active team via `resolveCoachTeamIdWithCookie` (multi-team / men's-women's toggle aware), gets active `golf_team_members.player_id`, then queries `golf_patterns_v2` filtered `.in('player_id', playerIds)`. It suppresses the ~13k low-value `contextual` rows by default (`.neq('pattern_type','contextual')`), orders by `stroke_impact` desc, caps at `PATTERNS_DEFAULT_LIMIT=200`, and returns honest `counts` (returned / contextualHidden / capped). Row→UI transform (`transformPatternRow`) is faithful and reads `metadata.description`/`metadata.recommendation` for copy. The 200-cap is intentional and well-reasoned (highest-signal rows kept) — not a silent pagination-truncation bug for this surface.

**The mutations** (`validatePattern`, `dismissPattern`, `markPatternAddressed`, `resolvePattern`) each: auth-check, verify ownership via `verifyPatternAccess` → `verifyPlayerAccess` (prevents a coach mutating another team's pattern by id), UPDATE `golf_patterns_v2` by id, then `revalidatePath('/golf/dashboard/patterns')`. RLS is enabled and the `patterns_v2_update_coach` policy correctly scopes coach updates to their own team's players.

---

### Expected vs actual

The feature doc (#14 Patterns) expects: view patterns, and four lifecycle transitions — Validate (detected→confirmed), Address (confirmed→addressed), Resolve (addressed→resolved), Dismiss (→dismissed). The READ and DISMISS/RESOLVE paths match the spec. **Two of the four lifecycle transitions are broken** because the action writes columns that do not exist on the live `golf_patterns_v2` table (verified against production schema and the baseline migration). This is divergence from the documented "✅ 95%" state.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|----------|----------|-----------|-------|--------|-----|
| CRITICAL | broken-wiring | `pattern-management.ts:450-451` | `validatePattern` writes `validated_at` + `validated_by`, neither of which exists on `golf_patterns_v2` (live schema has `validation_date`, `validator_coach_id`, `validated_by_coach`). Postgres rejects the UPDATE (error 42703, verified live: `column "validated_at" ... does not exist`). The whole UPDATE fails atomically, so `lifecycle_state`/`severity`/`coach_notes` never persist either. | Coach "Validate"/"Confirm Pattern" silently fails. Legacy path: modal closes, `router.refresh()` shows the pattern still "Detected". Live redesign path (`FairwayCoachHelmSignals.handleConfirmPattern`, line 593): optimistic flip to "confirmed" then rolls back — and no error toast (rollback at line 597 does not call `setError`), so the coach sees the action quietly undo itself. No focus area is created (createFocusArea path at line 479 never runs). | Map to real columns: `validation_date`, `validator_coach_id`, `validated_by_coach=true`; drop `coach_notes` writes or store coach text in `resolution_notes`. |
| CRITICAL | broken-wiring | `pattern-management.ts:572-580` | `markPatternAddressed` always writes `addressed_at` (line 574) and, when notes are passed, `coach_notes` (line 579) — neither column exists on `golf_patterns_v2`. UPDATE fails (42703). | Coach "Mark as Working On" / "Address" button is dead. Legacy: no-op. Live redesign (`handleAddressPattern` → `removePatternOptimistic`): the row is optimistically removed then silently restored, with no error surfaced. Lifecycle never advances to `addressed`. | Drop `addressed_at` (no such column; `lifecycle_state='addressed'` is the only durable marker) or add the column via migration; remove the `coach_notes` write or redirect to an existing text column. |
| HIGH | broken-wiring | `pattern-management.ts:638` | `resolvePattern` writes `coach_notes` ONLY when `notes` is passed. The UI never passes notes (legacy `handleResolve` calls `resolvePattern(pattern.id)`, redesign `handleResolvePattern` calls `resolvePattern(row.id)`), so today it succeeds; but any future caller passing notes will hit the same 42703 column failure. `golf_patterns_v2` has `resolution_notes`, not `coach_notes`. | Latent: resolve works now but breaks the moment a notes argument is wired. | Write to `resolution_notes` instead of `coach_notes`. |
| MEDIUM | error-state | `FairwayCoachHelmSignals.tsx:597`, `:573-578` | The optimistic rollback for pattern mutations (`handleConfirmPattern` line 597 and `removePatternOptimistic` lines 573-578) restores prior state on `!success`/throw but never calls `setError(...)`. Combined with the two CRITICALs above, Confirm and Address fail completely silently — the UI animates the change then reverts with zero feedback. | Coach cannot tell the action failed; looks like a flaky UI. Masks the underlying column bug from anyone testing the live app. | On `!res.success` (and in the catch), set an InlineNotice error ("Couldn't update the pattern — try again"), as the insight-side bulk handlers already do. |
| MEDIUM | dead-control | `pattern-management.ts:206-214` + `PatternCard.tsx:430-440,503-505` | `transformPatternRow` maps `coachNotes`/`validatedAt`/`addressedAt` from DB columns that don't exist, so they are always `undefined`. The "Coach Notes" panel (`PatternCard.tsx:431`) and the "Validated:" timestamp (`PatternCard.tsx:503`) can therefore never render, even after a (hypothetically fixed) validate — and the validate modal's notes textarea (`PatternValidationModal.tsx:247`) captures text that is dropped on write and never read back. | Coach-entered validation notes are write-discarded and never displayed; two UI affordances are permanently dead. | After fixing the write columns, also map the read side: `validatedAt ← validation_date`, notes ← `resolution_notes` (or add a dedicated `coach_notes` column). |
| LOW | rls | DB grant on `golf_patterns_v2` | `anon` holds GRANT ALL (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) on `golf_patterns_v2` (verified via `role_table_grants`). RLS is enabled and every policy is scoped to `{authenticated}` with no anon policy, so anon access is denied at the row level — this is a latent over-broad grant, not an active leak. | No current data exposure; violates least-privilege and the project rule that recreating tables auto-grants anon and must be REVOKEd. | `REVOKE ALL ON public.golf_patterns_v2 FROM anon;` (keep authenticated + service_role). |
| INFO | wrong-data | `page.tsx:81-82,102` | The Fairway shell "signals" badge on the patterns route is fed `getAlertCounts(coach.id).critical` (`alerts.ts`), which counts `golf_coach_insights` rows — not patterns. On a patterns-only surface the badge reflects insight alerts, not pattern counts. | Minor: the shell badge over/under-states relative to what's on screen. | Either pass a pattern-derived count on this route or document that the badge is a global signals count. |
| INFO | completeness | `FairwayCoachHelmSignals.tsx:195-200` | `PATTERN_STATUS_OPTIONS` offers Detected/Confirmed/Addressed/Resolved but no "Dismissed" filter, while `getTeamPatterns` returns dismissed rows (no default lifecycle exclusion). Dismissed patterns are visible but cannot be filtered to. | Minor UX gap; not incorrect data. | Add a "Dismissed" status option or default-exclude dismissed/resolved from the read. |

---

### Verification notes

- Live production schema query confirmed `golf_patterns_v2` has columns `validation_date`, `validator_coach_id`, `validated_by_coach`, `resolution_notes`, `dismissed_at`, `dismissed_reason`, `resolved_at`, `lifecycle_state`, `severity`, `is_active`, `updated_at` — and does NOT have `validated_at`, `validated_by`, `addressed_at`, or `coach_notes`.
- Direct `UPDATE public.golf_patterns_v2 SET validated_at = now() ...` returned Postgres error 42703 (column does not exist) — definitive proof the validate/address writes fail.
- Baseline migration `20260527000000_prod_public_baseline.sql:9924-9960` is the only migration that defines `golf_patterns_v2`; no later migration adds the missing columns. The bug has never had a corresponding schema.
- `dismissPattern` (lines 518-526) and the no-notes `resolvePattern` UI call write only existing columns and succeed.
- RLS policies all `{authenticated}`-scoped; coach UPDATE allowed via `patterns_v2_update_coach`. Auth + ownership checks present on every action.
