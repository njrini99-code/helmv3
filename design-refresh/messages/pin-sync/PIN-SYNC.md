# Pin sync: pins on every device (PR 11h, held)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 10 edge-case rows and 5 tests).

Nick, 31 Oct: "pins sync is a go. Research how to do it". Then "Handle any other questions they have", so every open call below is settled as a default he can flip in one word. Each default says what changes if he does.

Status: designed, draft migration written and checked on a scratch database (`local-check/`). Never applied to staging or production. PR 11h is a draft PR that waits for the migration, which the owner applies after the first deploy, one held migration at a time, after the rename (memory, 28 Oct).

Files in this folder:
- `20261031150000_golf_conversation_pins.sql`: the draft migration. Header has apply, risk, order, VERIFY and ROLLBACK.
- `local-check/`: the scratch Postgres 16 run, with stand-ins for Supabase. Every case passed on 3 Nov.
- This file: how it works, the client, tests, rollout.

Until PR 11h lands, pins stay on the device (`pinned.ts`, 02-PLAN §3.3), exactly as PR 11b builds them. Nothing in 11a to 11g waits for this.

---

## 1. What the coach or player sees

- Pin a conversation on the iPhone and it shows pinned on the Mac within about a second, in the same order. Unpin it anywhere and it goes everywhere.
- Up to 3 pins per team. At 3, Pin in the row menu is dimmed and reads "Pin up to 3"; nothing unpins by itself.
- Pins are private. Teammates never see what you pinned.
- Leave or hide a conversation and it drops out of your pins. A conversation you're removed from does the same.
- Offline, a pin shows at once and is sent when the app is back. If another device got there first and you're over the limit, your pin comes back off with one line: "You already have 3 pinned."

The design page draws pins on the phone inbox (the Pinned card, `#inbox-phone-light`) and on the desktop rail (Pinned section, `#inbox-desk-light`). Sync changes nothing on screen: the same card, the same row menu. 05-SCREENS lists the pin states under `S-MSG.row-menu` (state `pinlimit`, drawn) and the not-drawn pin toasts ("You already have 3 pinned.", "You're not in this conversation anymore.", copy in section 5).

---

## 2. How others do it

