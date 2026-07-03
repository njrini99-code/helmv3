## Join team by code [both]

Audited 2026-06-20. Role context: **both** (the route is player-facing by design; coach paths traced for the cross-role edge cases).

### Routes / files audited
- `src/app/golf/join/[code]/page.tsx` — server component, resolves code → team, gates auth/onboarding
- `src/app/golf/join/[code]/golf-join-team-client.tsx` — client confirm UI
- `src/app/golf/join/[code]/loading.tsx` / `error.tsx` — route states
- `src/app/golf/join/page.tsx` — manual code-entry form (the bare `/golf/join` landing)
- `src/app/golf/join/error.tsx` — bare-route error boundary
- `src/app/golf/actions/teams.ts` — `processGolfTeamInvitation`, `joinGolfTeam`, `validateGolfPlayerCanJoinTeam`
- `src/app/golf/actions/onboarding.ts` — `ensurePlayerRecord`, `completePlayerOnboarding` (auto-join on onboarding)
- `src/app/golf/(onboarding)/player/page.tsx` — onboarding consumer of `?joinCode=`
- `src/app/golf/(auth)/signup/page.tsx` + `src/components/auth/golf-sign-in-form.tsx` — invite-link auth gate / returnTo
- DB/RLS: `supabase/migrations/20260527000000_prod_public_baseline.sql` (golf_teams, golf_team_members policies)

### Actual end-to-end wiring

**Happy path (onboarded player, valid code):**
1. `page.tsx:19` `supabase.auth.getUser()`; if no user → `redirect('/golf/signup?returnTo=/golf/join/<code>')` (`page.tsx:20-23`). Auth is enforced before any private read.
2. `page.tsx:26-30` loads `golf_players` (id, first_name, last_name, graduation_year, onboarding_completed) by `user_id`.
3. `page.tsx:32-37` if no player or `!onboarding_completed` → `redirect('/golf/player?joinCode=<code>')`.
4. `page.tsx:41-57` normalizes code to uppercase and looks up `golf_teams` by `join_code` with embedded `organizations`, using `.single()`. `golf_teams_join_code_key` is UNIQUE so `.single()` is safe.
5. On `teamError || !team` → renders the inline "Invalid Invite Code" card with a link to `/golf/dashboard` (`page.tsx:59-89`).
6. Otherwise renders `GolfJoinTeamClient` with team + player props (`page.tsx:93-111`).
7. Confirm button → `handleJoinTeam` (`client:46`) → `processGolfTeamInvitation(inviteCode, playerId)` (`client:51`).
8. `teams.ts:273-295` re-looks-up the team by normalized join_code (`.single()`), returns `Invalid join code` on miss, else calls `joinGolfTeam(playerId, team.id)`.
9. `joinGolfTeam` (`teams.ts:175`) calls `validateGolfPlayerCanJoinTeam` first (`teams.ts:179`), which **does** `auth.getUser()` (`teams.ts:83`), verifies the player row belongs to the auth user (`teams.ts:106-111`), requires onboarding complete (`teams.ts:114-119`), and enforces one-team-only via `golf_team_members` (`teams.ts:135-163`).
10. On pass, inserts `golf_team_members { player_id, team_id, status: 'active' }` (`teams.ts:203-209`). `'active'` is a valid `team_member_status` enum value (`database.ts:11884`).
11. Best-effort coach notifications into `notifications` (failure never blocks the join, `teams.ts:218-257`).
12. `revalidatePath('/golf/dashboard' | '/golf/dashboard/roster' | '/golf/dashboard/team')` (`teams.ts:259-262`).
13. Client shows success, `setTimeout(() => router.push('/golf/dashboard'), 800)` (`client:64-66`).

**Auth-gated / not-onboarded paths:**
- Unauthenticated → signup with returnTo (`page.tsx:22`). Signup (`signup/page.tsx:64-87`) extracts the code from `returnTo` and forwards it to `GolfSignUpForm`; new player onboarding receives `?joinCode=` and `completePlayerOnboarding(..., joinCode)` auto-joins best-effort (`onboarding.ts:428-439`).
- Authenticated but not onboarded → `/golf/player?joinCode=<code>`; onboarding submit reads `searchParams.get('joinCode')` (`onboarding/player/page.tsx:144`) and passes it to `completePlayerOnboarding`, which calls `processGolfTeamInvitation` (`onboarding.ts:431`).

**RLS:** `golf_teams_select_by_join_code` (line 19841) lets any authenticated user SELECT a team with a non-null join_code, so the not-yet-member lookup on `page.tsx`/`teams.ts` works. `"Players can join teams"` INSERT policy (line 17065-17069) requires the player row to belong to `auth.uid()` and the team to have a join_code — the self-join is correctly permitted and spoofing another `player_id` is blocked. No anon/over-broad grants observed on these paths.

