# 2026-10-25 — Messages: poll held migrations and checks (P-2 slices 7, 8)

## 2026-10-25 — The database side of "closed means closed", written and held

```text
Design package: P-2 build plan, 8.3 to 8.7, 8.9, 11.5, 11.6, 13;
                CHANGELOG-2026-10-25 P-02 (Held B and C, 020050, S-6, S-15)
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   none new (CH-7029 and CH-7030 now name the guard's refusals)
Actions:        deleteMessage (a golf poll's payload is cleared with its text)
Data impact:    none until the owner applies the held files
Held items:     20261025020050, 20261025020100, 20261025020200 (new);
                20261025020000 (VERIFY lines rewritten)
```

### Added

- Held `20261025020100_golf_poll_vote_guard.sql` (OQ-68, owner default yes):
  a `SECURITY DEFINER` trigger with `search_path = ''` on poll votes, EXECUTE
  revoked from PUBLIC, anon and authenticated. A caller who is not in the
  poll's conversation gets 42501 on a vote, a change or a take-back, so a
  former member can no longer take back a vote; a deleted, closed or ended
  poll, and a choice the poll does not offer, are refused with HINTs.
  pgTAP plan 17.
- Held `20261025020200_golf_poll_payload_freeze.sql` (OQ-68): a poll is sent
  only in payload v1 shape and never changes after, except `closed_at` set
  once and the app's own soft delete (`is_deleted` true, content kept or
  `''`, payload kept or NULL). An undelete is refused; a deleted poll stays
  as it was deleted. pgTAP plan 15.
- Held `20261025020050_golf_message_responses_updated_at.sql` (recommended):
  the vote's `updated_at` is the database clock (`touch_updated_at()`), so
  vote times can come back to See votes once it is applied. pgTAP plan 4.
- Desired-schema mirrors for all three in `supabase/schemas` and a
  `HELD.md` row each.
- `e2e/clubhouse-polls.spec.ts` (local Supabase only): create, vote, change,
  Remind, close, Share result, a keyboard-only pass and the 44 px phone
  targets. Written, not run.
- The preview's travel group gains a closed multi-answer poll beside the open
  van poll.

### Changed

- `deleteMessage` reads `kind` for golf and, for a poll, also sets
  `payload: null`; baseball and non-poll messages are unchanged.
- The vote hook reads the guard's `golf_poll_deleted` as its own reason: the
  CH-7030 toast says "This poll was deleted." A former member's 42501 is the
  CH-7029 toast, as before.
- `20261025020000`: its VERIFY lines are `select 1 where …`, so each can
  fail; the S-15 order note and its HELD row were already in.
- On the house rules the Clubhouse guards hold: See votes' faces take the
  `sm` avatar step; the earlier-copy notice's Done is the primary key, and
  the footer's Send poll is secondary while that notice shows; the
  phone composer's "+" is an `IconButton` menu trigger; the card and choice
  outlines are `--ch-hairline-w`.

### Verification

- `use-message-responses.test.tsx` (the deleted and former-member refusals),
  `messages.test.tsx` (CH-7030 deleted, CH-7029 former member).
- pgTAP `golf_poll_vote_guard.sql`, `golf_poll_payload_freeze.sql`,
  `golf_message_responses_updated_at.sql`: written, not run (no local
  Supabase stack in this session); run `npm run test:rls` before applying.
