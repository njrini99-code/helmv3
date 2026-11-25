# 2026-11-24 — Sign up, team join and first-run onboarding, hardened

Branch: `agent/clubhouse-join-hardening`. Page: P015 Auth.

A coach hands out two team codes this week and players sign up on iPhone Safari. This change closes the dead ends
found in the sign-up, join and resume paths. No new screen and no new primitive: the existing questions, notices and
buttons say more, and a few questions are skipped when the account already answers them.

## What a player sees

- **Signing in mid-onboarding is never a dead end.** After "Account created but session could not be established",
  or when a player signs in on a phone that lost the draft, onboarding resumes at the first question the account does not
  already answer: the name, then the class, then Your game. It used to resume at Your game with no name and fail at the end with
  "First name is required". The account question is never asked again.
- **The team is named from the first question** when the link carries `?joinCode=`: "Player · Men's Golf", not
  "Player · GolfHelm". The server reads the team; a code that does not resolve is kept, and finishing says why.
- **Sign in keeps the team.** "Go to sign in" and "Already a member? Sign in" carry the code typed in sign up
  (`/golf/login?returnTo=/golf/join/<code>`), so signing in still lands the player on their team. An invite link's own
  returnTo is kept as it was.
- **"Account created but session could not be established"** now reads "Your account is ready. Sign in to finish joining
  your team." with the sign-in action.
- **A lost code grant** ("Your access code could not be verified. Please reload…") now says "We need to check your team
  code again. Your answers are saved." with "Check my code", which returns to the code question with the code filled in.
- **Waits keep their number** ("Please wait 57 seconds…", "try again in 12 minutes"); a stale deploy says to reload and
  that the answers are kept.
- **A pasted invite link in the code box** becomes the code it carries (as the join screen already did); spaces, dashes
  and case are dropped. The box takes a whole link, not 14 characters.
- **A code that matches nothing** also says to use the newest code if the coach made a new one.
- **Double taps** on Create account and Finish setup send once, even when both land before the button shows busy.
- **Finish setup with no name** goes to the name question instead of failing at the server.
- **The finish screen says why a player is not on the team**, and what to do:
  - already on another team: "You are already on Men's Golf… To move teams, leave your current team in Settings, or ask your
    coach to move you." (The one-team rule is unchanged: a second code never silently moves a player.)
  - a code that no longer matches: ask the coach for the new one, with "Enter a team code".
  - no code at all: "You're not on a team yet" with "Enter a team code", instead of a finish that looks complete.
- The join screen's "already on another team" notice says how to move.
- The email field turns autocorrect off (iPhone Safari).

## Server and address changes

- `/golf/join/[code]`: the address is cleaned to its letters and numbers before it feeds the sign-up and onboarding redirects,
  and both redirects encode it. A pasted `&`, `?` or malformed escape cannot add a parameter or throw.
- `/golf/player` reads `?joinCode=` on the server (`loadPlayerOnboard(joinCode)`) and names the team through
  `golf_team_by_join_code`.
- `completePlayerOnboarding` returns `joinError` (the server's own reason) next to `joinedTeam`.
- `processGolfTeamInvitation` takes a code in any case with spaces or dashes.
- `extractJoinCode` no longer throws on a malformed escape in a returnTo.

## Tests

`src/clubhouse/screens/onboard/__tests__/resume.test.ts`, `src/clubhouse/__tests__/onboard-resume.test.tsx`,
`src/clubhouse/data/__tests__/onboard-team.test.ts`, `src/app/golf/actions/__tests__/join-hardening.test.ts`,
`src/app/golf/actions/__tests__/player-onboarding-join-reason.test.ts`, `src/app/golf/join/[code]/__tests__/page.test.tsx`.
`onboard.test.tsx` CH-15011 now expects the sign-in link to carry the typed code.

## Rate limits on a shared network (owner-delegated default, 2026-11-24)

The code check and account creation were limited to 10 an hour per IP each, so one team on one campus network or carrier
NAT ran out after about ten players and the next was told their coach's code "didn't match".

- **Code checks** (`src/lib/golf/signup-gate.ts`, the check and the check before signup) are keyed on IP plus the
  normalised code (any case, spaces and dashes dropped). The same code from one IP has a budget of 60 an hour
  (`SIGNUP_SAME_CODE`), so a roster of 15 passes. Each new code an IP tries spends one slot of the old 10-an-hour guessing
  budget (`SIGNUP`), so trying many different codes from one IP is limited exactly as before; a refused code stays
  refused (a block is stamped on its own bucket), so asking again is not a free second lookup. A throttle still reads as
  "no match" (Q-99).
- **Account creation** (`signupAction`, `signupWithStaffInviteAction`) is 60 an hour per IP (`GOLF_SIGNUP`). When it is the
  throttled one, the message is "Too many sign-ups from this network right now. Please try again in <time>.", because the
  code has already matched by then.
- BaseballHelm's limits are unchanged.
- Mistyped codes from a room each count as a new code, so ten different typos from one network in an hour still use up
  the guessing budget; valid codes never do after their first use.
