# Local check of the draft pin migration

Run on 3 Nov 2026 in a throwaway Postgres 16 with stand-ins for the Supabase pieces. Nothing touched staging or production, and the draft stays unapplied there.

```
createdb pins_check
psql -d pins_check -f 01-stub.sql
psql -d pins_check -f ../20261031150000_golf_conversation_pins.sql
psql -d pins_check -f 02-seed.sql
psql -d pins_check -At -f 03-check.sql
```

What passed:
- Three pins land at positions 0, 1, 2; a fourth raises `pin_limit` with the current list in DETAIL
- Pinning a pinned conversation again changes nothing and sends no broadcast
- Another team has its own three
- A conversation you aren't in raises `not_a_member`; a direct insert is refused (no write grant)
- Unpinning the middle one renumbers to 0, 1
- A reorder with a stale set raises `pins_changed`; the right set reorders
- Hiding a conversation, leaving it, or deleting it unpins it
- Seven changes sent seven broadcasts on `golf-pins:<A>`, each with only `{team_id}`; user B reads none of A's pins or broadcasts, and B's unpin of A's conversation does nothing to A
- `anon` can't call the functions
- Two devices pinning the third and fourth at the same moment: the second waited for the first (about 1.5 s here) and got `pin_limit` with the fresh list. Three pins, positions 0, 1, 2

The real check before apply is the pgTAP file in PIN-SYNC.md section 9, run with `npm run test:rls` against the local Supabase stack.
