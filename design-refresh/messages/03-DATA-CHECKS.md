# Data checks: Messages redesign

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 18 source rows).

Every figure and line the redesign draws, where it comes from in today's code (helmv3 `main` 75b4956), and what has no source yet. The view reads everything through `ChMessagesApi` (`MessagesView.tsx` 182) and the shapes in `model.ts`, filled by `Messages.tsx` (live) and `preview/PreviewMessages.tsx` (fixture). Nothing new is collected. Nothing needs a migration unless noted.

## The short version

- Almost everything the page draws is already loaded: conversations, messages, receipts, reactions with who reacted, poll votes per person, members, files, mute, class day, typing for the open thread.
- One additive field: `gradYear` on `ChPerson`, from `graduation_year`, which `loadMessagesDirectory` already reads (for PR 7's class-year faces).
- One select addition: the viewer's own `notification_level` and `muted_until` on the conversations read, for the mute glyph on rows. Today mute is read only when a conversation opens.
- One thing has no source today: pins. PR 11b keeps them on the device (like marked-unread); PR 11h (held) moves them to the account with a new table (`pin-sync/PIN-SYNC.md`). Typing on rows and pins is built from the typing broadcasts the app already sends (Nick, 31 Oct: "typing should be tracked"). See the gaps.
- The design's demo names, hues and times are placeholders; the preview fixture (spec section 12) carries them.

---

## Inbox

| Drawn | Source | Formula / rule |
|---|---|---|
| Context line, phone: "3 unread · Demo University Golf" | `convs`, `teamName` | count of `c.unread > 0 || c.markedUnread`; team name from `golf_teams.name` (`data/messages.ts` 85) (fixed 4 Nov wiring: read at `data/messages.ts:52`, mapped at `:100` on 03d9087). With no team name, the count alone |
| Context line, desktop: "3 unread · 7 conversations" | `convs` | same count · `convs.length` |
| Pinned faces and labels | **gap** | 11b: device pins, max 3; 11h: `golf_conversation_pins`, max 3 per team (see gaps); label = the first name for a direct thread, the title for a group |
| Pin bubblet | `c.lastText` | shown for a direct thread whose last message is theirs (`lastSenderId !== viewer`), truncated to one line at 92 px; none otherwise |
| Pin typing dots | `typingByConv` (new listener, 02-PLAN §3.8) | dots while anyone but the viewer is typing in that conversation; off 5 s after the last event |
| Row face | `convAvatarId(api, c)` (MessagesView 321) | direct: the other person's face; group or channel: the group coin with its icon (flag for the team channel) |
| Row name | `c.title` | |
| Row time | `railTime(c.lastAt, now, timeZone, clock)` (model.ts) | "8:14 AM", "Yesterday", "Wed", "Oct 8" |
| Row preview | `c.lastText`, `c.lastSenderId`, `c.lastIsPoll` | "You: " when the viewer sent it; in groups the sender's first name and a colon; a poll shows its glyph and question (today's rule, MessagesView 596–603). Two lines |
| Unread dot and bold preview | `isUnread(c)` | `c.unread > 0 || c.markedUnread` (owner decision 14) |
| Mute glyph | **select addition** | the viewer's `golf_conversation_participants.notification_level = 'muted'` and `muted_until` in the future (the rule in `app/golf/actions/message-mute.ts` 37). Add both columns to the conversations read; no migration |
| Filter counts | `convs` with `ChConvFilter` | All, Unread (`isUnread`), Groups (`c.group || c.channel`) |
| Card title count ("Recent 4") | the filtered list | rows shown in that card |

## Conversation

