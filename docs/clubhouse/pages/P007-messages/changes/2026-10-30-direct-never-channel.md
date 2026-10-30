# 2026-10-30 — A message for one person never lands in a channel or group

## 2026-10-30 — Direct threads resolve to a real one-to-one thread (F-0003, F-0004)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0003 S0 and
                F-0004 S0; fix plan PR 1)
PR/commit:      claude/audit-fix-01-deploy-blockers
Contract IDs:   CH-7002 (unchanged meaning: starting a direct thread fails),
                CH-7015 (unchanged)
Actions:        createConversation / createGolfConversation (server, shared
                with Fairway)
Data impact:    none (no migration, no data change); a DM that used to be
                answered with a shared channel or group now creates a new
                two-person conversation
Held items:     a reused DM the viewer had hidden (hidden_at) is not cleared
                on the server; it opens through the CH-7015 path as before
```

### Changed

- Server: `createConversation` (golf, one person) reuses a conversation only
  when it is on this team, is neither the team channel nor a team chat, and has
  exactly two members; the newest by `updated_at` wins. Otherwise it creates
  one. It used to take any conversation the two shared (`limit(1)`, no
  filter), so the Team Channel came back. It now returns `reused`.
- Client: `ChConv` carries `channel` (from `is_team_channel`, now passed
  through `useGolfConversations`), and `directWith()` in `model.ts` finds the
  one-to-one thread at the three call sites (prefill, `startDirect`, the New
  message sheet). A team of one player has a two-person channel, which by count
  alone looked like a DM.
- Client, second line: `startDirect` refuses an answer the list knows as a
  group or the channel (CH-7002 toast, no draft landed, the sheet stays open).

### Why

- A player's "To: Coach" was sent into the Team Channel, and a coach's Start
  conversation closed the sheet and opened nothing (the channel was already
  open beside the rail). Privacy defect; blocks the first deploy because
  Fairway (live) calls the same action.

### Verification

- `src/app/actions/__tests__/create-conversation-direct.test.ts` (new, 4
  cases), `wiring-p007-messages.test.tsx` (F-0003, 2 cases) and
  `messages.test.tsx` (F-0004, 3 cases): red on `main` 720962bc4, green after.
- All Clubhouse Messages suites and `src/hooks/golf` pass (632 tests).
- No visual change: no screenshots.
