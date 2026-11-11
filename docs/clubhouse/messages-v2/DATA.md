# Messages v2: data audit, privacy review and migration plan

Docs only. Nothing here was applied. Read-only SQL ran on **staging**
(`ybmwektreyrwjscxlogv`) only; production (`qmnssrrolpinvwjjnufo`) was never
queried. Every "production" verdict below is inferred from
`supabase/migrations/HELD.md` and the migration files, and is marked **per
HELD.md, live unverified**. Date of audit: 2026-11-07. Design source:
`design-refresh/messages/redesign/clubhouse-messages.html` (cited `H:<line>`).
Earlier pass: `design-refresh/messages/03-DATA-CHECKS.md` (still accurate on
most rows; drift noted in "Doc drift").

Viewer in the design is a coach (`ME`). Where a player would see something
different, it is called out.

## 0. Read this first

1. **Three RLS/grant holes on staging look exploitable and matter more than any
   redesign feature** (section 3). Found by reading `pg_policies` and
   `information_schema.column_privileges`; **not exercised** because this audit
   was read-only. Confirm each in a rolled-back transaction on the local Docker
   stack before treating it as proven.
   - `golf_participants_update` has `WITH CHECK (user_id = auth.uid())` only,
     and `authenticated` holds UPDATE on **every** column including
     `conversation_id`. A user can probably re-point their own participant row
     at any conversation UUID and then read its messages
     (`golf_messages_select_v2` = `conversation_id IN user_conversation_ids()`)
     and its storage objects. The 2026-08-07 tenant-isolation fix
     (`20260807030000`) closed the INSERT path only.
   - `golf_conversations_update_v2` lets any participant rewrite `created_by`,
     `team_id`, `is_team_chat`, `is_team_channel`. `created_by` is what grants
     add/remove-member rights (`golf_participants_insert_v2`,
     `golf_participants_delete`, `loadGolfGroupIOwn` at
     `src/app/actions/messages.ts:1842-1878`).
   - `golf_messages_update_v2` has `WITH CHECK (sender_id = auth.uid())` only,
     and table-wide UPDATE is granted to `authenticated`, so `conversation_id`,
     `created_at` and `reply_to_id` are writable. A sender can probably move or
     back-date their own message.
   - Only `hidden_at`, `notification_level`, `muted_until`, `last_read_at` on
     participants and `updated_at` on conversations are ever written by the app
     (greps below), so column-level grants are a safe fix.
2. **`get_golf_conversations_with_details` returns `participant_names` as
   `users.email`** for every participant of every conversation the caller is in
   (SECURITY DEFINER). Any teammate, minors included, can call the RPC and get
   every co-participant's email. The Golf hook ignores the field
   (`use-golf-messages.ts:1787-1793` sets `[]`), so a fix is invisible to the
   app.
3. **Unread is computed two ways.** The RPC's `unread_count` counts
   `golf_messages.read = false`, one shared flag per message, so in a group the
   first reader clears everyone's unread. The badge
   (`src/lib/golf/unread-message-count.ts`) and the client's G-40 recompute
   (`use-golf-messages.ts` ~1812-1900) use per-user `last_read_at`, which is
   right.
4. **Read-receipt visibility is a UI gate only.** `golf_read_marks_visible` is
   correct (own; the other person in a 2-person thread; team staff coaches who
   are participants), but `golf_participants_select_v2` lets every member read
   every other member's `last_read_at`, `muted_until`, `notification_level`,
   `hidden_at`, and the table is in the realtime publication, so they are pushed
   live. `SEEN_BY_VISIBILITY = 'sender-and-coaches'`
   (`src/lib/golf/message-receipts.ts:82`) only hides it in the UI.
5. **Typing runs on a public, unauthenticated broadcast topic**
   `golf-conversation:<conversation uuid>` (`use-golf-messages.ts:965`,
   `:1100-1115`; `use-typing-by-conversation.ts`). `realtime.messages` has
   policies only for `golf-live:*` and `golf-pins:<uid>`. Anyone holding a
   conversation UUID and the anon key can listen, and anyone can spoof `{userId,
   isTyping}`.
6. **Pins exist on staging, not production.** `golf_conversation_pins` + two
   RPCs + two triggers + `golf_pins_receive` came from
   `20261031150000_golf_conversation_pins.sql` (HELD: WRITTEN, NOT APPLIED). The
   app already probes for it and falls back to device-local pins. There is **no
   pgTAP test** for it (`supabase/tests/rls` has none), and HELD.md says to run
   `npm run test:rls` first.

## 1. Verdict summary

Staging and production verdicts are separate. Production is **per HELD.md, live
unverified**.

| # | Need | Staging | Production | Biggest gap |
| --- | --- | --- | --- | --- |
| 1 | Pinned conversations | SUPPORTED | MISSING (server); device-local fallback works | Promote migration; "team channel first" is a client rule |
| 2 | Reactions (six kinds, many per user) | SUPPORTED | SUPPORTED | None for data; tooltip names come from the directory |
| 3 | Poll voters, multi, close, change vote | SUPPORTED | SUPPORTED | "Hasn't voted" is shown to every viewer |
| 4 | Seen-by, per-message times, DM "Seen 8:15 AM" | SUPPORTED (coach view) | SUPPORTED (coach view) | Players cannot get per-reader times by design; `last_read_at` leaks |
| 5 | Mute, 3 durations, expiry, row icon | SUPPORTED | SUPPORTED | Mute state visible to teammates |
| 6 | Typing presence | PARTIAL | PARTIAL | Public topic, spoofable, 30-channel cap |
| 7 | Media and files | PARTIAL | PARTIAL | No thumbnail batch for 3-column tiles; deleted media stays in storage |
| 8 | Class status in DM details | PARTIAL | PARTIAL | Today only; "Next: Monday 9:05 AM" has no source |
| 9 | Unread counts, Mark as unread | PARTIAL | PARTIAL | RPC unread wrong for groups; Mark as unread device-local |
| 10 | Search (inbox, in-conversation) | PARTIAL | PARTIAL | In-conversation search filters a global top 50 |
| 11 | Failed send, retry without double-post | SUPPORTED | SUPPORTED | None |
| 12 | Edit, delete for everyone, reply quote | SUPPORTED | SUPPORTED | Attachments survive delete |
| 13 | Members, Coach/Captain, Add, Show all | PARTIAL | PARTIAL | Captain has no source; Add is creator-only |
| 14 | Delete conversation (hide), Suggested | SUPPORTED | SUPPORTED | None |
| 15 | Drafts, starters | SUPPORTED (client only) | SUPPORTED (client only) | Drafts per tab, not per account |
| 16 | Realtime membership and RLS | PARTIAL | PARTIAL | Section 3 holes; `read_marks` not published |

Counts. **Staging: 9 SUPPORTED, 7 PARTIAL, 0 MISSING.** **Production: 8
SUPPORTED, 7 PARTIAL, 1 MISSING** (pins). Sub-items that are MISSING outright:
Captain tag (13), next class (8), server-side Mark as unread (9), DM receipt
toggle (privacy).

---

## 2. Needs, one by one

Format: Design / Today / Verdict / Change.

### 1. Pinned conversations

- **Design.** Pinned card on phone, "Pinned" section on desktop; the team
  channel is the first pin; "Pin up to 3" shown dimmed on the row menu when at
  the limit (`H:3399`, `H:1641-1690`). Pin label is the first name or "Team"
  (`H:1451-1470`).