| Drawn | Source | Rule |
|---|---|---|
| Bar face, name, role | `ChConv.title`, `subtitle`, `convAvatarId` | role from the directory: coach title or `classYearLabel(graduation_year)` (`data/messages.ts` 93) (fixed 4 Nov wiring: `:91` on 03d9087); group: "N members" from `memberCount` |
| Day pill | `dayLabel(at, now, timeZone)` | "Today", "Yesterday", weekday within a week, then "Oct 8" |
| Date pill while scrolling | the day of the topmost visible message | same formatter |
| Bubble text | `ChMsg.text` | `MessageText` (MessagesView 1397) keeps links and line breaks |
| Edited mark | `ChMsg.edited` | "Edited" after the text (today's) |
| Deleted | `ChMsg.deleted` | today's deleted line, restyled as a bubble with secondary text |
| Sender name in the first bubble of a run | `personOf(api, senderId).name` | groups only; first name in team threads if today's thread does (keep today's rule) |
| Face beside the last of a run | `senderId` | groups only |
| Run grouping | `senderId` and time | today's grouping rule in `Thread`; the page joins messages from one sender with no day break between them |
| Times on drag or hover | `clock(at, timeZone, clock)` | per message |
| Reaction badges | `reactions.get(messageId)` → `ChReaction[]` | badge per key with `count > 0`; number only when `count > 1`; `mine` gives the champagne ring; `userIds` feeds the who-reacted card |
| Receipt under your latest message, direct | `ChMsg.seen`, `pending`, `failed` | pending: none (P-1); failed: today's Not sent line; else "Delivered", or "Seen" plus the time from the other member's `last_read_at` (`useGolfMessages` 652–698) |
| Seen by pill, group | `ChReceipts.marks` (seen-by.tsx) | members whose `last_read_at ≥ message.at`, newest first, up to five faces; "Seen by everyone", "Seen by 8 of 10" (`seenTitle`, seen-by.tsx 110) |
| Seen by sheet | same | Seen with each time (`railTime`); Not seen yet with "Last opened …" or "Hasn’t opened this chat" (seen-by.tsx 199) |
| Typing bubble | `api.typing` (`isOtherTyping`), plus the typer's id for groups | hides 5 s after the last typing event (today's hook clears at 3 s; the design's 5 s wins). Groups: "Maya is typing" from the typer's id through the directory |
| Row typing dots | `typingByConv` (02-PLAN §3.8) | the preview swaps to dots while someone else types there |
| Jump count | `ThreadBelow` anchor `unseen` | today's count of arrivals while away from the end |
| Photo | `attachments(messageId)` → `ChAttachment` with `image/*` and a `url` | today's `ImageAttachment`; a photo that won't load falls back to the file chip |
| File bubble | `ChAttachment.name`, `size`, `mime` | name, then the type and size ("PDF · 212 KB"); video length is not stored, so "Video · 0:42" in the page becomes "Video · 18 MB" (fixed 4 Nov wiring: it is stored. `golf_message_attachments.duration_seconds` is written on upload (`use-message-attachments.ts:332`, `message-attachments.ts:197`) and returned as `durationSeconds` (`message-attachments.ts:406`); `Messages.tsx` `loadAttachments` (631-638) drops it. Add `durationSeconds?: number \| null` to `ChAttachment` (model.ts 87) and map it; a video shows "Video · 0:42" when it is set and the size when it is null) |
| Reply quote | `ChMsg.replyToId` → the loaded parent | `ReplyQuote` (MessagesView 1425); the sender's name and the first line |
| Class line, Notify anyway | `classDay`, `notifiedAnyway` | unchanged, restyled |

## Polls

