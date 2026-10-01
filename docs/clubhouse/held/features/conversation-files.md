# HELD FEATURE — Conversation files

```text
Plan ID: HF-conversation-files
Status: HELD
Requested by design: design/handoff/mobile/Messages Mobile.html (Group details and Chat details, the Files panel), m-msg.jsx
Pages: Messages (P007), phone Details
Semantic feature owner if existing: team_communications (memory/features/team-communications.md)
Date: 2026-09-29
```

## Why this is needed

The owner's phone design shows a Files panel in a conversation's Details: every file shared in that
conversation, newest first, with its name, size and when it was sent. The owner accepted it as D-48.

## Existing capability

- `golf_message_attachments` holds the files (13 in production when the spec was written). The SELECT
  policy "Users can view attachments in their conversations" (`TO authenticated`) already lets a
  participant read every attachment in their conversations.
- `getGolfMessageAttachments(messageId)` reads one message's files and signs a one-hour URL for each.
  Desktop Clubhouse and Fairway open files through it.
- There was no read for a whole conversation's files.

## Gap

A server action that lists a conversation's files. It is new server behaviour (a new action and a new
read shape), so under D-61 it is HELD, not EXISTING. No schema, policy or storage change is needed.

## Desired behavior

`getGolfConversationFiles(conversationId)` in `src/app/golf/actions/message-attachments.ts`, built on
2026-09-29 (commits 96ac43174, 80fdd2362):

- Signed-out: "Unauthorized".
- **HELD gate:** unless `isClubhouseFor(role)` is true for the caller (the `golf_clubhouse_ui` flag, a
  coach or a player), it returns "Not available" before any read.
- A caller who isn't a row in `golf_conversation_participants` for that conversation gets "Not a
  participant in this conversation". A made-up id gets the same answer.
- Otherwise, files on messages that aren't deleted (filtered in the query), newest first, at most 100:
  id, message id, name, MIME type, size, sent at and sender. Never a storage path or a signed URL.
- Opening a file goes through `getGolfMessageAttachments` for that one message.

## User actions

- Open Details on the phone: the Files panel loads (CH-7409), lists the files, or says "No files shared
  yet." (CH-7306), or fails with Try again (CH-7214).
- Tap a file: it opens through the per-message signed URL, or says it couldn't (CH-7021).

## Permissions

Participants only, checked in the action before the read, and again by the SELECT policy. Nothing new
at the database. The HELD gate narrows it further to callers with the Clubhouse UI on.

## Data requirements

None new. It reads `golf_message_attachments` joined to `golf_messages` (`conversation_id`, `sender_id`,
`is_deleted`) through the existing foreign key.

## Notification impact

None.

## Offline behavior

The Files panel's read fails like any other read: CH-7214 with Try again. Nothing is written.

## Bridge requirements

The action runs inside `withAdminObserved('getGolfConversationFiles', …)` and logs its failures through
`logServerError` (`message_attachments.getGolfConversationFiles`). The panel's states are CH-7214, CH-7306,
CH-7409 and CH-7021; Bridge IDs are assigned when the Messages page contract (P007) is written.

## Tests required

`src/app/golf/actions/__tests__/message-attachments-conversation-files.test.ts` (7 cases): the HELD gate
refuses before any read; non-participant and signed-out refusals; metadata only; the deleted-message
filter in the query; one conversation per call; a failed read is logged. The panel's states are in
`src/clubhouse/__tests__/messages.test.tsx` (CH-7409, CH-7306, CH-7214, CH-7021). A security review on
2026-09-29 found no Critical or High issue; its one finding in this action is fixed (80fdd2362).

## Implementation sketch

Built as above and gated. Activation means removing the `isClubhouseFor` refusal (or keeping it, if the
action stays Clubhouse-only by design) and updating this plan and the page manifest.

## Activation prerequisites

- The owner releases it from HOLD.
- The Messages page contract (P007) lists the action and its Bridge IDs.
- Worth doing first: the attachment hardening in `docs/clubhouse/held/data/message-attachments-hardening.md`,
  so that the per-message open path stops signing files on deleted messages.

## Owner decisions required

- Release from HOLD, and whether the action stays Clubhouse-only after the Clubhouse UI is the default.

## Explicit prohibition

This plan may be implemented/prepared for review where appropriate, but it must not be activated as new production behavior until the owner explicitly releases it from HOLD.
