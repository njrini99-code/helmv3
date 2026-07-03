## Onboarding (coach + player) [both]

End-to-end audit of the GolfHelm coach and player onboarding wizards.

- Coach route: `src/app/golf/(onboarding)/coach/page.tsx`
- Player route: `src/app/golf/(onboarding)/player/page.tsx`
- Shared server actions: `src/app/golf/actions/onboarding.ts`
- Step UI: `src/components/golf/onboarding/StepIndicator.tsx`
- Avatar control: `src/components/ui/avatar-upload.tsx`
- Team auto-join: `src/app/golf/actions/teams.ts` (`processGolfTeamInvitation` → `joinGolfTeam`)
- Role resolution: `src/lib/auth/session.ts` (`getGolfSessionProfile`)
- Routing in: `src/components/auth/golf-sign-up-form.tsx`, `src/app/golf/actions/auth.ts` (`loginAction`)

---

### Actual end-to-end wiring

**Entry / routing.** Signup (`golf-sign-up-form.tsx:105-109`) sends new accounts to `/golf/coach` or `/golf/player` (players carrying a `joinCode` go to `/golf/player?joinCode=…`). `loginAction` (`auth.ts:204-212`) resolves role by profile presence and routes to `/golf/coach` or `/golf/player` if that role's `onboarding_completed` is false, else `/golf/dashboard`. Middleware (`src/lib/supabase/middleware.ts`) only redirects unauthenticated users and only does *role-based* route gating for **baseball** routes (`checkRouteAuthorization`, lines 46-132) — golf onboarding routes get no role gating at the middleware layer.

**Coach wizard** (`coach/page.tsx`). Client component, 3 screens via local `useState<Step>` (`'program' | 'profile' | 'complete'`). `useEffect` auth check (lines 68-123): polls `supabase.auth.getUser()` up to 5×, redirects to `/golf/login` on no user, queries `golf_coaches` for `onboarding_completed`, and if true pushes to `/golf/dashboard`; otherwise prefills `fullName` from auth metadata. Step 1 collects org name/division/conference/city/state/team name/gender; "Continue" is gated on `orgName.trim()`. Step 2 collects full name/title/avatar; "Complete Setup" gated on `fullName.trim()` and calls `completeCoachOnboarding`. On success it stores the returned `joinCode` and advances to the "complete" screen, which shows the code + copy button + "Go to Dashboard" (`router.refresh()` then `router.push('/golf/dashboard')`).

`completeCoachOnboarding` (`onboarding.ts:58-244`): validates with Zod, re-auths server-side (5× poll), upserts a `users` row (`role:'coach'`, `ignoreDuplicates:true`), inserts `organizations` (trimmed name; 23505 unique-violation → friendly "already exists" error), inserts `golf_coaches` (with `onboarding_completed:true`), inserts `golf_teams` (name defaults to `"<org> Golf"`, 8-char `join_code`, `gender`), then inserts the bootstrap `golf_team_coach_staff` head_coach/`is_primary:true` row via the **admin client** (RLS bypass needed because the new staff-insert policy requires an existing primary coach). On each step failure it compensates by deleting the resources created so far, then `revalidatePath('/golf/dashboard')`. All tables sport-prefixed; correct server client; auth-first; revalidates. Behaviour is covered by `__tests__/program-onboarding.test.ts`.

**Player wizard** (`player/page.tsx`). Client component, 3 screens (`'about' | 'profile' | 'complete'`). `useEffect` (lines 64-116): polls `getUser`, redirects to `/golf/login` on no user, **calls `ensurePlayerRecord()`** (creates a minimal `golf_players` row with `onboarding_completed:false` so an abandoned wizard still leaves a record), then reads `golf_players` and either pushes to `/golf/dashboard` (if already completed) or **prefills every field from the existing row** (genuine resume support). Step 1 collects name/grad year/handicap/hometown/state; Step 2 collects avatar + GPA. "Complete Setup" reads `searchParams.get('joinCode')` and calls `completePlayerOnboarding(input, joinCode)`.

`completePlayerOnboarding` (`onboarding.ts:328-452`): Zod-validates, re-auths, upserts `users` (`role:'player'`), updates-or-inserts `golf_players` with `onboarding_completed:true`, then — best-effort — if a `joinCode` is present it calls `processGolfTeamInvitation(code, playerId)` which looks up the team case-insensitively and `joinGolfTeam`'s the player into the **exact** team that owns the code (auto-join from coach invite). Join failures never block onboarding. `revalidatePath('/golf/dashboard')`.

**States.** Both routes have real skeleton `loading.tsx` (logo + step pips + form rows) and `error.tsx` (`RouteErrorBoundary`). Auth-loading shows `PageLoading`. Submit errors render inline. Empty/first-run is the wizard itself.

---

### Expected vs actual (CLAUDE.md / README + project rules)

