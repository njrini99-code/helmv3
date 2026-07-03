## Messaging [both]

End-to-end audit of `/golf/dashboard/messages` for both coach and player roles.
Audited 2026-06-20.

### Routes / entry points audited
- `/golf/dashboard/messages` (page.tsx → forks on redesign flag)
- `/golf/dashboard/messages?player=<playerId>` (deep-link find-or-create)

### How it's actually wired (end-to-end)

**Route shell + auth + role.**
`src/app/golf/(dashboard)/layout.tsx:34-35` calls `getGolfSessionProfile()` and
`redirect('/golf/login')` if there is no session — unauthenticated users are
bounced before the page renders. Role is resolved server-side (`coach` vs
`player`) and pushed into `GolfUserProvider`. Messaging is a *shared* (both-roles)
feature, so there is no cross-role gate to enforce at the route — that is correct
by design. Role only branches at the edges: the coach-only "Team" broadcast button
and the modal's `currentUserRole`.

**Page fork.**
`src/app/golf/(dashboard)/dashboard/messages/page.tsx:33` renders
`<FairwayMessages />` when `isRedesignEnabled()` (the prod default), else the
in-file `LegacyGolfMessagesPage`. Both paths share the SAME hooks, server actions,
and modals — they differ only in presentation. The live path is
`src/components/fairway/pages/messages/FairwayMessages.tsx`, composed of
`MessageConversationRail.tsx` (left rail), `MessageThreadPane.tsx` (thread),
and `MessageComposer.tsx` (input).

**Conversation list.**
`useGolfConversations()` (`src/hooks/golf/use-golf-messages.ts:345`) gets the
user via `supabase.auth.getUser()` then calls the RPC
`get_golf_conversations_with_details(p_user_id)` for 1:1 conversations, merges
team-chat conversations fetched directly from `golf_conversation_participants ⨝
golf_conversations`, batch-resolves the other participant from `golf_coaches` /
`golf_players`, and sorts by last-message time. Active-team scoping for multi-team
coaches comes from `getGolfActiveTeamConversationIds()`
(`src/app/actions/messages.ts:1112`) — returns `null` (no scoping) for players and
single-team coaches; only a coach staffed on >1 team gets a real allow-set. Realtime
refetch is wired to `golf_conversation_participants` (filtered by user_id) and
`golf_conversations` UPDATE, debounced 300ms.

**Thread + send/edit/delete.**
`useGolfMessages(conversationId)` (`use-golf-messages.ts:37`) fetches the most
recent 200 messages from `golf_messages` (`is_deleted=false`), marks them read via
`markGolfMessagesAsRead`, subscribes to realtime INSERT/UPDATE on `golf_messages`
(+ participant read-receipt UPDATEs + a typing broadcast channel). `sendMessage`
does an optimistic append then `sendGolfMessage` → `sendMessage({sport:'golf'})`
(`src/app/actions/messages.ts:44`): auth-check, participant-check, INSERT into
`golf_messages`, bump `golf_conversations.updated_at`, then fire-and-forget email
+ push + in-app notifications. `updateGolfMessage` / `deleteGolfMessage` enforce
`sender_id === user.id`; delete is a **soft delete** (`is_deleted=true`, content
cleared) — no destructive row delete in any save path. Attachments: client uploads
to storage (`useMessageAttachments`), then `sendGolfMessageWithAttachments`
(`src/app/golf/actions/message-attachments.ts:26`) inserts the message
(`has_attachments=true`) + `golf_message_attachments` rows.

All tables are correctly sport-prefixed and every column used exists in
`golfhelm-database.md` (golf_messages, golf_conversations,
golf_conversation_participants, golf_message_attachments). Server actions all
auth-check first. `createConversation` revalidates; the message send/edit/delete
intentionally skip revalidate (realtime-driven UI) — documented in code.

### Expected vs actual (feature-doc #7 Messaging)

The feature doc claims: "realtime updates, file attachments, read receipts, typing
indicators" and a data flow ending in "INSERT golf_message_attachments (per file)".

- Realtime, read receipts, typing indicators: **present and wired correctly.**
- File attachments: **only half-wired.** Upload + INSERT works, but the receive
  side is missing — see MSG-ATTACH-NORENDER below. The doc's "✅ 100%" status is
  inaccurate for attachments.
