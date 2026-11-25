# P015-auth — Changelog

## 2026-11-24 — Sign up, team join and first-run onboarding, hardened

```text
Design package: none (behavior of existing screens)
PR/commit: agent/clubhouse-join-hardening
Contract IDs: none
Actions: onboarding.completePlayerOnboarding returns joinError; teams.processGolfTeamInvitation cleans the code
Data impact: none (no migration, no data written beyond what sign up already writes)
Held items: none
```

### Changed

- A resumed sign-in picks up at the first question the account does not answer (name, class, game), names the team from
  `?joinCode=`, and never asks for the account again; the finish screen says why a player is not on the team and what to do.
  Details are in `docs/clubhouse/changes/2026-11-24-join-hardening.md`.