| Drawn | Source | Rule |
|---|---|---|
| Header "Poll · Choose one / Choose any" | `Poll.multi` | |
| Question, choices | `Poll.question`, `options[].label` | |
| Counts and bars | `useMessageResponses` rows (`golf_message_responses`: `message_id, user_id, choice, updated_at`) | per choice: rows for that choice; bar = count / total votes (`scaleX`) (fixed 4 Nov wiring: bar = `pollShare` (`lib/golf/message-polls.ts:227`), the choice's count over `voterCount`, the people who voted, so a multi poll's bars don't shrink; counts and voters from `tallyPoll` (178)) |
| Voter faces (up to three) | the same rows' `user_id` | you first when you voted, then the latest votes |
| Your check | your row's `choice` | |
| "Most votes" chip | counts | one choice strictly ahead with at least one vote; none on a tie (wiring 4 Nov: `tally.leaders.length === 1`; `leaders` holds every tied choice) |
| Footer "7 votes · Closes Mon" | total rows (fixed 4 Nov wiring: `tally.voterCount`, one per person, so a multi poll never counts a person twice); `closesAt`, `closedAt` | "Closed" after `closedAt` or a past `closesAt`; "Open" when both are null |
| See votes sheet | rows grouped by `choice` | group title, count and a bar per group; names from the directory |
| Vote error | `useMessageResponses().error` | today's lines ("Voting has ended.", "This poll was deleted.", "Your vote wasn’t saved. Try again.") |

Multi-answer polls: check how `choice` stores several answers in `use-message-responses.ts` before drawing faces per choice; count each answer once per person. (Checked 4 Nov wiring: one row per person, `choice` is the picked option ids joined by commas (`encodeChoice`, `lib/golf/message-polls.ts:145`; `decodeChoice` 152); `tallyPoll` already counts each person once and lists them under every choice they picked.)

## Details

| Drawn | Source | Rule |
|---|---|---|
| Header face, name, line | conversation | direct: role and team ("Junior · Demo University Golf"); group: "Group · 6 members"; channel: "Team channel · 11 members"; " · Muted" when muted |
| Quick actions | today's actions | Mute (`mute`, `setMute`), Search (`searchMessages` scoped to the conversation, today's), Files (`files`), then Add (group creator, `addCandidates`) or Profile (direct with a player: `playerId` link to stats) |
| Members | `members` (`ChMember[]`) | name, `subtitle`, Coach chip when `role = 'coach'`; first six then "See all"; you as "You" |
| Class status | `classDay` (coach, P-10) | today's line; only when the flag is on and the viewer is a coach; absent otherwise (the card is not drawn) |
| Photos and files | `files(conversationId)` → `ChFile` | images as tiles (signed URLs through the message's attachments), others as rows: name, type, size, `railTime(sentAt)` |
| Mute state | `mute` (`ChMute`) | `muteLabel` (MessagesView 2756) |

## Empty and new

| Drawn | Source | Rule |
|---|---|---|
| First run card | `convs.length === 0` and not loading | today's `MessagesFirstRun` copy may stay; the page's "Everything stays inside Demo University Golf" uses `teamName` |
| New message suggestions | `directory` | today's order (coaches first, then players by name); the page's five are placeholders |
| To token | picked `ChPerson` | |
| Hello card | the new conversation's person | face, name, role |
| Starters | static copy | the page's three are design copy; they fill the field only |
| Prefill | `prefill` | unchanged |

---

## Gaps for the builder

1. **Pins.** No pin in the data. Ship device-local pins (`pinned.ts` beside `marked-unread.ts`, keyed by viewer and team, max 3), pinned and unpinned from the row menu, and the Pinned card only when at least one is pinned. Pins on every device (Nick, 31 Oct: "pins sync is a go") are PR 11h: table `golf_conversation_pins`, read own rows only, written only by `golf_pin_conversation` and `golf_reorder_conversation_pins`, a private broadcast on `golf-pins:<user>`. Draft migration `pin-sync/20261031150000_golf_conversation_pins.sql`, held, never applied by the agent; checked on a scratch database on 3 Nov (`pin-sync/local-check/`). With the table missing, the app keeps device pins.
2. **Typing per conversation: build it** (Nick, 31 Oct). The source exists: the open thread's hook already receives `typing` broadcasts on `golf-conversation:<id>` with the typer's `userId` (`use-golf-messages.ts` 997–1012) and every composer already sends them (1051). No migration and no new data. Only the listening is new: today only the open thread listens. 02-PLAN §3.8 adds a listener for the conversations on screen and keeps the typer's id in the open thread.
3. **Class-year faces.** Add `gradYear: number | null` to `ChPerson` in `loadMessagesDirectory` (`p.graduation_year`, already selected through `readGolfPlayerProfiles`). Coaches and unknown years keep the neutral coin (PR 7).
4. **Mute on rows.** Add the viewer's `notification_level, muted_until` to the conversations read. No migration.
5. **Video length.** Not stored. File bubbles show size, not duration. (fixed 4 Nov wiring: stored in `duration_seconds`; see the File bubble row. Size shows only when it is null.)
6. **Captain.** No field; no chip.

## Staging spot checks to run before the PR

Read-only, on staging (Demo University Golf):

- A direct thread and the team channel each load messages, receipts and reactions with `userIds`.
- A poll in the team channel returns response rows with `user_id` and `choice`; a multi poll's rows show how several answers are stored.
- `golf_conversation_participants` has `notification_level` and `muted_until` for the demo coach.
- The directory's players carry `graduation_year`.

## Completeness pass, 4 Nov 2026

Where each value the completeness additions draw comes from. Nothing new is collected; no new table except 11h's.

| What | Source in today's code | Gap |
|---|---|---|
| Pending and failed | client id, `sendFailed` (MessagesView 597-617, 3237); 23505 counts as sent | none |
| Pending attachment | `helm.golf.cache.v1:pending-attachment-send:<user>:<conv>` | no upload progress events, so no percentage (fixed 4 Nov wiring: progress exists, the `onProgress` option of `sendMessageWithAttachments` (`use-message-attachments.ts:78`, 283) over the signed XHR upload in `lib/storage/attachments.ts`; the SDK fallback reports 0 then 100. 05 keeps the indeterminate spinner by design; nothing reads progress) |
| Attachment size limit and refused types | today's checks and copy | the exact limit is read from source by the test, not retyped |
| Signed URL age | signed with 3600s life | the time it was signed must be kept with the URL to re-sign after 50 minutes (client only) |
| Edited, deleted | today's message fields | none |
| Unread divider | the viewer's `last_read_at` on `golf_conversation_participants` at the moment the thread opens (fixed 4 Nov wiring: today's divider comes from `conv.unread` as the thread opens, through `useNewDivider` (MessagesView 1933) and `firstUnreadId` (model.ts); keep it) | keep that value for the visit; don't move it on markRead |
| Older pages | `use-thread-anchor.ts` paging | none |
| Search hits | `searchGolfMessages` (`actions/messages.ts:1412-1440`) (fixed 4 Nov wiring: `src/app/actions/messages.ts:1465-1560`, exported 1636, re-exported by `src/app/golf/actions/messages.ts:360`) | no `hidden_at` check (bug M1, still true on 03d9087) |
| Typing | `golf-conversation:<id>` broadcast, throttled 500ms | a stop event is sent on blur and on send if today's client sends one; otherwise the 5s expiry ends it |
| Removed or left | participant rows (realtime) | none |
| Missing person | `?? 'Player'` (data/messages.ts 91) (fixed 4 Nov wiring: that is the subtitle fallback; a sender missing from the directory reads "Member", `MessagesView.tsx:781, 1428`, `MessagesPhone.tsx:573`) | none |
| Deep link params | `Messages.tsx` 132-143 (fixed 4 Nov wiring: `linkKey` 173, the effect 174-238 on 03d9087): `conversation`, `player`, `user`, `compose`, `prefill` | no `announcement` param |
| Push link | `golf-message-fanout.ts:135` writes `?conversation=<id>` (fixed 4 Nov wiring: the bell row's `action_url` is `golf-message-fanout.ts:214`; the push carries `conversationId` (179) and `push.ts:113-124` builds the URL); tap path `push-registration.ts:296` | none |
| Prefill payload | `ch.messages.prefill.<key>` (`prefill.ts`); AK11c adds `conversationId?`, `poll? {question, options[], closes?}`, `attachment? {kind:'board', pngKey}`; read once by `takePrefill`, which validates them | Ask lane's change; no origin field, so the back key can't return to Ask |
| Board picture | a PNG in this tab's blob storage, found by `pngKey` (Ask AK11c) | gone after the tab closes; the composer handles a missing blob |
| Named conversation check | the viewer's conversation list and participant rows already loaded | none |
| Announcements | `getAnnouncementsWithMeta` with the page; urgency `high` and `urgent` as "Urgent" (model.ts 290) | not realtime; an Ask-posted one shows on the next page read or refetch |
| Badge | 45s poll | no `refetch()` after markRead (bug M3); deleted conversations stay counted (bug H1) (fixed 4 Nov wiring: H1 is already fixed on 03d9087, `countUnreadMessages` skips a hidden conversation, `lib/golf/unread-message-count.ts:80`; M3 stands) |