- Active-team scope: present (not in the doc, but correct).

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| CRITICAL | rls / role-leak | supabase/migrations/20260527000000_prod_public_baseline.sql:2810-2811,20376 (LIVE-confirmed) | `get_golf_conversations_with_details(p_user_id)` is `SECURITY DEFINER`, granted `EXECUTE` to `anon` + PUBLIC, and trusts the `p_user_id` arg instead of `auth.uid()`. | Any unauthenticated caller with the anon key can pass ANY user's UUID and read that user's conversation list: last-message content/preview, timestamps, sender ids, unread counts, all participant user_ids, and participant **emails**. RLS on the base tables is bypassed by the definer. | Either (a) ignore the param and use `auth.uid()` inside the function, or add `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION ...`; and `REVOKE EXECUTE ... FROM anon, PUBLIC;` leaving only `authenticated`. |
| HIGH | incomplete-feature | src/components/fairway/pages/messages/MessageThreadPane.tsx:425-431 (+ legacy page.tsx:766-774) | Sent attachments are never rendered or downloadable. `getGolfMessageAttachments` / `getSignedUrlsForAttachments` exist but are called from NOWHERE in the UI (grep-confirmed). The thread bubble only shows a static "Attachment" text label (Fairway) or nothing (legacy). | A user can attach + send a file, but neither sender nor recipient can ever view/download it — the attachment is effectively lost from the UI. Core advertised feature ("file attachments") is broken on the receive side. | Render an attachment gallery per message: on thread load, batch-fetch `golf_message_attachments` for visible message ids, call `getSignedUrlsForAttachments`, and render images/files with the signed URL. |
| MEDIUM | wrong-data | src/hooks/golf/use-golf-messages.ts:91-97 vs supabase baseline:2822-2841 | The thread fetch filters `is_deleted=false`, but the RPC's `last_message_*` preview and `unread_count` subqueries do NOT filter `is_deleted`. A soft-deleted message can drive the rail's last-message preview (shows blank/"No messages yet") and a soft-deleted unread message still increments the unread badge. | Rail preview + unread badge can disagree with the open thread after a delete. Currently latent: live DB has 0 soft-deleted rows, so no user is affected yet — but it will surface the first time anyone deletes a message. | Add `AND m.is_deleted = FALSE` to the three `last_message_*` subqueries and to the `unread_count` subquery in the RPC. |
| MEDIUM | revalidation / wrong-data | src/app/actions/messages.ts:337-344 + supabase baseline:2836-2841 | "Mark as read" sets `golf_messages.read=true` only for messages where `sender_id != me`, and `unread_count` is computed from `read=FALSE`. But the rail's realtime refetch is keyed on `golf_conversation_participants`/`golf_conversations` changes, NOT on the `golf_messages` UPDATE that `markMessagesAsRead` performs. Opening a thread updates `last_read_at` (a participant row) which DOES trigger a refetch — so it mostly works — but if a read happens without a participant-row write the badge can lag. | Unread badge in the rail can occasionally be stale relative to the opened thread until the next participant/conversation event. | Either subscribe the conversations hook to `golf_messages` UPDATE for the user's conversations, or have `markMessagesAsRead` always touch `last_read_at` (it does) — verify the badge clears on open in live testing. |
| LOW | error-state | src/hooks/golf/use-golf-messages.ts:103 | `markGolfMessagesAsRead(conversationId)` is fired without `await` or `.catch()`. The action `throws` on DB error (`src/app/actions/messages.ts:334,347`). | An unhandled promise rejection on a read-marking failure; no user-facing error, but noisy and could surface as an uncaught rejection in Sentry. | `void markGolfMessagesAsRead(conversationId).catch(() => {})` or swallow inside the action. |
| LOW | n+1 / pagination | src/app/actions/messages.ts:386-446 (sendGolfMessage notifications) | Per-send, the notification fan-out does sender lookups + recipient lookup + 3 `Promise.allSettled` loops (email, push, in-app) sized to recipient count. For a large team-chat broadcast this is an O(participants) burst on every message. | Negligible for 1:1 / small teams; could be slow for big group chats. Not a correctness bug. | Batch/queue notifications (e.g. Inngest) for team-chat conversations. |
| INFO | observation | src/components/fairway/pages/messages/MessageThreadPane.tsx:459-463 | The typing indicator avatar always uses `conversation.other_participant` even in a GROUP conversation, where `other_participant` is undefined — so a group typing indicator shows a generic "User" avatar and cannot name who is typing. | Cosmetic in group chats only; typing payload carries only `{userId,isTyping}` so the typer isn't identified. | If desired, include the typer's name in the broadcast payload and resolve via `groupParticipants`. |

### Notes on what is correct (no finding)
- Auth: layout redirects unauthenticated users; every server action calls
  `supabase.auth.getUser()` and rejects before any read/write of private data.
- No destructive delete-then-insert in any save/submit path; delete is soft.
- Optimistic send reconciles with realtime INSERT (replaces the `optimistic-` row
  by id, dedupes by id) — `use-golf-messages.ts:145-158`.
- Edit/delete are sender-scoped server-side (`sender_id === user.id`), so a player
  cannot edit a coach's message and vice-versa.
- Loading skeletons, empty states (no-conversations, no-messages, no-team,
  no-thread-selected), and error toasts are all present on both rail and thread.
- New-message modal correctly scopes search to the team (coach → team players;
  player → org coaches + teammates) and blocks when `teamId` is missing.
- Mobile master-detail (`mobileShowChat`), PullToRefresh, and 44px touch targets
  are wired. No obvious offline/sendBeacon hazard (realtime, not unload-save).

### Coverage notes
- The CRITICAL RPC leak and the soft-delete/unread RLS-bypass were confirmed
  against the LIVE prod DB (pg_proc.prosecdef=true; ACL shows `=X` PUBLIC + anon;
  base-table RLS enabled but bypassed by definer; 0 soft-deleted rows today).
- The attachment-render gap was confirmed by grep: no UI file imports
  `getGolfMessageAttachments` / `getSignedUrlsForAttachments`.
- Unread-badge staleness (MEDIUM) needs a live click-through to confirm whether it
  ever actually lags in practice (the `last_read_at` write usually covers it).