| App | Where pins live | Limit | Order | Sync |
|---|---|---|---|---|
| Apple Messages (iOS 14 on) | Per account | 9 | Drag to reorder | Through Messages in iCloud, so every device signed in with it shows the same pins and order ([iDownloadBlog](https://www.idownloadblog.com/2020/07/22/pin-conversations-in-messages-iphone-ipad-tutorial/)) |
| WhatsApp | Per account | 3, raised to 5 in 2024 ([9to5Google](https://9to5google.com/2024/03/13/whatsapp-pin-chats-expansion/)) | Most recently pinned on top | Across linked devices |
| Telegram | Per account, per folder | 5 (more with Premium) | Explicit; the client sends the whole order with `messages.reorderPinnedDialogs` and the server replies with the full list ([Telegram API](https://core.telegram.org/method/messages.reorderPinnedDialogs.md)) | Server-side, pushed to every session |
| Slack | Per person, per workspace, as sidebar sections | none | Drag | Server-side ([Slack help](https://slack.com/help/articles/360043207674)) |

What we take from them:
- The server owns the list and every device reads it back (all four).
- A small limit keeps the Pinned card a glance, not a second inbox (WhatsApp, Telegram).
- Reorder sends the whole order, and a stale order is refused with the current list (Telegram).
- Pins are scoped to where you are: a workspace for Slack, a team for us.

---

## 3. Defaults Nick can flip

| # | Default | If flipped |
|---|---|---|
| D1 | 3 pins per team (the Pinned card fits 3 faces at 390 wide without scrolling) | `helm_private.golf_pin_limit()` returns the new number (position check allows up to 9); the phone card scrolls sideways past 4 |
| D2 | Pins are per team: a coach on two teams has 3 on each | Per account: scope on `user_id` alone, one list everywhere |
| D3 | Private, in their own table | none sensible: a pin on the participant row would show teammates what you pinned |
| D4 | A new pin goes to the end | To the front: insert at 0 and shift the rest (WhatsApp's way) |
| D5 | Leaving or hiding a conversation unpins it | Keep the pin and hide it until the conversation comes back |
| D6 | Pins already on a device move to the account once, the first time sync is on, up to the limit | Start empty on every device |
| D7 | At the limit, Pin is dimmed with "Pin up to 3"; nothing unpins by itself | Pinning a fourth unpins the oldest |
| D8 | The reorder function ships; dragging pins to reorder doesn't (not drawn, and the card is 3 faces) | Add drag on the Pinned card and the rail's Pinned section |
| D9 | The team channel can be pinned like any conversation | Team channel always first, outside the 3 |

---

## 4. Data

`public.golf_conversation_pins`

| Column | Type | Rule |
|---|---|---|
| `user_id` | uuid | references `auth.users`, on delete cascade |
| `conversation_id` | uuid | references `golf_conversations`, on delete cascade |
| `team_id` | uuid, nullable | the conversation's team, copied at pin time; null is its own scope |
| `position` | smallint | 0 first; check 0 to 8; always 0..n−1 with no gaps (renumbered after every unpin) |
| `pinned_at` | timestamptz | now() |
| primary key | (user_id, conversation_id) | one pin per conversation per person |

Indexes: (user_id, team_id, position) for the read; (conversation_id) for the cascade.

Why a table and not a column on `golf_conversation_participants`: `golf_participants_select_v2` lets members read each other's participant rows, so a pin there would be visible to the team. The table has one policy: you read your own rows. Nobody can insert, update or delete directly (no grants); every write goes through the two functions below, which check membership and the limit.

---

## 5. Writes

Two functions, both `SECURITY DEFINER`, `search_path = public, pg_temp`, executable by `authenticated` and `service_role` only.

`golf_pin_conversation(p_conversation_id uuid, p_pinned boolean) returns jsonb`
- Returns `{ team_id, pins: [conversation ids in order] }`, the full list after the change, so the client never guesses.
- Idempotent: pinning a pinned conversation, or unpinning one that isn't, changes nothing and sends nothing.
- Checks you're a participant and haven't hidden it. Unpinning a conversation you can no longer see still clears it.
- Takes a per-person-per-team advisory lock (`pg_advisory_xact_lock(hashtextextended('golf-pins:'||user||':'||coalesce(team,'none'), 0))`; the leave and hide triggers take the same lock before renumbering), then counts and inserts under it. Two devices pinning the 3rd and 4th at once: the second waits for the first and gets `pin_limit` (checked on 3 Nov: waited about 1.5 s, three pins at 0, 1, 2).
- Errors, as the exception message, with the current list as JSON in DETAIL where it helps:

| Message | When | Copy in the app |
|---|---|---|
| `not_signed_in` | no auth.uid() | none: the app is signing out |
| `invalid_arguments` | null id or flag | none: a bug, log it |
| `not_a_member` | not in it, or hidden it | "You're not in this conversation anymore." and the row drops |
| `pin_limit` | already 3 in that team | "You already have 3 pinned." The list in DETAIL replaces the local one |

`golf_reorder_conversation_pins(p_team_id uuid, p_order uuid[]) returns jsonb`
- `p_order` must be exactly the current set, each once. Otherwise `pins_changed` with the current list in DETAIL; the client re-applies its move to that list once, then gives up quietly.
- Writes positions from the array order and broadcasts only if the order changed.
- Ships now for D8; nothing calls it until drag is built.

---

## 6. Ordering and conflicts

- The server's list is the truth. Every write returns it, every refetch reads it.
- Last write wins per conversation. Pin and unpin of the same conversation from two devices: whichever commits last stands, and both devices converge on the broadcast that follows.
- Positions are dense (0..n−1). Unpin renumbers under the lock, so there's never a gap or a duplicate.
- Reorder is optimistic: if the set changed underneath it, it's refused (`pins_changed`), never half applied.
- The client applies its change at once (optimistic) and reconciles with the returned list. On any error it puts back the list from the error's DETAIL, or refetches.

---

## 7. Realtime

- Every change calls `realtime.send({team_id}, 'pins', 'golf-pins:'||user_id, true)`: a private broadcast on the person's own topic, payload only the team id. A failed send becomes a WARNING; it never fails the write.
- One policy on `realtime.messages`, `golf_pins_receive`: SELECT for authenticated when extension is broadcast and the topic is `golf-pins:` plus their own id. No INSERT policy: clients never send on these topics.
- The client joins with `config: { private: true }` after `setAuth()`, the same way `src/clubhouse/live/channel.ts` joins `golf-live:` (78–80), and refetches on `pins`.
- Why broadcast and not `postgres_changes`: DELETE events can't be filtered by user under RLS, and a refetch on a tiny "changed" signal is simpler and leaks nothing.
- PRECONDITION before production, as for 20261025050100: join `golf-pins:<id>` from a second client without `private` and confirm nothing arrives. The project can't go private-only (main has public `.channel(` uses), so this check is what keeps the topic closed.
- Fallback: refetch on window focus and on reconnect, so a missed broadcast heals the next time the app comes forward.

---

## 8. Edge cases

| Case | What happens |
|---|---|
| Leave a conversation (participant row deleted) | trigger `golf_participants_unpin_on_leave` removes the pin, renumbers, broadcasts |
| Hide it (`hidden_at` set) | trigger `golf_participants_unpin_on_hide` does the same (D5) |
| Conversation deleted | cascade removes the pin; the next refetch drops it (no broadcast; the inbox refresh already sees the deletion) |
| Account deleted | cascade |
| Switch team | the list is per team; the inbox reads the active team's pins |
| Offline pin | applied locally, queued, sent on reconnect; `pin_limit` on send reverts with the copy above |
| Device pins before sync (D6) | once per device, flagged in storage: send each local pin in order until `pin_limit`, then clear `pinned.ts` storage |
| Migration not applied yet | the probe answers "unavailable" (42P01 or the function missing) and the app keeps `pinned.ts`, remembered for 5 minutes like `conversation-hide.ts` |
| Migration rolled back | same as not applied: the probe fails and device pins take over |
| More than 30 rows on screen | unaffected: pins are one read, not a channel per row |

---

## 9. Client plan (PR 11h)

Files against main 75b4956. Nothing in shot tracking changes.

1. `src/clubhouse/screens/messages/use-conversation-pins.ts` (new)
   - Probe on mount: `select conversation_id, position from golf_conversation_pins where team_id = ? order by position`. On 42P01 or PGRST205 (missing table), use `usePinned()` from `pinned.ts` and remember "unavailable" for 5 minutes, the `conversation-hide.ts` pattern.
   - `pin(id)`, `unpin(id)`: optimistic, then `rpc('golf_pin_conversation', …)`; replace the list with the returned `pins`; on error map to the copy in section 5 and put back DETAIL's list.
   - Subscribe to `golf-pins:<uid>` (private) and refetch on `pins` when its `team_id` matches the active team. Leave on unmount.
   - Refetch on focus and on Realtime reconnect.
   - One-time import (D6) behind a storage flag `ch:msg:pins-imported:<viewer>:<team>`.
   - Returns the same shape as `usePinned()`, so `PhoneInbox` and `Rail` don't change.
2. `screens/messages/pinned.ts`: unchanged; it becomes the fallback.
3. `PhoneInbox` (MessagesPhone 246) and `Rail` (MessagesView 649): swap `usePinned()` for `useConversationPins()`. Row menu Pin is disabled with "Pin up to 3" when the list is full (D7).
4. `src/types/database.ts`: after the owner applies, run `npm run db:types` and drop the casts, as `conversation-hide.ts` did.
5. No server action needed: the RPC runs with the user's session.

---

## 10. Tests

- `supabase/tests/rls/golf_conversation_pins.sql` (pgTAP, `\ir _helpers.sql`, run with `npm run test:rls`): RLS on, one SELECT policy, no INSERT/UPDATE/DELETE grant to authenticated, both functions exist with EXECUTE for authenticated and not anon, `golf_pins_receive` exists with no INSERT policy, both triggers exist. Then the behaviour cases from `local-check/03-check.sql`, which already pass on a scratch database: limit, idempotent repeat, per-team scope, not a member, renumber, stale reorder, hide, leave, delete, another user sees nothing.
- `__tests__/use-conversation-pins.test.tsx` (vitest, fake Supabase): probe falls back on 42P01; optimistic pin then server list wins; `pin_limit` reverts and shows the copy; broadcast for another team is ignored; import runs once and stops at the limit; channel left on unmount.
- Playwright on staging, after the owner applies: two browser contexts signed in as the demo coach. Pin on one; the other shows it within 2 s without a reload. Unpin on the second; the first drops it. Hide on one; both drop it.
- Realtime precondition (section 7) as its own manual step in the PR body.

---

## 11. Rollout

1. PR 11h opens as a draft with the migration file and its HELD.md row. Not merged until the owner says.
2. After the first deploy, after the rename migration, the owner applies it alone: `npm run db:apply -- supabase/migrations/20261031150000_golf_conversation_pins.sql` with the held override, then every `-- VERIFY:` line.
3. Run the realtime precondition, then `npm run db:types`.
4. Merge PR 11h. With the table there, the hook switches from device to account pins by itself.

Order: after `20261008160000` (hidden_at, applied 2026-10-21). Independent of every other held migration. It uses `realtime.send`, which is in production since 20261025050100 (applied 2026-10-25).

HELD.md row to add in the PR:

| File | Status | Why | Date |
|---|---|---|---|
| `20261031150000_golf_conversation_pins.sql` | **WRITTEN — HOLD — NOT APPLIED** | Clubhouse Messages pins on every device (Nick, 31 Oct: "pins sync is a go"). Adds `golf_conversation_pins` (own-row read, no write grants), `golf_pin_conversation` and `golf_reorder_conversation_pins` (membership, limit 3 per team under an advisory lock), two AFTER triggers on `golf_conversation_participants` that unpin on leave and hide, and the `golf_pins_receive` policy for the private topic `golf-pins:<user>`. **PRECONDITION**: a public subscriber on `golf-pins:<id>` receives nothing. **What would go wrong**: the two triggers sit on the participant delete and hide path; each does one indexed delete and swallows broadcast errors, so a leave or hide can't fail because of pins. **Risk low. Order**: after 20261008160000. Checked on a scratch Postgres 16 with stand-ins (`design-refresh/messages/pin-sync/local-check/`); run `npm run test:rls` before applying. Owner applies. | 2026-10-31 |

Rollback is in the migration header (one transaction: drop the policy, the two triggers, the functions, the table). The app falls back to device pins by itself.

---

## 12. PR 11h done when

- Every case in section 10 passes, and the Playwright two-device check passes on staging after the owner applies.
- With the table missing, the inbox behaves exactly as 11b (device pins), and no request errors reach the console.
- SHARED-8 and SHARED-9 hold: draft PR behind a flag, the migration listed as held, nothing applied by the agent.

## Completeness pass, 4 Nov 2026

Additions to sections 6, 8 and 9. Nothing above changes; D1 to D9 stand.

| Case | What happens |
|---|---|
| Messages flag off | 11h does nothing: no probe, `pinned.ts` only (05 completeness, the lane flag) |
| First sync on a device that already has server pins | Server list first; this device's pins are appended in their order, skipping ones already pinned and ones the viewer is no longer in, until the cap; then `pinned.ts` storage clears |
| Import results | `pin_limit` and `not_a_member` during the import are silent: no toast |
| Import interrupted (offline, error) | The storage flag `ch:msg:pins-imported:<viewer>:<team>` is set only after the import ends cleanly, so it runs again next time; already-sent pins are skipped as "already pinned" |
| Two devices at the cap, each pinning a different conversation | The lock serialises them; the second gets `pin_limit`, reverts its optimistic pin and shows "You already have 3 pinned."; both converge on the broadcast |
| Offline pin queue | In memory only, one op per conversation (the last tap wins), sent in order on reconnect; lost on reload, where the server list rules. The cap check offline uses the local count |
| Held migration not yet run | Each device keeps its own pins (11b behaviour); nothing on screen says pins don't sync; after the owner applies, the next probe (the 5 minute "unavailable" memory runs out) switches to the server and runs the import once |
| Removed from a pinned conversation by a coach | The leave trigger unpins and broadcasts; the pin fades and the others close up (M-MSG-CP-18) |
| Loading | The Pinned card waits for the probe up to 1500ms; after that it shows device pins and the server list replaces them by the M-MSG-CP-18 motion when it lands, never by a one-frame swap |
| VoiceOver at the cap | "Pin, dimmed, Pin up to 3" |

Tests to add to section 10: import appends after server pins with no duplicates; import is silent; interrupted import retries; offline queue keeps the last op per conversation; the Messages flag off makes no request to the table.