**States:** `loading.tsx` is a proper skeleton (not a spinner). `error.tsx` uses `RouteErrorBoundary`. Invalid-code is an inline branded card with a CTA. Client has explicit `error`/`success`/`loading` states with `role="alert"`/`role="status"` + `aria-live`. Cancel button routes to the real `/golf/dashboard`.

### Expected vs actual (golfhelm-features.md #27)
The implemented flow matches the documented data flow exactly: auth check → player/onboarding check → redirect-to-onboarding-with-code → case-insensitive `join_code` lookup → confirm → INSERT `golf_team_members` → dashboard. The feature doc notes "(or golf_team_join_requests if approval required)" as an alternative; the code always inserts a directly-`active` membership and never uses `golf_team_members.status = 'pending'` or `golf_team_join_requests`. That is consistent with the doc marking the feature 100% (auto-approve is the chosen behavior), so it is an INFO note, not a defect. Tables touched (golf_teams, golf_players, golf_team_members, organizations) all use correct sport-prefixed names and verified columns.

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | role-leak | src/app/golf/join/[code]/page.tsx:32-37 + src/app/golf/(onboarding)/player/page.tsx:86 | A logged-in **coach** (has `golf_coaches`, no `golf_players`) who opens a `/golf/join/<code>` link is treated as a not-onboarded player and force-redirected to `/golf/player` onboarding, where `ensurePlayerRecord()` creates a `golf_players` row for them. The join route has no coach branch. | Coaches who click their own invite link get a stray player profile and the player-onboarding wizard instead of a "you're a coach" message. | In `page.tsx`, before the player-onboarding redirect, check for a `golf_coaches` row by `user_id` and render an explanatory state (or redirect to `/golf/dashboard`) instead of `/golf/player?joinCode=`. |
| MEDIUM | incomplete-feature | src/components/auth/golf-sign-in-form.tsx:95-110 | Invite via **login** (not signup): when an existing-but-not-onboarded user logs in at `/golf/login?returnTo=/golf/join/<code>`, `needsOnboarding` is true so `storedReturnTo` is discarded and they go to bare `/golf/player` / `/golf/coach` with **no `?joinCode=`** appended. The comment claims "the join page will redirect to onboarding with the joinCode anyway," but the user is sent straight to onboarding, not the join page, so the code is lost. | A player who logs in (instead of signing up) from an invite link before completing onboarding never auto-joins; they land on the dashboard with no team and must re-enter the code manually. | When `needsOnboarding` and `storedReturnTo` matches `/golf/join/<code>`, redirect to `/golf/player?joinCode=<code>` (append the extracted code) instead of dropping it. |
| LOW | type-mismatch | src/app/golf/join/[code]/page.tsx:98 + golf-join-team-client.tsx:158 | `playerYear={player.graduation_year ? String(player.graduation_year) : 'freshman'}` passes a 4-digit grad year (e.g. "2027"), but the client renders it as a class/position label: `{playerYear.replace('_', ' ')}` with `capitalize` and a default of `'freshman'`. There is no class/`year` column on `golf_players` (only `graduation_year`). | The "Joining as" card shows a raw graduation year styled like a class label ("2027"), or "Freshman" only when grad year is null — mildly confusing copy, not a functional break. | Either label it "Class of {year}" or drop the line; the `.replace('_',' ')` + 'freshman' default is dead/misleading for an integer year. |
| INFO | incomplete-feature | src/app/golf/actions/teams.ts:203-209 | Join always inserts `golf_team_members.status = 'active'` (auto-approve). The feature doc's "or golf_team_join_requests if approval required" branch and the `golf_team_members.status = 'pending'` enum path are unimplemented; the in-page "approval" verbiage in the docstrings does not reflect a real gate. | No user-facing bug today (auto-join is intended), but a coach-approval mode does not exist despite being referenced. | If approval mode is ever desired, branch on a team setting to insert `status: 'pending'` and surface a pending state on the roster. |
| INFO | error-state | src/app/golf/join/[code]/page.tsx:75-77 + [code]/error.tsx:19 | UI copy says the code may be "expired" ("This team invitation code is invalid or does not exist." / "The link may have expired."), but `golf_teams.join_code` has no expiry/TTL column — codes are permanent. | "Expired" is messaging only; there is no actual expired-code handling to verify. | Drop the "expired" wording, or add a real expiry column + check if expiring invites are a requirement. |

### Coverage notes
All code paths above were read in full. RLS policies were confirmed in the committed baseline migration, not against the live DB — the player self-join INSERT and join_code SELECT policies exist and are correct as written. The two MEDIUM findings (coach-clicks-invite, login-instead-of-signup-drops-code) are best confirmed by clicking through the running app with a coach account and with an existing-not-onboarded player account respectively. The notification insert into `notifications` (non-prefixed) is intentional (cross-sport table via `fromUntyped`) and out of scope for this tab.