- **Today.**
  - Staging: `golf_conversation_pins(user_id, conversation_id, team_id, position
    smallint 0..8, pinned_at)`, PK `(user_id, conversation_id)`, SELECT-own RLS,
    no write grants for `authenticated`. Writes only via
    `golf_pin_conversation(p_conversation_id uuid, p_pinned boolean) returns
    jsonb` and `golf_reorder_conversation_pins(p_team_id uuid, p_order uuid[])
    returns jsonb` (both SECURITY DEFINER, `search_path=public, pg_temp`). Limit
    `helm_private.golf_pin_limit() = 3` per user per team, under an advisory
    lock. Triggers `golf_participants_unpin_on_hide` and `..._on_leave` unpin.
    Change nudge is a private broadcast `golf-pins:<uid>` (policy
    `golf_pins_receive`). The table is deliberately **not** in the realtime
    publication.
  - Client: `src/clubhouse/screens/messages/use-conversation-pins.ts:73` (read),
    `:86` (RPC), `:153` (private channel); device fallback `pinned.ts:11`
    (`PIN_LIMIT = 3`, `ch:msg:pinned:<viewer>:<team>`), with a one-time import
    of device pins.
  - **Per user per team**: yes (`team_id` copied from the conversation at pin
    time).
  - **"Team channel always first"** is not in the data. `golf_pins_list` orders
    by `position`, and a new pin goes to the end.
    `get_golf_conversations_with_details` already sorts `is_team_channel DESC`,
    so the client can force the team channel first without SQL.
- **Verdict.** Staging SUPPORTED. Production MISSING on the server (HELD row
  `20261031150000`: "WRITTEN, NOT APPLIED"); the app degrades to device pins.
- **Change.** Promote `20261031150000` with **no new SQL**, after writing
  `supabase/tests/rls/golf_conversation_pins.sql`. Decide whether the team
  channel is an implicit pin (see Q1). Default: it is an ordinary pin the client
  sorts to position 0 and pre-pins on first load, and it counts toward the 3,
  which matches the design ("team + up to 2 more").

### 2. Reactions

- **Design.** Six kinds `like, love, laugh, party (Celebrate), wow (Surprised),
  thanks` (`H:1322`); badges per kind with a count only above 1 and
  `title="Like: You, Maya"` (`H:1532-1541`); a user may hold several kinds on
  one message (`react()` `H:2323`); double-tap on a bubble toggles Like
  (`H:2223`).
- **Today.** `golf_message_reactions(id, message_id, user_id, emoji text,
  created_at)`, UNIQUE `(message_id, user_id, emoji)` (so many kinds per user is
  native), `emoji` CHECK length 1..16. Policies: SELECT/INSERT require
  `golf_conversation_has_me(message.conversation_id)`, INSERT also `user_id =
  auth.uid()`, DELETE own rows only, no UPDATE policy. In the publication. Kinds
  map to emoji in `src/hooks/golf/use-message-reactions.ts:10-16` (👍 ❤️ 😂 🎉 😮
  🙏). Insert/delete at `:155-156`; realtime on `golf-reactions:<conv>` is
  unfiltered table-wide (`:129-130`) and refetches. Staging data: 👍 44, ❤️ 11, 😂
  6, 😮 2, 🎉 1; no stray emoji.
- **Verdict.** Staging SUPPORTED, production SUPPORTED (shipped 2026-09-04,
  reconstructed by `20260904103000` / `20260908160000`).
- **Change.** None for data. "Who" in the tooltip comes from `user_id` joined to
  the directory, so a person who left the team shows as "Member". Optional:
  CHECK `emoji IN (six)` (staging is clean; production unverified, add `NOT
  VALID` then validate). Note for privacy: every member sees who reacted
  (section 5).

### 3. Poll voters

- **Design.** "Poll · Choose any / Choose one"; voter face stack and count per
  option; "Most votes" chip on a strict leader; footer "N votes · Closes Sunday
  8 PM"; **See votes** sheet grouped by choice with a % bar; **Hasn't voted** =
  team members minus voters minus coaches; "Draft a reminder" (`H:1543-1556`,
  `H:2336`, `H:2430-2447`, `H:2455`).
- **Today.**
  - A poll is a `golf_messages` row, `kind='poll'`, `payload = {v:1, question,
    options[{id:'o1'..,label}], multi, closes_at, closed_at}`; options 2..6,
    question 1..140, label 1..60 (trigger `golf_messages_poll_freeze`).
    `closes_at` max 30 days out (`src/lib/golf/message-polls.ts`
    `POLL_MAX_DAYS`).
  - Votes: `golf_message_responses(message_id, user_id, choice text, created_at,
    updated_at)`, UNIQUE `(message_id, user_id)`. `choice` is the picked option
    ids joined by commas (`encodeChoice`, `message-polls.ts:145`), so one row
    per person and a vote change is an UPDATE. Trigger
    `golf_message_responses_poll_guard` (SECURITY DEFINER, `search_path=''`)
    enforces: conversation member, not deleted, not closed (`closed_at` set or
    `closes_at <= now()`), ids exist, single-choice has one id.
  - Close: sender `UPDATE payload` (`message-polls.ts` action `closeGolfPoll`),
    allowed by `golf_messages_update_v2`; the freeze trigger lets only
    `closed_at` change, once.
  - RLS on responses: SELECT = any conversation member (all voters, all
    choices); INSERT own + member; UPDATE own + member; DELETE own.
  - "Hasn't voted" is client-computed: `pollWaiting(tally, memberIds)`
    (`message-polls.ts:231`). The list renders for **every viewer**
    (`polls.tsx:472-474`, section at `:521-530`); only the Remind button is
    coach-gated (`:231-233`). The design additionally drops coaches from the
    list (`polls.tsx:473` already does).
- **Verdict.** Staging SUPPORTED, production SUPPORTED (HELD rows
  `20261024090000`, `20261025020000/050/100/200`, `20261028140800` all APPLIED).
- **Change.** No schema change for the design. UI: gate "Hasn't voted" and the
  reminder to coaches (recommendation in section 5). Server-side hiding of
  voters from players needs a policy change (section 5, decision Q3).

### 4. Seen-by and read receipts

**Plain answer: a per-participant `last_read_at` (a high-water mark) can only
say "latest read". It cannot produce per-message times.**
`golf_conversation_participants.last_read_at` is one timestamp that moves
forward. To say "Maya saw message 7 at 7:06 AM" you need to know when Maya's
mark first passed message 7. That is what `golf_conversation_read_marks` is for.

- **Design.** Group: face stack + "Seen by 5 of 8", "Seen by everyone",
  "Delivered" when nobody; sheet "Seen" with a time per reader ("7:06 AM") and
  "Not seen yet / Hasn't opened this chat" (`H:1449`, `H:1557-1566`,
  `H:2448-2454`). DM: "Seen 8:15 AM", "Seen Wednesday", "Delivered"
  (`H:1451-1500`, `receipt:` fields).