- CLAUDE.md `src/app/golf/(onboarding)/ # Coach (3-step) + Player (4-step)` and `src/app/golf/README.md:39` both describe **player onboarding as 4-step**. Actual player wizard is **3 screens** (two data steps + a completion screen), structurally identical to the coach wizard. The 4-step claim does not match the code. (No dedicated "Onboarding" section exists in `golfhelm-features.md`; the join flow appears as Feature #27 and matches the auto-join wiring.)
- Focus items: step progression persists in local state only (lost on reload); completion correctly sets `onboarding_completed=true`; routes to `/golf/dashboard`; coach creates org+team, player joins via code. Back/resume: **player resumes** (DB prefill); **coach does NOT** (nothing persisted until final submit, no prefill of program/profile on reload).

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | broken-wiring | `src/app/golf/(onboarding)/player/page.tsx:4,38` | `useSearchParams()` called in the default-exported client page with **no `<Suspense>` boundary**, unlike every sibling auth page (login `page.tsx:270-284`, welcome `page.tsx:232-245`, signup wraps its readers in Suspense). | Next.js 16 errors on static prerender ("useSearchParams() should be wrapped in a suspense boundary") or bails the whole route to client-only render, defeating `loading.tsx`. Repo's own convention proves the boundary is required. | Split the component: inner uses `useSearchParams`, default export wraps it in `<Suspense fallback={<PageLoading/>}>`. |
| HIGH | role-leak | `src/app/golf/(onboarding)/coach/page.tsx:102-111`; `onboarding.ts:88-101` | The coach page only checks `golf_coaches.onboarding_completed`; it does **not** check whether the user is already a player. A logged-in player who navigates to `/golf/coach` is shown the coach wizard, and `completeCoachOnboarding` will insert a `golf_coaches` row (the `users` upsert uses `ignoreDuplicates:true` so the existing `role:'player'` is preserved, masking the change). | Privilege escalation: `getGolfSessionProfile` resolves role by profile presence with **coach precedence** (`session.ts:164`), so the user becomes a coach with their own org+team. No middleware gate blocks this (golf routes aren't role-checked). | Gate the coach page: if the session already has a player profile, redirect to `/golf/dashboard` (or block). Mirror on the player page. |
| MEDIUM | broken-wiring | `coach/page.tsx:414-419`, `player/page.tsx:376-381` | `AvatarUpload` uploads the image to Storage and returns a public URL via `onUploadComplete` → stored in `avatarUrl` state, but `avatarUrl` is **never passed** to `completeCoachOnboarding` / `completePlayerOnboarding`, and neither action writes the `avatar_url` column. | The avatar a user uploads during onboarding is silently discarded (orphaned in the `avatars` bucket); profile shows initials. `golf_coaches.avatar_url` (db doc:327) and `golf_players.avatar_url` (db doc:946) both exist and are unused here. | Pass `avatarUrl` into both actions and write `avatar_url`. |
| MEDIUM | destructive-write | `onboarding.ts:62-63, 231-243` | The outer `catch` cleanup tracks `createdOrgId` and `createdTeamId` but **not** the created coach id. An unexpected throw after the `golf_coaches` insert (line 157) — outside the explicit `coachError`/`teamError` handlers — deletes the org/team but leaves an **orphan `golf_coaches` row** with `onboarding_completed:true` pointing at a deleted org. | Broken account state: user logs in, resolves as a coach (coach precedence) with no team and a dangling `organization_id`; dashboard renders against missing org. Narrow trigger window but real data-integrity gap. | Track `createdCoachId` and delete it in the outer catch (reverse order: team → coach → org). |
| MEDIUM | incomplete-feature | `coach/page.tsx:42, 127-135` | Coach wizard step is local `useState` and **no intermediate data is persisted** until the final submit; reload resets to step 1 with all program/profile fields blank. The player wizard, by contrast, persists via `ensurePlayerRecord` + prefills on reload. | A coach who fills step 1, navigates away, or refreshes loses all entered program data — inconsistent with the player resume experience and with "back/resume" expectations. | Persist a draft (e.g. an early `golf_coaches`/`organizations` stub or localStorage) and prefill on reload, mirroring `ensurePlayerRecord`. |
| LOW | wrong-data | `player/page.tsx:282-290, 148-149`; `onboarding.ts:40` | Handicap input placeholder is `+2.4` (a plus/scratch handicap, conventionally negative) and the field accepts `+`, but submission uses `parseFloat(handicap)` → `parseFloat('+2.4') === 2.4`. A plus-handicap is stored as a positive 2.4-index. | Elite ("plus") players get the wrong (sign-flipped) handicap stored, materially mis-stating ability. Zod allows down to -10 so negatives are valid storage. | Map a leading `+` to a negative value before `parseFloat`, or instruct/parse plus-handicaps explicitly. |
| LOW | wrong-data | `player/page.tsx:84-110` | `ensurePlayerRecord()` is called for **any** authenticated user who lands on `/golf/player`, including a coach. It creates an empty `golf_players` row (`onboarding_completed:false`) for them. | A coach who visits `/golf/player` gets an orphan empty player record; they keep coach precedence so role doesn't flip, but it pollutes data and would show the player wizard to a coach. | Guard `ensurePlayerRecord` / the player page against users who already have a coach profile. |
| INFO | spec-divergence | `CLAUDE.md:215`, `src/app/golf/README.md:39` | Docs say player onboarding is "4-step"; the implementation is 3 screens (2 data steps + completion), same shape as coach. | Documentation drift; no user impact. | Update docs to "3-step" or add the missing step. |

---

### Notes on items that are correctly wired (not findings)

- Tables are all sport-prefixed; `organizations` (shared) is intentionally used because the `golf_coaches.organization_id` FK to `golf_organizations` was dropped in prod (comment at `onboarding.ts:109-112`).
- Both server actions auth-check before any mutation and `revalidatePath` after.
- The coach compensating-delete pattern (deleting resources *created in the same call* on failure) is a rollback, not a destructive delete-then-reinsert of existing data — acceptable under the no-destructive-write rule (except for the orphan-coach gap above).
- `golf_teams.gender` insert is valid: column added by `supabase/migrations/20260607160000_add_gender_to_golf_teams.sql` (the db doc is stale on this column).
- Auto-join routes to the **exact** team owning the join code (dual-team org safe), covered by `program-onboarding.test.ts` Suite 3.
- `generateJoinCode` uses `crypto.randomInt` over an unambiguous alphabet (8 chars).
- Join-code copy uses `navigator.clipboard` with a graceful fallback.
- No pagination concerns (no large reads); no realtime/badges on this surface.
