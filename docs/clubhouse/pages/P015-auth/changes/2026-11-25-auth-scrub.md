# P015-auth — Changelog

## 2026-11-25 — Auth scrub: sign-in, sign-up, team join and reset

```text
Design package: none (correctness audit)
PR/commit: agent/auth-scrub
Contract IDs: none
Actions: loginAction, signupAction, completePlayerOnboarding, completeCoachOnboarding
Data impact: sign-up stores the team code on the account (user_metadata.join_code)
Held items: supabase/migrations/20261125130000_golf_auth_integrity.sql
```

### Changed

- A player who signed up with a team code and then signs in somewhere
  else (another phone, after confirming the email, or days later) now
  finishes onboarding on that team. Sign-up stores the code on the
  account and onboarding reads it when the link has none. Before, they
  finished with no team (live on staging, 2026-11-25).
- Sign in counts only a wrong password toward the lockout. An
  unconfirmed email, the auth server's throttle and an outage each say
  what happened. The per-network limit now fits a whole team signing in
  on one campus network.
- A staff code whose invite was used or has expired creates no account.
  It used to create a coach login with no program.
- New-program setup refusals link to the page that works (the dashboard,
  or the approval page). The "name already taken" message points to the
  head coach's staff invite, not a team code.
- Opening a reset link while someone else is signed in on the device
  signs them out properly first: their push token, server session,
  offline cache and active team.
- A coach login cannot become a player through a player's invite link.