- **Today.**
  - `golf_conversation_read_marks(id bigint, conversation_id, user_id, read_at,
    is_baseline)`: an append-only log with one row each time a person's
    `last_read_at` advanced past at least one new message from someone else
    (trigger `golf_participants_read_mark` -> `golf_record_read_mark()`, which
    also clamps a forged future `last_read_at` to `now()` and deletes marks
    older than 120 days). One baseline row per participant read in the last 30
    days (unique index `uq_golf_read_marks_baseline`). Only SELECT is granted to
    `authenticated`; no write policy.
  - `golf_message_seen_times(p_message_id uuid) returns table(user_id, seen_at,
    exact)`: SECURITY **INVOKER**, STABLE, `search_path=public, pg_temp`. For
    each reader: the **first** mark at or after the message's `created_at`,
    excluding the sender, only for messages up to **30 days old**. `exact = NOT
    is_baseline`, so a time that comes from a baseline row is flagged inexact.
    Index `idx_golf_read_marks_conv_read_at (conversation_id, read_at) INCLUDE
    (user_id, is_baseline)`. Client: `fetchSeenTimes`
    (`use-golf-messages.ts:241-262`); ordering and rows in
    `src/lib/golf/message-receipts.ts` and `seen-by.tsx`.
  - Visibility: SELECT policy `golf_read_marks_visible(conversation_id,
    user_id)` = own, **or** (caller is a participant **and** (the conversation
    has exactly 2 participants **or** the caller is staff coach of the
    conversation's team)). So a **player in a group gets no per-reader marks**;
    a coach sees all; the other person in a DM sees the counterpart's.
  - "Seen by N of M": the count under the carrier comes from marks (coach) or
    `participants.last_read_at` (everyone, because participants rows are
    readable by all members).
  - "Delivered" means only that the server stored the message. There is no
    per-recipient delivery state or ack.
  - "Seen Wednesday" for older DM messages: the 30-day window and the 120-day
    mark retention bound this. Beyond 30 days there is no per-message time, only
    "Seen".
- **Verdict.** Staging SUPPORTED for the coach view; production SUPPORTED per
  HELD row `20261025010000` (APPLIED 2026-10-25; the row's last date cell still
  says "not applied", a stale cell, see Doc drift).
- **Change.** No schema for the design. Close the `last_read_at` leak (section
  5, migration M3 of the privacy split). Players seeing "Seen by 5 of 8" without
  a list is today's `sender-and-coaches` behaviour and stays.

### 5. Mute

- **Design.** Quick action "Mute" opens a menu: `For 8 hours`, `For a week`,
  `Until I turn it on`; details line "Junior · Demo University Golf · Muted";
  bell-off icon beside the row name (`H:2652-2661`, `H:1621-1626`,
  `H:1695-1727`).
- **Today.** `golf_conversation_participants.notification_level`
  (`all|mentions|muted`, CHECK) and `muted_until timestamptz`, own-row UPDATE
  (`golf_participants_update`). `setGolfConversationMute(conversationId, muted,
  hours)` (`src/app/golf/actions/message-mute.ts:81`) writes `muted_until =
  now()+hours` or null; hours 8 and 168 map to the first two choices and `null`
  to "Until I turn it on". Expiry is evaluated at read time
  (`message-mute.ts:37-40`, `use-row-mutes.ts` `isMutedRow`), no job needed.
  Notification fan-out honours it (`golf-message-fanout.ts`
  `isConversationMuted`). Row icons: `useRowMutes` reads the viewer's own
  participant rows (`use-row-mutes.ts:20-32`).
- **Verdict.** SUPPORTED on both. Migration
  `20260907120000_golf_participants_mute_columns` is not in HELD.md and the
  feature is live in Fairway, so it is applied (per HELD.md, live unverified).
- **Change.** None for data. Caveat: any conversation member can read your
  `notification_level`/`muted_until` (section 5).

### 6. Typing presence

- **Design.** Dots bubble in the thread with the typer's first name inside the
  bubble in groups; dots replace the preview on the inbox row and in the pin
  bubblet; 5 s timeout (`H:1578-1584`, `H:1621-1626`, `H:1656`, `H:3157`).
- **Today.** No table. Supabase broadcast event `typing` with payload `{userId,
  isTyping}` on public topic `golf-conversation:<id>`, throttled to one per 500
  ms (`use-golf-messages.ts:1100-1115`). The open thread listens (`:1033-1062`,
  expiry option `typingExpiryMs`, default 3000 ms, Clubhouse passes 5000). Rows
  and pins: `use-typing-by-conversation.ts` joins up to `TYPING_CHANNEL_CAP =
  30` channels, skips the open one, expires each typer after `TYPING_EXPIRY_MS =
  5000`.
- **Verdict.** PARTIAL on both: it works, it is not authenticated, and the
  30-channel cap leaves rows 31+ without dots.
- **Change.** M4: a new **private** topic `golf-typing:<conversation_id>` with
  `realtime.messages` SELECT and INSERT policies gated on
  `golf_conversation_has_me`, and a client switch. A new name is needed because
  the old topic also carries `postgres_changes` for older Fairway clients.
  Optional: one multiplexed topic per user (`golf-typing-user:<uid>`) fed by a
  server-side fan-out to lift the 30 cap; not recommended now.

### 7. Media and files

- **Design.** Details: "Photos and files", 6 three-column photo tiles, "See
  all", file rows "PDF - 212 KB - Thursday"; photo and file messages in the
  thread; video shows "Video - 0:42" (`H:1707-1727`, `H:1458-1500`).
- **Today.**
  - `golf_message_attachments(id, message_id, file_name, file_type, mime_type,
    file_size, storage_path, url, thumbnail_url, width, height,
    duration_seconds, ...)`. Policies: SELECT = conversation participant and
    message not deleted; INSERT/DELETE = sender of the message. Trigger keeps
    `golf_messages.has_attachments`.
  - Bucket `golf-attachments`: private, 100 MB limit, mime allow-list (images
    incl. heic, video, audio, pdf, Office, text, csv). Storage policies:
    SELECT/INSERT require `(storage.foldername(name))[2] IN
    user_conversation_ids(auth.uid())` (second folder = conversation id);
    UPDATE/DELETE = `owner = auth.uid()`.
  - Signing: server action `createSignedUrl(path, 3600)`
    (`src/app/golf/actions/message-attachments.ts:402`, `:675`;
    `src/lib/storage/attachments.ts:529`). One-hour URLs, no refresh except
    re-fetch.
  - Files list: `getGolfConversationFiles(conversationId)`
    (`message-attachments.ts:556`) returns up to **100** rows (id, messageId,
    name, mime, size, sentAt, senderId) from participants only, deleted messages
    excluded; **no URLs and no thumbnails**. `files.ts:20-50` opens a file by
    signing through `attachments(messageId)` per tap.
  - Photo tiles therefore need one signed URL per tile: N calls.
    `thumbnail_url`, `width`, `height` columns exist but the list does not
    return them.
  - Video duration: `duration_seconds` is stored (03-DATA-CHECKS notes
    `Messages.tsx` drops it in `loadAttachments`; that is a mapping fix, no
    SQL).
- **Verdict.** PARTIAL on both.
- **Change.** App: add a batched `getGolfConversationMedia(conversationId,
  limit=6)` that returns signed thumbnail URLs in one server call (no SQL). Keep
  3600 s. Delete-for-everyone should also remove the storage object (the sender
  already has `golf_attachments_owner_delete`); today `deleteMessage` clears
  `content` and sets `is_deleted` only, so the file and its path stay and a
  previously signed URL lives up to an hour.

### 8. Class status for players in DM details

- **Design.** Details card "Class status": "No classes today. Next: Monday 9:05
  AM, Statistics" (`H:1707`).
- **Today.** P-10 class awareness. `golf_team_class_day(p_team_id uuid, p_on
  date) returns jsonb` (SECURITY DEFINER, coach-checked, authenticated) and
  `golf_my_class_day(p_on date)` for the player's own day. Internals
  `golf_class_blocks_internal` and `golf_class_day_players_internal` are not
  granted to `authenticated`. Sharing is gated by
  `golf_player_shares_class_status(p_team_id, p_player_id)`. Client:
  `class-thread.ts` `directClassPlayer` + `threadClassSection` (primary line,
  "Today: ...", note) and the coach-only group line `group-class.ts`. Players
  never get a status in Messages (`class-thread.ts` header comment).
- **What is missing.** The RPC answers one calendar day. "Next: Monday 9:05 AM,
  Statistics" needs the next block after now on a later day, with the class
  label.
- **Verdict.** PARTIAL on both (today yes; next class MISSING).
- **Change.** M6: `golf_player_next_class(p_team_id uuid, p_player_id uuid,
  p_from timestamptz default now()) returns jsonb`, SECURITY DEFINER,
  coach-checked, honouring `golf_player_shares_class_status`, returning
  `{starts_at, ends_at, label, kind}` for the next block within 14 days or
  `null`. Format in the team's timezone on the client.

### 9. Unread counts

- **Design.** Row unread dot and bold preview; "N unread - N conversations"
  (`H:1634`, `H:1641-1690`); nav badge (bell shows 2); jump key with an unseen
  count while scrolled up (`H:1960-1967`, `H:2164`); row menu "Mark as unread"
  (`H:3400`).
- **Today.**
  - Row unread: RPC `unread_count` (shared `golf_messages.read` flag, wrong for
    groups) replaced client-side by a per-viewer recompute from `last_read_at`
    for groups (G-40, `use-golf-messages.ts` ~1441-1483, ~1812-1900) and a
    per-conversation count query for the rail (`~1715-1770`); this is an N+1.
  - Badge: `countUnreadMessages` (`unread-message-count.ts`) per-conversation
    `count` after `last_read_at`, skipping hidden conversations; 45 s poll, no
    refetch after markRead (bug M3, still true).
  - Mark read: RPC `mark_golf_messages_read(p_conversation_id)` sets the shared
    `read` flag; `markMessagesAsRead` (`src/app/actions/messages.ts:684`) sets
    `last_read_at`.
  - Jump key unseen count: client state only (`thread` `unseen`), no data need.
  - Mark as unread: **device-local** (`marked-unread.ts`, `ch.msg.unread.<user>`
    in localStorage). A server version cannot lower `last_read_at` (it would
    corrupt other people's Seen by), so it needs its own private own-row field.
- **Verdict.** PARTIAL on both.
- **Change.** M3 fixes the RPC to count from `last_read_at` and returns one
  query for the whole rail. Server-side Mark as unread is optional (Q4); default
  is to keep it device-local.

### 10. Search

- **Design.** Inbox "Search" over conversation names and message text;
  in-conversation Search from details and the thread bar (`H:1641-1690`,
  `H:1720-1727`); "message hits" list.
- **Today.** Name matches are client-side over loaded conversations. Messages:
  `searchGolfMessages(query, teamId?)` (`src/app/actions/messages.ts:1483` impl;
  exported ~`1703`): `ilike '%q%'` on `content`, `is_deleted=false`, scoped to
  the **caller's own participant conversations** (hidden ones only if a newer
  message arrived, so bug M1 is fixed), `limit(50)`, min 2 chars, escapes LIKE.
  Poll messages are searchable through the `content` fallback text.
  `MessageHits` (`message-hits.tsx:~20-40`) does the in-conversation search by
  filtering the global top 50 on the client, so an old hit can be pushed out by
  50 newer hits in other conversations. The `.in('conversation_id', ids)` list
  grows with conversation count (URL length risk). No index on `content`;
  `pg_trgm` is installed on staging.
- **Verdict.** PARTIAL on both.
- **Change.** M7: `golf_search_messages(p_query text, p_conversation_id uuid
  default null, p_limit int default 50)` SECURITY INVOKER (RLS already limits to
  member conversations), applying the hidden-conversation rule in SQL. Add a
  trigram index only if measured slow (staging has 83 messages, so nothing to
  measure yet).

### 11. Failed send ("Not delivered - Try again")

- **Design.** `H:1593`.
- **Today.** Idempotent. The client generates a UUID (`generateClientMessageId`,
  `use-golf-messages.ts:~410-430`, validated `z.string().uuid()`), sends it as
  `clientMessageId`, and the server writes it as the real `golf_messages.id`. A
  retry that races a committed insert hits the primary key (23505) and the
  action reports success. `retryMessage` reuses the same id (`:~1230-1260`). One
  automatic transport retry (`withOneTransportRetry`). Failed rows are kept
  client-side, marked `sendFailed` with an outcome `unknown|refused`. Polls do
  the same with `priorClientId` for edited drafts (`message-polls.ts:175`).
  Attachments take `clientMessageId` too (`message-attachments.ts:335`).
- **Verdict.** SUPPORTED on both. There is no separate `client_id` column and
  none is needed.
- **Change.** None. Copy only ("Not delivered", "Try again").

### 12. Edit, delete for everyone, reply quote

- **Design.** "Edited" marker; Delete menu item then toast "Deleted for
  everyone" (`H:2296-2310`); reply quote above the bubble (`H:1590`).
- **Today.** `golf_messages.edited_at`, `is_deleted`, `reply_to_id` (FK `ON
  DELETE SET NULL`). `updateMessage` (`src/app/actions/messages.ts:1238`):
  sender only, 1..5000 chars, sets `edited_at`. `deleteMessage` (`:1327`):
  sender only, sets `is_deleted=true`, `content=''`, and `payload=null` for
  polls (CHECK `golf_messages_payload_matches_kind` allows it since
  `20261028140800`). Realtime UPDATE removes it for everyone
  (`applyRealtimeMessageUpdate`). A deleted message is excluded from previews,
  unread and search. Reply: `reply_to_id`, index `golf_messages_reply_to_idx`.
- **Verdict.** SUPPORTED on both.
- **Change.** App: also delete storage objects on delete-for-everyone (see 7).
  Section 3 hardening limits what the UPDATE policy lets a sender change.

### 13. Group members and roles

- **Design.** Members card with "Coach" and "Captain" tags, quick action
  **Add**, "Show all N" after six (`H:1695-1727`).
- **Today.** Members come from participants + the directory
  (`loadMessagesDirectory`, `src/clubhouse/data/messages.ts`). Coach tag =
  directory `role === 'coach'` (`details-v2.tsx:185`). **No Captain field
  exists** (`golf_team_members`, `golf_players`, `golf_coaches` have no
  captain/role column; only `golf_team_coach_staff.role`). Add:
  `getGolfGroupAddCandidates` / `addGolfGroupMember`
  (`src/app/actions/messages.ts:2019`, `:2086`) insert into participants;
  allowed only for team group chats (`is_team_chat` and `team_id`) and **only
  the creator** (`loadGolfGroupIOwn`, `:1867-1875`, mirrored in
  `golf_participants_insert_v2` / `golf_participants_delete`). A DM's membership
  is fixed.
- **Verdict.** PARTIAL on both. Captain MISSING.
- **Change.** Do not build Captain (Q5). Who may add: keep creator-only; this
  makes section 3 item 2 (rewrite `created_by`) important to fix.

### 14. Delete conversation, Suggested

- **Design.** Row menu "Delete conversation" (danger); New message "Suggested -
  Players you haven't messaged" (`H:3400`, `H:1732-1745`).
- **Today.** Per-person hide: `golf_conversation_participants.hidden_at`,
  own-row UPDATE (`conversation-hide.ts:100`); a team channel cannot be hidden;
  a newer message brings the conversation back (RPC and search apply this rule);
  hiding unpins. Migration `20261008160000` APPLIED 2026-10-21 (HELD.md row
  196). Suggested is client-derived: directory minus people with an existing
  direct thread (`MessagesPhone.tsx:954`, `NewMessagePane.tsx:70-73`).
- **Verdict.** SUPPORTED on both. Note `conversation-hide.ts` header still says
  the column is held (comment drift).
- **Change.** None.

### 15. Drafts and starters

- **Design.** Starters are static (`H:1601`).
- **Today.** Drafts: `DraftStore` (`drafts.ts:1-53`) in `sessionStorage` keyed
  `ch.msg.drafts.<user>`, so per tab and cleared on tab close. Starters:
  `COACH_STARTERS` / `PLAYER_STARTERS` (`HelloCard.tsx:6-7`), fill the field,
  never send.
- **Verdict.** SUPPORTED, client only.
- **Change.** None. Cross-device drafts would need the private state table (Q4);
  not recommended.

### 16. Realtime publication and RLS, table by table

`supabase_realtime` on staging contains these messaging tables: `golf_messages`,
`golf_message_reactions`, `golf_message_responses`,
`golf_conversation_participants`, `golf_conversations`. **Not published:**
`golf_conversation_read_marks` (derived on the client from the participants
UPDATE), `golf_conversation_pins` (private broadcast instead),
`golf_message_attachments`, `golf_message_mentions`. Typing is broadcast only.

RLS (from `pg_policies`, staging):

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `golf_messages` | member (`conversation_id IN user_conversation_ids()`); `admin_read_all` = `is_admin()` | sender = me and member | `golf_messages_update_v2`: `sender_id = me` (USING and WITH CHECK). **Any column.** | `golf_messages_delete`: `sender_id = me` (hard delete allowed) |
| `golf_conversations` | member, or team channel/chat of a team I coach or play on | `team_id IS NULL OR is_golf_team_coach OR is_golf_team_player` | `golf_conversations_update_v2`: member. **Any column, incl. `created_by`, `team_id`, `is_team_chat`.** | none |
| `golf_conversation_participants` | own row or any row in a conversation I am in (so `last_read_at`, `muted_until`, `notification_level`, `hidden_at` of everyone) | `golf_participants_insert_v2`: self-join into creator's conversation or a team chat of my team; creator adding a team member to a team chat | `golf_participants_update`: `user_id = me`. **Any column incl. `conversation_id`.** | self, or creator removing another from a team chat |
| `golf_conversation_read_marks` | `golf_read_marks_visible` (own; 2-person counterpart; team staff coach who is a participant) | none (trigger only) | none | none (trigger only) |
| `golf_conversation_pins` | own rows | none (RPC only) | none | none |
| `golf_message_reactions` | member of the message's conversation | own + member | none | own |
| `golf_message_responses` | member of the message's conversation (all voters) | own + member + poll guard trigger | own + member + guard | own |
| `golf_message_attachments` | participant and message not deleted | sender of the message | none (trigger `update_updated_at`) | sender of the message |
| `golf_message_mentions` | member | sender of the message | none | none |
| `realtime.messages` | `golf_live_receive` (`golf-live:*`), `golf_pins_receive` (`golf-pins:<me>`) | none for messaging | | |
| `storage.objects` (`golf-attachments`) | folder[2] in my conversations | folder[2] in my conversations | `owner = me` | `owner = me` |

Grants: `anon` holds full table privileges (incl. TRUNCATE, TRIGGER) on
`golf_messages`, `golf_conversation_participants` and `golf_conversations`; RLS
(`auth.uid()` based) is what keeps anon out, and the project's own queue already
revokes `anon` on other golf tables (HELD "Tier 1", step 4). `authenticated`
holds full privileges on messages, reactions, responses, and participants. Read
marks and pins are SELECT-only for `authenticated`.

---

## 3. Security holes found during the audit (fix before shipping new surface)

Evidence: `pg_policies`, `information_schema.column_privileges` (UPDATE granted
to `authenticated` and `anon` on every column of the three tables), and the
client write sites (below). **Unverified by exploit; the verifier must reproduce
on the local stack.**

| # | Hole | Impact | Fix |
| --- | --- | --- | --- |
| H1 | Participants UPDATE can change `conversation_id` (and `user_id`, `joined_at`, `id`) | Likely read of another conversation's messages and files by UUID; minors' DMs | M1: table-level REVOKE UPDATE, column GRANT of the four state columns, plus an immutability trigger |
| H2 | Conversations UPDATE can change `created_by`, `team_id`, `is_team_chat`, `is_team_channel`, `title` | A member takes over a team group: add/remove members, re-label a DM as a team chat | M2: column GRANT `updated_at` (plus `title` only if a rename UI exists) |
| H3 | Messages UPDATE can change `conversation_id`, `created_at`, `reply_to_id`, `kind`, `pinned_*` | Move or back-date own message; kind guarded for polls only | M2: column GRANT of `content, edited_at, is_deleted, payload, has_attachments, read, notify_anyway, notify_anyway_pushed_at`; immutability trigger on `conversation_id, sender_id, created_at, id` |
| H4 | `get_golf_conversations_with_details` returns co-participants' emails | Email disclosure to minors' teammates | M3 |
| H5 | `anon` has table privileges on the three tables | Defence in depth only | M1 and M2 revoke |
| H6 | Typing on a public topic | Presence snooping and spoofing | M4 |

Write-site evidence (greps over `src`): participants are updated only for
`hidden_at` (`conversation-hide.ts:76`), `notification_level, muted_until`
(`message-mute.ts:60`) and `last_read_at` (`src/app/actions/messages.ts:684`);
conversations only `updated_at` (`message-attachments.ts:286`,
`message-polls.ts:130`, `messages.ts:1228`); messages `payload`
(`message-polls.ts:164`), `has_attachments` (`message-attachments.ts:274`),
`notify_anyway_pushed_at` (`golf-message-fanout.ts:193`),
`content/edited_at/is_deleted` (`messages.ts:1238`, `:1327`) and `read` (RPC,
DEFINER). Before M1/M2 run the same greps for `rpc`, scripts and `service_role`
writers; service_role is unaffected by column grants.

---

## 4. Privacy review (many players are minors)

There is no parent/guardian table or role on staging
(`information_schema.tables` for `%parent%`/`%guardian%` is empty), so parents
have **no** access path in this schema; nothing below applies to a parent role.
Recommendations are defaults; owner decisions are in "Open data questions".

| Topic | What it does today | Recommendation |
| --- | --- | --- |
| Who sees read receipts and per-reader times | DB: `golf_read_marks_visible` = self, 2-person counterpart, team staff coaches who are participants. App: `SEEN_BY_VISIBILITY='sender-and-coaches'` (`message-receipts.ts:82`): coach sees count and list, a player sees the count on their own messages only. **Gap:** every member can read every member's `golf_conversation_participants.last_read_at` and gets it pushed in real time (`use-golf-messages.ts:677`, `:1017-1030`), so "Seen by N of M" and "last opened at" are derivable by any player. | Keep the app policy. Fix the data path: M5 moves per-person state off the shared row (decision Q2). Until then, treat player-visible receipts as best-effort. Players never see a per-reader list. |
| DM receipts off switch | None. A 2-person DM counterpart sees marks by design (the `count = 2` branch). A coach-to-player DM and a player-to-player DM behave the same. | Do not add a toggle for coach<->player threads (safeguarding: staff must be able to tell a message was read). For player<->player DMs show "Seen" without a time and no toggle; if a toggle is wanted it needs the private state table (Q2). Default: no toggle in v2. |
| Non-anonymous poll voters | `golf_message_responses` SELECT = any member, so teammates see who voted for what; the design shows faces on every option. | Keep non-anonymous for team polls (it is the product), but state it in the New poll sheet ("Everyone in this chat sees how people voted"). For a stricter tier (Q3): SELECT own + poll sender + staff coach, and an RPC `golf_poll_tally` returning counts and, for coaches, voters. |
| "Hasn't voted" and the reminder | Client-computed from members minus voters. The list renders for every viewer; Remind is coach-gated. | **Coach-only**: render the section and the button only for `role === 'coach'`. A player can still derive it from responses (all visible), so true enforcement depends on Q3. The reminder stays a draft the coach sends. |
| Class status shown in a DM | Coach-only: `golf_team_class_day` is coach-checked; `golf_player_shares_class_status` gates per player; Messages gives a player no class status; class names appear only in the coach's private Details panel, never in the thread header, and the group line shows no names (`class-thread.ts`, `group-class.ts`). | Keep as is. M6 (next class) must carry the same two checks and be refused for a non-coach caller. Never render class status in a group Details member list. |
| Typing presence | Public topic, unauthenticated, spoofable `userId`. | M4: private topic with a membership policy. Do not join typing channels for conversations the viewer has hidden. Muting does not need to change typing. |
| Reactions reveal who | `golf_message_reactions` SELECT = any member; the tooltip lists names. | Keep: same as iMessage/Slack. For minors in a team channel this is the same audience as the messages themselves. No change. |
| Mute state visibility | `notification_level`/`muted_until` on the shared participant row, readable by members and pushed live. | M5 or accept (low severity). The pins migration header gives the same reason for keeping pins off that row: "other members can read your participant rows (golf_participants_select_v2), so a pin there would show teammates what you pinned". Same reasoning applies to mute, hide and last-read. |
| Search scope | `searchGolfMessages` filters to the caller's own participant conversations (and RLS on `golf_messages` independently enforces membership); hidden conversations excluded until a newer message. The `.in()` list can grow. Poll fallback text is searchable. | Keep. M7 moves it into one INVOKER function so RLS is the only scope. Nothing reaches conversations the user is not in, assuming H1 is closed. |
| Photo storage and signing | Private bucket; policy requires the conversation in `user_conversation_ids(auth.uid())`; signed URLs last 3600 s; deleted-for-everyone messages leave the object in storage. | Keep 3600 s. Delete the object on delete-for-everyone. H1 must be closed first because the storage policy trusts participant rows. Do not log signed URLs. |
| Emails in the conversation RPC | `participant_names` = `users.email` for every participant. | M3 blanks it. |

---

## 5. Migrations

Rules respected: forward-only, `golf_*` tables only, RLS on, no secrets,
`lock_timeout` set, `-- VERIFY:` lines as in the repo's existing migrations,
apply through `npm run db:apply -- <file>` (never by the agent). Newest file in
the repo is `20261105100000_golf_players_coach_reads_inactive_members.sql` (not
yet in staging's ledger). New timestamps start at `20261107090000`. Order
matters: security first.

### M1. `20261107090000_golf_participants_column_grants.sql` (new; pgTAP required)

- **Purpose.** Close H1 and H5 for participants.
- **Tables/columns.** none added.
- **Grants.**

  ```sql
  REVOKE UPDATE ON public.golf_conversation_participants FROM authenticated, anon;
  GRANT  UPDATE (last_read_at, notification_level, muted_until, hidden_at)
         ON public.golf_conversation_participants TO authenticated;
  REVOKE ALL ON public.golf_conversation_participants FROM anon;
  ```

- **Trigger (belt and braces).** BEFORE UPDATE, SECURITY INVOKER,
  `search_path=''`:

  ```sql
  CREATE FUNCTION public.golf_participants_identity_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
  BEGIN
    IF (SELECT auth.role()) IS NULL OR (SELECT auth.role()) = 'service_role' THEN RETURN NEW; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
      RAISE EXCEPTION 'A participant row cannot be moved' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
  ```

- **RLS.** unchanged.
- **Indexes/publication/backfill.** none.
- **Rollback.** `GRANT UPDATE ON ... TO authenticated, anon; DROP
  TRIGGER/FUNCTION`.
- **pgTAP.** Yes: a member cannot change `conversation_id` (expect 42501), still
  can set `last_read_at`, mute, hide; `anon` cannot select.

### M2. `20261107090100_golf_conversations_messages_column_grants.sql` (new; pgTAP required)

- **Purpose.** Close H2, H3, H5.
- **Grants.**

  ```sql
  REVOKE UPDATE ON public.golf_conversations FROM authenticated, anon;
  GRANT  UPDATE (updated_at) ON public.golf_conversations TO authenticated;   -- add title only if a rename UI exists
  REVOKE UPDATE ON public.golf_messages FROM authenticated, anon;
  GRANT  UPDATE (content, edited_at, is_deleted, payload, has_attachments, read,
                 notify_anyway, notify_anyway_pushed_at)
         ON public.golf_messages TO authenticated;
  REVOKE ALL ON public.golf_conversations, public.golf_messages FROM anon;
  ```

  Check the `pinned_at/pinned_by` writer first (the columns exist; no `src`
  writer was found in this audit's grep; if a pin-message feature exists
  elsewhere, add them to the grant).
- **Trigger.** BEFORE UPDATE on `golf_messages`: `id, conversation_id,
  sender_id, created_at, reply_to_id` immutable for non-service callers (same
  pattern; sits beside `golf_messages_poll_freeze`).
- **RLS.** unchanged (policies still apply).
- **Rollback.** Restore table-level UPDATE; drop the trigger.
- **pgTAP.** Yes: a member cannot change `created_by/team_id/is_team_chat` or a
  message's `conversation_id/created_at`; the poll close, edit, soft delete and
  `has_attachments` flows still pass (reuse fixtures from
  `golf_poll_payload_freeze.sql`).

### M3. `20261107090200_golf_conversation_list_rpc_privacy.sql` (new; pgTAP recommended)

- **Purpose.** Stop the email leak (H4) and compute unread per person.
- **RPC.** `CREATE OR REPLACE FUNCTION
  public.get_golf_conversations_with_details(p_user_id uuid)`: **same signature
  and return columns** (no DROP, so the Golf hook and older clients keep
  working). SECURITY DEFINER stays (it reads other participants and users),
  `search_path=public` as today. Changes:
  - `participant_names` -> `ARRAY[]::text[]` (the Golf hook ignores it; Baseball
    uses a different RPC).
  - `unread_count` -> `COUNT(*) FROM golf_messages m WHERE m.conversation_id =
    c.id AND m.sender_id <> v_uid AND NOT COALESCE(m.is_deleted,false) AND
    m.created_at > COALESCE(cp.last_read_at, '-infinity')`, which is what the
    badge already does.
  - keep `cp.hidden_at` logic and `ORDER BY c.is_team_channel DESC NULLS LAST,
    c.updated_at DESC`.
- **Index.** Existing `idx_golf_messages_conversation_created (conversation_id,
  created_at DESC)` serves it.
- **Rollback.** Re-apply the body from
  `20261008160000_golf_conversation_hidden_at.sql` (the current function; copy
  it into the rollback file).
- **Needs** app check that nothing reads `participant_names` for Golf (grep
  found only `use-messages.ts`, the non-Golf hook, and a literal `[]`).

### M4. `20261107090300_golf_typing_private_topic.sql` (new; pgTAP/realtime two-client test required)

- **Purpose.** Authenticated typing.
- **Function.** `public.golf_typing_topic_allowed(p_topic text) returns
  boolean`, SECURITY DEFINER, STABLE, `search_path=public, pg_temp`: match
  `^golf-typing:<uuid>$`, return `public.golf_conversation_has_me(<uuid>)`.
  DEFINER because membership reads `golf_conversation_participants` and
  `realtime.messages` policies must not recurse into RLS.
- **Policies.**

  ```sql
  CREATE POLICY golf_typing_receive ON realtime.messages FOR SELECT TO authenticated
    USING (extension = 'broadcast' AND public.golf_typing_topic_allowed((SELECT realtime.topic())));
  CREATE POLICY golf_typing_send ON realtime.messages FOR INSERT TO authenticated
    WITH CHECK (extension = 'broadcast' AND public.golf_typing_topic_allowed((SELECT realtime.topic())));
  ```

- **App.** Switch hook and `use-typing-by-conversation.ts` to
  `channel('golf-typing:<id>', {config:{private:true}})` after `setAuth` (as
  `use-conversation-pins.ts:153` does). Leave the old topic until Fairway ships
  the same change.
- **Precondition (copy from the pins migration).** Join the topic without
  `config.private` from a second client and confirm nothing arrives.
- **Rollback.** Drop the two policies and the function.

### M5. Pins: `20261031150000_golf_conversation_pins.sql` (promote, no new SQL)

- **Status.** On staging already. HELD row: WRITTEN, NOT APPLIED on production.
  Order: after `20261008160000` (applied) and `20261025050100` (applied).
  Independent of M1-M4, but apply M1 first so `golf_participants_unpin_on_*`
  triggers sit on a table with the hardened grants.
- **Contents (for review).** Table above (section 2.1),
  `helm_private.golf_pin_limit/lock/compact/list/broadcast`,
  `golf_pin_conversation`, `golf_reorder_conversation_pins`, triggers
  `golf_participants_unpin_on_hide` / `_on_leave`, policy `golf_pins_receive`.
- **Needs.** `supabase/tests/rls/golf_conversation_pins.sql` written first:
  own-row read only; no INSERT/UPDATE/DELETE for `authenticated`; limit 3 per
  team -> `pin_limit`; non-member -> `not_a_member`; hide and leave unpin; a
  second user cannot read or reorder another's pins.
- **Rollback.** In the file header (drops policy, triggers, functions, table);
  the app falls back to device pins by itself.

### M6. `20261107090400_golf_player_next_class.sql` (new; pgTAP required)

- **Purpose.** "Next: Monday 9:05 AM, Statistics".
- **Signature.** `public.golf_player_next_class(p_team_id uuid, p_player_id
  uuid, p_from timestamptz DEFAULT now()) RETURNS jsonb`.
- **Security.** SECURITY DEFINER (it calls `golf_class_blocks_internal`, which
  `authenticated` cannot execute), `SET search_path = public, pg_temp`; first
  lines: `IF NOT public.is_golf_team_coach(p_team_id) THEN RAISE ... 42501; IF
  NOT public.golf_player_shares_class_status(p_team_id, p_player_id) THEN RETURN
  NULL;`.
- **Body sketch.** Iterate `d` from the team-local date of `p_from` for 14 days,
  call `golf_class_blocks_internal(p_team_id, d, p_player_id)`, return the first
  `starts_at > p_from` as `{starts_at, ends_at, label, kind}`, else `NULL`.
- **Grants.** `REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO
  authenticated`.
- **pgTAP.** Non-coach refused; player with sharing off gets null; wrong team
  refused.

### M7. `20261107090500_golf_search_messages.sql` (new, optional; pgTAP recommended)

- **Purpose.** Scope search in SQL; fix in-conversation search and the
  URL-length risk.
- **RPC.** `public.golf_search_messages(p_query text, p_conversation_id uuid
  DEFAULT NULL, p_limit int DEFAULT 50) RETURNS TABLE(message_id uuid,
  conversation_id uuid, sender_id uuid, content text, created_at timestamptz)`,
  SECURITY **INVOKER** (RLS on `golf_messages` is the scope),
  `search_path=public, pg_temp`, `length(trim(p_query)) >= 2`, escapes `%_\`,
  joins the caller's own participant row for the hidden-conversation rule,
  `ORDER BY created_at DESC LIMIT least(p_limit, 100)`.
- **Index (only if measured).** `CREATE INDEX CONCURRENTLY ... ON golf_messages
  USING gin (content gin_trgm_ops) WHERE NOT is_deleted;` (`pg_trgm` is
  installed on staging; confirm on production).
- **Optional in the same file or separate.** `ALTER TABLE golf_message_reactions
  ADD CONSTRAINT golf_message_reactions_kind CHECK (emoji IN
  ('👍','❤️','😂','🎉','😮','🙏')) NOT VALID;` then `VALIDATE` after a production
  check (staging is clean).
- **Rollback.** Drop function, index, constraint.

### M8. Decision-gated: `20261107090600_golf_conversation_member_state.sql` (not recommended now)

- **Purpose.** Private per-person state that teammates must not read:
  `marked_unread_at`, later `last_read_at`, `notification_level`, `muted_until`,
  `hidden_at` (the real fix for the leak in section 4).
- **Sketch.**

  ```sql
  CREATE TABLE public.golf_conversation_member_state (
    user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.golf_conversations ON DELETE CASCADE,
    marked_unread_at timestamptz,
    PRIMARY KEY (user_id, conversation_id));
  ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ... FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
  ```

- **If the whole split is chosen.** It is a three-step change: create and
  dual-write with a backfill; switch readers (Seen-by, mute, hide, badge,
  `golf_record_read_mark`, `golf_read_marks_visible`, G-40) and verify with a
  two-client Realtime test that peers receive nothing; then null out and stop
  publishing the old columns. Realtime `postgres_changes` does not give
  column-level filtering, so a column REVOKE alone is not a safe substitute.
  Treat as its own project.
- **Default:** do not build; keep Mark as unread device-local; accept the
  participant-row exposure with M1 and the UI gates.

### Order, ledger and checks

| Order | File | Status | Production | pgTAP / `npm run test:rls` |
| --- | --- | --- | --- | --- |
| 1 | `20261107090000_golf_participants_column_grants.sql` | new | needed | yes |
| 2 | `20261107090100_golf_conversations_messages_column_grants.sql` | new | needed | yes |
| 3 | `20261107090200_golf_conversation_list_rpc_privacy.sql` | new | needed | recommended |
| 4 | `20261107090300_golf_typing_private_topic.sql` | new | needed | two-client Realtime test |
| 5 | `20261031150000_golf_conversation_pins.sql` | **promote, no new SQL** (staging only today) | needed | yes, write it first |
| 6 | `20261107090400_golf_player_next_class.sql` | new | needed for "Next:" | yes |
| 7 | `20261107090500_golf_search_messages.sql` | new, optional | optional | recommended |
| 8 | `20261107090600_golf_conversation_member_state.sql` | decision-gated | no | yes if built |

Staging-only objects that production lacks: `golf_conversation_pins`,
`golf_pin_conversation`, `golf_reorder_conversation_pins`, the
`helm_private.golf_pin*` helpers, the two unpin triggers, `golf_pins_receive`.
Everything else the redesign reads from is applied on production per HELD.md.

---

## 6. Open data questions (with a default)

| # | Question | Default |
| --- | --- | --- |
| Q1 | Is the team channel an implicit, un-unpinnable first pin (counts toward the 3) or an ordinary pin? | Ordinary pin the client sorts first and pre-pins once; limit stays 3. No SQL change. |
| Q2 | Move last-read, mute and hide off the shared participant row into a private table (M8 split)? | No for v2. Ship M1-M4, keep the coach-only receipt UI. Revisit if a player-visible receipt feature is added. |
| Q3 | Should players see who voted for what in a poll? | Yes (design), with a one-line notice on the New poll sheet. Coach-only "Hasn't voted". |
| Q4 | Server-side Mark as unread and cross-device drafts? | No. Keep device-local; both would need the private state table. |
| Q5 | Captain tag? | Do not build. There is no source field and a tag with no meaning is worse than none. |
| Q6 | DM read-receipt toggle? | None in v2. Coach<->player threads always show receipts to the coach. |
| Q7 | Show seen times older than 30 days? | No. Show "Seen" without a time beyond 30 days (current function limit). |
| Q8 | Drop emails from the conversation RPC now (M3) before the redesign? | Yes. It is invisible to the app. |
| Q9 | Add `title` to the conversations column grant (group rename)? | No rename UI exists in `src`; leave it out and add if a rename ships. |
| Q10 | Lift the 30-channel typing cap? | No. Rows past 30 show the preview. |

---

## Doc drift worth fixing

- `HELD.md` row for `20261025010000_golf_conversation_read_marks.sql` says
  **APPLIED 2026-10-25** in the status cell but its last date cell still reads
  "2026-10-25, not applied".
- `use-golf-messages.ts:241-246` and the header of `conversation-hide.ts` still
  say their migrations are held; both are applied (`20261025010000`,
  `20261008160000`).
- `03-DATA-CHECKS.md` bug **M1** ("search has no `hidden_at` check") is fixed in
  `searchGolfMessagesImpl`.
- `03-DATA-CHECKS.md` says pins are device-only; the staging database and
  `use-conversation-pins.ts` already have the server table and RPC path.
- The brief named `src/clubhouse/data/message-*.ts` and `conversation-hide.ts`;
  the real files are in `src/app/golf/actions/` (`message-attachments.ts`,
  `message-mute.ts`, `message-polls.ts`, `conversation-hide.ts`, `messages.ts`)
  and `src/app/actions/messages.ts`.

---

## Appendix A. Read-only SQL run (staging `ybmwektreyrwjscxlogv` only)

All SELECT / catalog. Key statements:

```sql
-- tables
select table_name from information_schema.tables where table_schema='public'
  and (table_name ilike 'golf%messag%' or table_name ilike 'golf%conversation%' or ...);
-- columns, constraints, indexes, triggers
select table_name, string_agg(column_name||' '||data_type||..., E'\n' order by ordinal_position)
  from information_schema.columns where table_schema='public' and table_name in (...9 tables...) group by 1;
select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where conrelid::regclass::text in (...);
select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in (...);
select c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname in (...);
-- policies, grants, column privileges
select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename in (...);
select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='realtime' or (schemaname='storage' and (qual ilike '%attachments%' or ...));
select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and table_name in (...) and grantee in ('anon','authenticated','service_role') group by 1,2;
select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema='public' and table_name in ('golf_conversation_participants','golf_conversations','golf_messages') and grantee in ('authenticated','anon') and privilege_type='UPDATE';
-- functions
select proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), prosecdef, proconfig::text, has_function_privilege('authenticated',p.oid,'execute') from pg_proc p join pg_namespace n ... where proname ilike '%conversation%' or ...;
select pg_get_functiondef(p.oid) from pg_proc p where proname in ('golf_message_seen_times','golf_read_marks_visible','golf_record_read_mark','golf_pin_conversation','golf_messages_poll_freeze','golf_message_responses_poll_guard','get_golf_conversations_with_details','mark_golf_messages_read','golf_live_topic_allowed', 'user_conversation_ids','golf_conversation_has_me');
select ... from pg_proc p join pg_namespace n ... where n.nspname='helm_private' and proname ilike '%pin%';
select proname, ... from pg_proc ... where proname ilike 'golf%class%';
-- publication, storage, ledger, data shape
select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' and (tablename like 'golf_conv%' or tablename like 'golf_mess%');
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
select version, name from supabase_migrations.schema_migrations where version >= '20261031000000' order by version;
select extname from pg_extension where extname in ('pg_trgm','pg_cron');
select emoji, count(*) from golf_message_reactions group by 1;
select table_name, column_name from information_schema.columns where table_name in ('golf_team_members','golf_players','golf_coaches','golf_team_coach_staff') and (column_name ilike '%captain%' or ...);
```

## Appendix B. Key results (staging, 2026-11-07)

- Publication `supabase_realtime`: `golf_conversation_participants`,
  `golf_conversations`, `golf_message_reactions`, `golf_message_responses`,
  `golf_messages`.
- `realtime.messages` policies: `golf_live_receive`, `golf_pins_receive`. No
  typing policy.
- Storage `golf-attachments`: private, 104857600 bytes, policies
  `golf_attachments_participant_select/insert`,
  `golf_attachments_owner_update/delete`.
- Staging ledger newest versions: `20261031150000 golf_conversation_pins`
  through `20261105090000 golf_player_hub_events_class_rows`; `20261105100000`
  is in the repo only.
- `get_golf_conversations_with_details` (staging body): `unread_count` =
  `COUNT(*) ... m.read=FALSE AND m.sender_id!=v_uid`; `participant_names` =
  `COALESCE(u.email,'Unknown')`; hidden rule on `cp.hidden_at`.
- `golf_message_seen_times` is `LANGUAGE sql STABLE`, SECURITY INVOKER, window
  `m.created_at >= now() - interval '30 days'`.
- Pins: `golf_pin_limit() = 3`; `position CHECK 0..8`; table SELECT-only for
  `authenticated`.
