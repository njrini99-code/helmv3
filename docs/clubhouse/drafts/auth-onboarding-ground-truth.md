# Sign up, onboarding and join: ground truth for the Clubhouse build (P015)

Read-only survey of 2026-09-30 (auth-inventory and a test survey), checked against
live production with read-only SQL. [V] means the code was read or the database was
queried; [I] means it was inferred. The Clubhouse screens change presentation only:
every rule below still holds behind them.

## What the new screens call, and why

| Screen | Server call | Rule it keeps |
|---|---|---|
| Code | `validateAccessCode` | The server-verified gate. It sets the httpOnly `helm_golf_signup_gate` cookie, and `signupAction` re-verifies that cookie. The code is never an argument to `signupAction` [V]. The throttle is 10/hour per IP (`signup:gate:<ip>`), and a throttled caller reads as "no match" on purpose. The code checks itself only at 8 characters and after a pause; any other length is checked on Continue. |
| Account | `signupAction(email, pw, 'player'\|'coach', first, last)` | A roster code signs up a player, and a staff code an assistant, because the role is in the signed token (Q-96). No team is sent. |
| Your game, Photo | `completePlayerOnboarding({first, last, gradYear, handicap, hometown, state, avatarUrl}, joinCode)` | Partial updates never write NULL. "I don't have one yet" sends no handicap. A plus handicap is stored negative. The graduation year chosen at sign-up is now persisted; before this it was collected and dropped [V R5]. |
| Photo upload | Storage bucket `avatars`, in the user's own folder | Takes JPEG, PNG, GIF and WebP up to 2 MB [V live]. HEIC is refused on the client (R21). |
| Request access | `submitDemoRequest(email, {name, school, message, source:'signup', interestType})` | Writes to `demo_requests`, which the owner's inbound list in admin CRM reads. `interest_type` is `golf_coach`, `golf_player` or `organization` (CHECK [V live]). |

## Routing the new screens rely on

- Middleware bounces a signed-in visitor off `/golf/signup` [V]. So once the account
  exists, a player's remaining questions run on `/golf/player?joinCode=…`, which is the
  server's own redirect. The draft is kept in sessionStorage in that tab, never with the
  password.
- `/golf/player` in Clubhouse sends these elsewhere:
  - a signed-out visitor to sign in;
  - a coach to the dashboard (`completePlayerOnboarding` has no coach guard, R14);
  - someone already onboarded to the dashboard.
- Today's behaviours are kept:
  - iOS app sign-up goes to sign in (R8);
  - an invite link's code is prefilled (`?joinCode=`, `?code=`, `returnTo=/golf/join/<CODE>`).

## Incident rules that bind any redesign

- A roster code never reaches new-program onboarding (I1).
- A note is not a control: remove the wrong option (I1c).
- The server re-derives the role from the gate cookie (I1d).
- The one-team rule ignores membership status (I9).
- An identity read that fails, fails closed (I11).
- Joining is idempotent: already on this team is success (I8).
- A failed join shows its own state, with no celebration (I10).
- One password policy: the client never checks wider than the server (I18).
- Every sign-in resets the idle marker (I21).
- The greeting uses the viewer's clock, with a null server snapshot (I31).

## Known defects (not built into the new screens; fixed or queued)

- R1 `joinTeamAsAssistantCoach` is an unauthenticated server action. Being fixed in the security PR off main.
- The roster code is players only on the server too (owner, 2026-09-30). Same PR.
- R2 The staff-code fallback redirect is broken. R3 A failed redemption burns the invite. Same PR.
- R6 and R10 Reset skips the password rules, and reset while signed in as someone else changes the wrong account. Same PR.
- R7 Raw zod text reaches users. The new screens clamp every field client-side first.
- R9 The pending screen and its copy describe an approval that no longer exists. The new screens have no pending step.
- R12 A failed assistant signup strands the account. The staff path now shows "staff access granted" only on real success.
- R13 The gate cookie is never cleared, and the IP buckets are tight for a team signing up on one campus network.

## Open questions for the owner

See PROGRESS.md Q-99. They cover:

- the rate-limit state the server cannot report;
- showing only the team's name before membership (no roster faces or counts);
- the empty-team state, which needs a count the player may not read yet.
