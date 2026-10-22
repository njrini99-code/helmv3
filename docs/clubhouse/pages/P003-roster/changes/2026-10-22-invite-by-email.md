## 2026-10-22 — Invite players by email

```text
Design package: none (coach and player parity; QUEUE doc-60)
PR/commit:      claude/project-thread-a106un (#2334)
Contract IDs:   CH-3080 (30680), CH-3180 (30580), CH-3880 (31880), CH-3980 (30780) new
Actions:        emailPlayerInvites (new server action, roster_management; wrapped with withAdminObserved)
Data impact:    none: no migration. Reads golf_coaches, golf_teams (join_code, name). Sends through Resend after the owner's customer-email gate (`golf_player_invite`); nothing is stored about the invited addresses
Held items:     none
```

### Changed

- Invite players has an "Or email them" field under the team code and link: addresses typed or pasted become chips (comma, semicolon, space, Enter, paste; unreadable ones stay as red chips and hold Send; up to 10 a time), and one button sends the team's join link and code to all of them.
- `emailPlayerInvites(emails)` (`team-management.ts`): the coach's own cookie-aware team, zod and address validation, a per-coach limit of 10 requests an hour (`gateUserAction`), a team code required (it does not make one), and nothing about whether an address already has an account. The send leg is a plain `server-only` module (`src/lib/golf/player-invite-email.ts`), one message per player with a per-address-per-day idempotency key, behind `gateCustomerEmail`. It reports `paused`/`unconfigured` honestly instead of claiming a send.
- `ChRoster.emailInvites` (the owner's switch is on and a transport is set) decides whether the sheet shows the field or the one quiet line "Email invites are off for now" (CH-3980). Production's switch is off today, so production shows the line until the owner turns customer email on.
- Failed addresses stay in the box, marked, for another try; the ones that went are cleared; the receipt reads under the button.

### Why

- QUEUE doc-60: the invite sheet asked a coach to copy a code or a link and send it themselves; the action had always taken an email address it ignored (`invitePlayerToTeam(_email)`).

### Verification

- `roster-invite-email.test` (CH-3080, CH-3180, CH-3880, CH-3980), `email-player-invites.test` (action), `player-invite-email.test` (send leg), `golf-player-invite-template.test`, `invite-emails.test`; coverage-contract and feature-registry tests for the new wrapped action; `/clubhouse-preview/roster?state=invite-email&invite=1`.
