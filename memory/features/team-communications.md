# Feature: Team Communications

## Status

- active

## Current State

Team Communications covers realtime team messaging and coach-to-team announcements. Messaging is conversational and realtime; announcements are structured broadcasts with urgency, targeting, linked documents, inline tasks, and acknowledgement tracking.

When a player or coach opens a conversation, the thread starts at the newest
loaded message. Later realtime messages preserve a reader's position unless
they are already near the bottom; an explicit search result takes precedence
and opens at its matched message instead. The search target consumes the
initial-open sentinel so it cannot be overwritten by a stale initial scroll.

The immersive mobile thread uses one bottom safe-area inset, owned by the
composer. Its writing field sits in a compact flush footer. Attachments open
in the shared scrollable Sheet on phones and a menu on desktop. Group details
use Sheet.Body so long member lists scroll within the viewport.

Header, rail, and composer derive conversation kind from participant count
(and ids when count is absent). A two-person broadcast resolves its actual
counterpart even when its storage group flag is set. Real groups retain their
full title; unresolved identities use an honest generic label.

Message reactions are persisted in golf_message_reactions using the session
client and existing participant RLS. Hold a message (or right-click on desktop)
to add one; tap a reaction count to add/remove your own reaction. Counts include
distinct members, refresh through realtime, and reload on window focus. Errors
remain visible; switching threads discards stale fetch results. Removing a
reaction targets the current user's row only and never edits group membership.

These surfaces are operationally important because they touch files, notifications, task creation, player acknowledgement, and team access rules.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/messages/**`
- `src/app/golf/(dashboard)/dashboard/announcements/**`

### Components

- `src/components/golf/messages/**`
- `src/components/fairway/pages/messages/**`
- `src/components/golf/announcements/**`

### Actions

- `src/app/golf/actions/messages.ts`
- `src/app/golf/actions/message-attachments.ts`
- `src/app/golf/actions/announcements.ts`
- `src/app/golf/actions/communication.ts`

## Core Data

- `golf_conversations`
- `golf_conversation_participants`
- `golf_messages`
- `golf_message_attachments`
- `golf_announcements`
- `golf_announcement_acknowledgements`
- `golf_announcement_documents`
- `golf_announcement_recipients`
- `golf_announcement_tasks`
- Inline task records in `golf_tasks` and `golf_task_assignments`.

## Data Flow

```txt
Message send
  -> optional client-side attachment upload to Supabase Storage
  -> sendGolfMessageWithAttachments()
  -> INSERT golf_messages            (commits FIRST, has_attachments: true)
  -> INSERT golf_message_attachments (separate statement, may fail alone)
       on failure (2026-09-07, G-08): remove the orphaned storage objects,
       then either delete the message (no text survived -> success: false, the
       composer keeps the draft) or clear has_attachments and CONTINUE to the
       timestamp update and fan-out, returning attachmentsFailed: true
  -> update participant last_read_at
  -> Supabase Realtime pushes to participants

Announcement create
  -> optional direct file upload from the composer (uploadGolfDocument ->
     createGolfDocument: file lands in the team document library, then the
     new document id joins documentIds)
  -> createEnrichedAnnouncement()
  -> INSERT golf_announcements
  -> INSERT targeted recipients or broadcast metadata
  -> INSERT linked documents
  -> optionally create inline tasks and task assignments
```

## Business Rules

- Participants should only read conversations they belong to.
- Message attachments must be scoped to the conversation/team and should not expose storage paths broadly.
- Announcement targeting must be explicit: broadcast or recipient-specific.
- Required acknowledgements need durable tracking per player.
- Inline announcement tasks must stay consistent with task assignment state.
- Urgent announcements may need push/email/in-app notification treatment; check current notification wiring before claiming it exists.
- A text send retries ONCE, after 750 ms, when the server-action POST fails
  at the transport layer (WebKit "Load failed", Chromium "Failed to fetch" —
  `withOneTransportRetry` in `src/lib/transient-network-error.ts`). Any other
  failure, and a second transport failure, still surface the toast and keep
  the draft. Field evidence 2026-09-01/02: two Shenandoah phones lost a send
  this way with `navigator.onLine === true`, and Vercel logged no
  `message_sent` for either — the request never arrived. A retry carries the
  same duplicate risk as the player's own re-tap and nothing more; a
  schema-backed idempotency key is the answer if duplicates ever become costly.

## UI Contract

- Messaging needs realtime update behavior, attachment preview, read state, and empty conversation states.
- Opening a conversation must land at its newest message without forcing a
  reader back to the bottom after they scroll upward.
- Announcement coach view needs creation, targeting, urgency, documents, tasks, and acknowledgement tracking.
- The composer's Attachments section renders for any coach with a team (2026-08-26): it offers direct device upload (25 MB cap, mirrors the Documents-page accept list) plus the library picker; it must NOT be hidden just because the team library is empty.
- Announcement player view needs compact cards, clear acknowledgement action, linked documents/tasks, and urgency state.
- Mobile versions should keep primary action clear and move lower-priority controls into sheets or menus.
- On a phone the immersive messages column fills the viewport minus
  `--keyboard-height`, with its sole bottom safe-area inset in the composer, which sits
  directly above the keys ("I can't see what I'm typing", Shenandoah team
  chat 2026-09-01); the thread pane re-pins to the newest message when its
  region shrinks, and the composer drops its home-indicator pad while the
  keyboard covers the home indicator. The screen carries
  `data-fw-keyboard-aware` so the shell's global scroll-into-view stays out.
- On a phone with a thread open, the inbox masthead (`ViewHeader`) is hidden
  (`hidden md:block`) so the thread gets the screen; the thread header carries
  Back. With both stacked, 100–272px of an 844px viewport was left for the
  conversation and read as "doesn't load the newest message" (mobile audit
  2026-09-02, UI-4).
- **Coach announcement edit (2026-09-02, GAPS_AUDIT_INTERACTION_CRUD).**
  Before this, there was no Edit action anywhere — expanding a posted
  announcement only revealed Delete, so fixing a typo meant a destructive
  delete-then-recreate that also discarded every acknowledgement. The coach
  card (`FairwayCoachAnnouncementCard`) now shows an Edit control (ghost
  variant, matching Delete's size) next to Delete once expanded. Edit opens
  the same Sheet component the create flow uses
  (`AnnouncementFormSheet`, mode-aware, in `FairwayCreateAnnouncement.tsx`)
  prefilled from the announcement's own title/body/urgency/
  requires_acknowledgement, and calls the new `updateAnnouncement` server
  action (announcements.ts), authorized identically to `deleteAnnouncement`
  (any coach staffed on the announcement's team, F036/F037 — not just the
  original author). **Editable: title, body, urgency,
  requires_acknowledgement — the row's own columns.** Recipients
  (`golf_announcement_recipients`), attachments
  (`golf_announcement_documents`), and inline tasks (`golf_announcement_tasks`
  / `golf_tasks` / `golf_task_assignments`) are deliberately NOT editable —
  changing any of them means delete-then-reinsert of junction rows, the exact
  DELETE-then-INSERT-in-a-save-path shape the Review Gate blocks, and
  re-targeting recipients would silently orphan existing
  acknowledgements/task-completions. Delete-and-recreate remains the path for
  changing those. Toggling `requires_acknowledgement` is non-retroactive in
  both directions: turning it off does not clear already-acknowledged
  players' acknowledged status, and turning it on does not require anyone who
  already read the original version to (re-)acknowledge — existing
  `golf_announcement_acknowledgements` rows are never touched by the edit
  action. The card patches its own collapsed header optimistically on save
  (an `override` local state cleared once the prop's own fields catch up via
  `router.refresh()`) rather than waiting on a full reload.

## Conversation Rail Failure Semantics (2026-08-27)

The rail distinguishes "backend failed" from "genuinely empty" — a failed load
must never render the cheerful "No conversations yet" (P257).

`useGolfConversations` reads from TWO sources: the
`get_golf_conversations_with_details` RPC (primary) and a direct
`golf_conversation_participants` query for team chats (supplement, "in case DB
function doesn't include them"). The terminal decision is
`(rpcError ?? groupConvsError) && !conversationsData?.length` →
`setError(true)`; `MessageConversationRail` then renders explain + Retry.

Deliberately NOT an early return at the team-chat query: it supplements the RPC,
so returning on its failure would blank a rail whose DMs loaded fine. The rail
keeps rows on screen when `error && conversations.length > 0`. Before
2026-08-27 that query's failure was logged and then fell through, so a user
whose team-chat read was denied saw an empty inbox with no error — the exact
masquerade P257 exists to stop.

## Attachment send is two statements, and that shapes two behaviours

`golf_messages` and `golf_message_attachments` are inserted separately, so a
message can exist for a window — or permanently — without its attachment rows.
Two different readers handle the two cases, and confusing them is easy:

- **Transient (the commit race).** A recipient's fetch lands between the two
  commits and legitimately reads zero attachment rows with no error.
  `MessageThreadPane`'s SUCCESSFUL-BUT-EMPTY branch treats this as unresolved
  and offers a retry, which usually closes the race. Correct, and deliberate.
- **Permanent (the insert failed).** Since 2026-09-07 the action no longer
  leaves this state reachable: it compensates and clears `has_attachments`, so
  a flagged-but-empty row now means only the race above. Before that fix the
  two were indistinguishable to the reader, the retry could never succeed, and
  the sender had been told the send worked (G-08).

Consequence for future work: **do not "simplify" the compensation into an early
return.** A message whose text survived really was delivered, so it must still
reach the fan-out; a test pins this.

## Two team flags on `golf_conversations`, and which one the UI means

`is_team_chat` and `is_team_channel` are DIFFERENT flags, not two spellings of
one. `get_golf_conversations_with_details` returns its `is_group` column as
literally `COALESCE(c.is_team_chat, FALSE)` — so `is_team_chat` is the grouping
flag the messages UI consumes, under another name. `is_team_channel` is
separate and is used inside that function only by its own `ORDER BY`; nothing
in the messages UI branches on it. `golf_conversations_select_v2` grants on the
union of the two, and `idx_golf_conversations_team_channel` indexes only
`is_team_channel = true`. Full evidence and the production distribution:
`audit/M01-TEAM-FLAGS.md`.

Two consequences worth carrying:

- **Inbox ordering is the client's, not the RPC's.** The function orders
  channel-first then `updated_at`; the hook re-sorts by
  `last_message.created_at`, and the rail buckets by time before rendering.
  That is deliberate — do not "restore" the RPC's pin at the hook level.
- **`is_group` still cannot answer "is this a group?"** A broadcast to one
  player carries `is_team_chat`, so `conversation-kind.ts` derives from
  `participant_count` instead. `is_team_channel` would be worse there, not
  better: it is true for a small minority of real team chats.

## The conversation rail is one list on one cadence (2026-09-07)

The rail's rows are a divided list, not a stack of cards, and the rule is
load-bearing rather than cosmetic: **every row occupies an identical box**.
Same padding, no radius, no per-row shadow, no inter-row gap — rows are
separated by a `divide-y divide-border-subtle` hairline, which costs no
vertical space. Unread is carried by a `bg-surface` tint plus the heavier name
weight and the count badge — `surface` and not an accent tint, because the row
already spends accent on the Badge, the group glyph and the timestamp, and
tinting the row accent as well makes the badge and glyph disappear into their
own background. Desktop selection is a leading accent rule
painted as an inset shadow.

Why it is written down rather than left to taste: giving unread its own
elevated card makes the list's PERCEIVED rhythm depend on which rows happen to
be unread. Measured at 390x844 with six conversations, the box gap was a
uniform 6px but the eye read 6px between two carded rows (it lands on the card
edges) and 30px between two flat rows (no edge, so it measures text-to-text
across 12 + 6 + 12), with an 80px row against a 72px one on top of that. The
approved artboard specifies the card and cannot show this, because it never
stacks two flat rows; `DECISIONS.md` G-50b — take the rule, not the specimens
— is the authority for shipping the rule instead. The same treatment is
`FairwayQualifierLeaderboard`'s, and the rail's docstring forbids the
alternative ("never a card-in-card").

Anything that reintroduces a per-row box — a radius, a shadow, a gap, a
taller unread row — brings the uneven cadence back.

**Depth belongs to the list, not the row.** Each triage section is a raised
card (`rounded-card bg-surface shadow-raise`); the rows inside it are flat and
identical. That is what lets the surface read as lifted without the rhythm
depending on which rows are unread. The unread fill is `bg-elevated` — one step
above the card it sits in.

**One radius token, one shadow token — and the ramp already decided which.**
This shipped once as `rounded-fw-lg` carrying `--fw-shadow-card` composed over
`--fw-shadow-soft`, and was rejected as "doing too much". Both halves are
over-reach a token comment names outright, so the rule generalises past this
surface: `--fw-radius-lg` (28px) is reserved for "modals, sheets, hero plinths,
glass bars" and `--fw-radius-card` (20px) says "THE card radius", so a list card
taking the sheet radius is a token misuse rather than a taste call; and **every
tier in the shadow ramp already contains its own contact layer**, so composing
two tiers doubles it — `card` + `soft` reads ~0.11 at 2px blur, a hard dark edge
at the card's foot. A contact shadow is the "resting on" tell, which is the
opposite of floating. If a surface should float, take the tier whose comment
says so (`--fw-shadow-raise` — "popovers / floating glass"), and take it as the
mapped `shadow-raise` utility rather than a `[box-shadow:…]` bracket.

**Bubble fills are roles, and the roles are not interchangeable.** The incoming
bubble is `bg-elevated`, not `bg-surface-sunken`. Sunken is the WELL role (input
tracks, insets — surfaces that sit down into the page) and shipping it here made
the thread read flat no matter what shadow sat underneath, because the fill was
fighting the shadow. The artboard paints incoming as the brightest cream in the
system. The own bubble is `--fw-shadow-raise`, a neutral interim: the artboard's
own-bubble ambient is HUED and no shadow token is, which is open as A03 #8.

## The conversation rail's last message is a preview, not a message

`last_message` on `GolfConversationWithMeta` is typed
`GolfConversationLastMessage` — `content`, `created_at`, `sender_id`, and
nothing else, because those are the only three scalars the RPC returns about
the newest message. It deliberately has no `id` and no `read`: it used to be
typed as a full `GolfMessageRow`, which forced the transform to invent them
(`id: ''` on every row in the inbox, `read: false` always — G-15).

Keep it narrow. The type IS the enforcement: widening it back to a row type is
what would let a consumer key on a fabricated id again, and `npm run typecheck`
is the check that catches it.

## Group membership: two facts, one query, and a role that does not exist

A group conversation's member list and its "N members" count come off the SAME
`golf_conversation_participants` rows, deliberately — they used to be two
independent facts (a count from the participant query, a hardcoded `[]` for the
ids) and could disagree. That query is paginated (`fetchAllRowsResult`, ordered
on `id`): it supplies identity now, not just a cardinality, so the PostgREST
1000-row cap would drop MEMBERS rather than merely under-count.

`creator_id` and `participant_ids` reach the UI on both origin paths. The RPC
selects `c.created_by AS creator_id` itself; the supplemental team-chat path
sets it from `conv.created_by`. What used to lose them was the transform's
`is_group` branch, which did not copy them onto `GolfConversationWithMeta`.

**There is no participant role column.** `golf_conversation_participants` has
`conversation_id, id, joined_at, last_read_at, muted_until, notification_level,
user_id` and nothing else. The Admin badge on a member row is
`golf_conversations.created_by` — a true fact about the row, read-only by
construction, with no schema to write a promotion to. `users.role = 'admin'` is
a PLATFORM super-admin flag and must never be used here: it would badge a Helm
staff account as a group admin and the actual creator as nothing.

A member row's subtitle is role-dependent — `golf_coaches.title` for a coach,
`Class of {golf_players.graduation_year}` for a player — and renders **nothing**
when the column is empty. That is why `GroupMember` is its own type rather than
`GolfConversationParticipant`, whose `subtitle` is required and whose DM path
fills the gap with `'Golf Coach'` / `'Golf Player'`.

<!-- schema-drift-absent: golf_group_membership_management, golf_user_on_conversation_team -->
<!--
  `golf_user_on_conversation_team` is a real function, created by
  20260907160000 — which is written and NOT applied, so it is correctly absent
  from the production schema snapshot `db:types` generates. Delete this name
  from the declaration above the moment the owner applies the migration and
  re-runs `npm run db:types`; leaving it here would exempt a real object from
  the drift check.
  `golf_group_membership_management` is not a database object at all — it is
  the pgTAP suite's own filename, which happens to start with `golf_`:
  `supabase/tests/rls/golf_group_membership_management.sql`.
-->

## Group membership management, and why it needed a policy change

Adding or removing a member of a team chat is NOT a wiring problem. Verified
against live production `pg_policies` before any code was written:

- `golf_participants_delete` was `USING (user_id = auth.uid())` — self only. A
  creator could not remove anybody.
- `golf_participants_insert_v2`'s creator branch carried
  `AND NOT golf_conversation_has_other_participant(conversation_id)`, so an
  insert into a thread that already held someone else was refused.

That clause is
`20260819070000_conversation_creator_cannot_inject_third_party.sql`, added
after a **verified production attack**. So "Leave group" was the only membership
mutation the product could perform, and it still is until
`20260907160000_golf_team_chat_membership_management.sql` is APPLIED.

**The new migration is a scoped allowance, not a reversal.** The 2026-08-19
branch authorized an insert on the sole basis that the actor created the
conversation — no bound on which conversation, none on who was being added, and
reachable against a private DM. The replacement is bounded on three axes at
once, and all three must hold:

1. the conversation is a genuine team chat (`is_team_chat AND team_id IS NOT
   NULL`) — a DM is unreachable, which is the case the attack used;
2. the actor is the conversation's `created_by`;
3. **for INSERT**, the person being added is already an active player or a
   coach on the owning team (`golf_user_on_conversation_team`, a target-user
   helper — `golf_conversation_on_my_team` answers for the CALLER and cannot
   be aimed at someone else).

The DELETE branch adds `user_id <> auth.uid()`, which given branch 2's creator
requirement is exactly "not the creator's own row" — so Remove is never a
second, unlabelled way to leave. Removing yourself is still the self-delete
branch, i.e. Leave.

**The DELETE branch does not rest on the 11-of-11 observation, because this
change staled it.** 20260819070000's header recorded that no golf conversation
had a creator who was not a participant, and the DELETE branch would have been
free to lean on that — except the same change ships Leave group, which the
creator can use. Re-asked directly against a real Postgres: acting as a creator
who is NOT a participant, the conversation IS visible (a coach branch in
`golf_conversations_select_v2`) but ZERO participant rows are, because
`golf_participants_select_v2` has no coach branch. A DELETE over invisible rows
removes nothing, so a departed creator was already powerless. The branch states
the bound itself anyway — `conversation_id IN (SELECT user_conversation_ids(…))`
— deliberately redundant, so that a DELETE branch's only real bound never lives
in a different policy one edit away from disappearing unnoticed.

A group CAN end up with no creator among its members, via Leave. The
consequence is that nobody can remove anyone afterwards, which is the intended
direction to fail in.

**Adding a member hands them the whole backlog.** `golf_participants_select_v2`
grants a participant the conversation's full prior history and this migration
does not change that. There is no per-message join watermark in the schema, so
"only messages after you joined" is a different feature, not a variant.

**Creator-only, not any coach on the team.** `golf_conversation_participants`
has no role column of any kind, so `created_by` is the only thing "admin" can
mean here — the same fact the sheet's Admin pill draws, and the same predicate
the UI uses to decide whether to offer the controls at all. Deriving both from
one fact is deliberate: what the sheet offers and what the database permits
cannot drift apart.

**Where the proof lives.**
`supabase/tests/rls/golf_group_membership_management.sql` (14 pgTAP
assertions) exercises a real Postgres, not `pg_policies` text. Run against a
local stack with the migration applied, all 14 pass; with both policies reverted
to their pre-migration shape inside the same transaction, exactly three fail
while the 2026-08-19 refusals and the two-statement creation order still pass.
A refusal-only suite would have passed against a predicate that blocks
everything — that trap is named in the 2026-08-19 migration's own verification
block, and the creation-order check is its pairing.

The suite records its own limit rather than overstating: the two departed-creator
assertions do NOT discriminate on the DELETE branch's participation clause. A
third control run with that clause alone removed still passes all 14, for the
measured reason above. They are a contract on the outcome, which currently holds
through two independent mechanisms.

**One trap worth carrying forward:** a DELETE denied by RLS removes zero rows
rather than raising, and counting the rows afterwards AS THE ACTING USER cannot
distinguish "the row is gone" from "the row is invisible to me" — the same
SELECT policy filters both. Those assertions take their counts with RLS off.

## Motion and busy state: the standards were already here (2026-09-07)

An owner ask — "make sure touch points have motion, make sure motion is good,
loading states, etc" — resolved into five gaps, and not one of them needed a
new idea. Each was a place where this repo had already decided the answer and
one Messages surface was not following it. **Read that as the rule: before
adding motion here, find where the repo already made the call.** The tokens
say slow, cinematic, never twitchy; `Skeleton.tsx` bans spinners on primary
data; the rail already runs `animate-fade-in-up`. Adding entrance animation
anywhere new re-opens the choppiness complaint that took three rounds to close.

**A loading state reserves the slot.** `Skeleton.tsx`'s header states the whole
contract: shape-matched blocks that hold the layout the real content will
occupy, a cream shimmer that stops under reduced motion, and `role="status"` +
`aria-busy` + an SR-only label on every group. The thread's loading branch drew
three raw `bg-surface-sunken` divs and satisfied none of it, in the same
directory as a rail branch that satisfied all of it. The thread skeleton now
alternates incoming/outgoing at the bubble's own geometry, avatar gutter
included — a placeholder that does not sit where the message will sit trades
one jump for two.

**Busy is not the same as disabled.** `Button` and `IconButton` both take a
`busy` prop that draws a spinner and sets `aria-busy`; `disabled` alone greys a
control out and tells you nothing. Two sheets here pass `busy=`; `GroupDetailsSheet`
set `disabled={busy}` on five controls and `busy=` on none. **The trap when
fixing this:** a single in-flight boolean cannot be forwarded to a control that
renders once per row — Add is per-candidate, and one flag spins every row at
once, claiming several requests are running when one is. `run()` carries an
optional key and `pendingKey` names the pressed action; singletons (confirm
remove, Leave) can take the plain boolean because only one ever renders.

**`Button`'s busy adds, `IconButton`'s busy swaps.** `Button` renders the
spinner ALONGSIDE children, so a fixed-size circular button with an icon child
gets two glyphs in one well — the composer's send button therefore draws its
own `Loader2` (`ToastStack`'s idiom) rather than taking the prop.

**A send in flight must not look like someone typing.** Three animated dots in
a chat mean "a peer is composing". `TypingIndicator` owns that vocabulary here,
and its comment records that `animate-bounce` on dots was tried and rejected.

**`transition-colors` silently disarms the press response.** Every Fairway
control's base carries `fwPress` (`controls/_internal.ts:62-63`): a 0.5px
settle plus `scale-[0.98]` on a spring curve. A className with a bare
`transition-colors` displaces the base's property list through `cn`, and
`transform` is in that list — so the press still fires but snaps, and the
spring easing governs nothing. On a phone, where hover never happens, that
press is the only feedback a tap gets. Name `transform` explicitly; do NOT
reach for `fwTransition` on a rail row, because it also transitions
`box-shadow` and a row shadow is exactly what the one-cadence pass removed.

**A raw `<button>` inherits none of this.** The recipient rows in both sheets
inline the four `fwPress` utilities and cite `_internal.ts:62-63` rather than
importing it: nothing outside `controls/` imports that module, and the
underscore is announcing a boundary. `messages.motionAndBusy.test.ts` pins both
halves against `_internal.ts` itself so the copy cannot drift from its source.

## Depth comes from the GROUND, and identity from one tint (2026-09-07)

Three rounds of "it looks flat" were answered by changing bubble shadows. The
shadows were fine. The thread's scroll region painted `bg-surface` (0.984) and
the incoming bubble painted `bg-elevated` (0.993): a bubble nine thousandths off
its own background, which no shadow can rescue. The artboards float bubbles over
the CANVAS. The region is `bg-canvas` (0.953) and the incoming bubble is
`bg-surface` — a 0.031 step, which is what `--fw-shadow-card` was drawn against.

`bg-surface` is also the correct bubble fill on its own terms. `Bubbles.dc.html:20`
and `Thread.dc.html:57` paint it `linear-gradient(180deg, oklch(0.989 0.013 87),
oklch(0.980 0.017 86))`, mean 0.9845 — `--fw-color-surface` to three places, and
inside the gradient's range. `--fw-color-elevated` overshoots the whole ramp, and
`design-tokens.css:118` is pointed about it: surface is "warm CREAM, not white …
never by being a cold white sheet (we keep coming back to this: no white cards)".

Avatar identity is one opt-in prop, not a palette. `Avatar` takes
`tone?: 'neutral' | 'accent'`, default `neutral`, so every existing caller across
the app is untouched. `accent` is `bg-accent-100` over `text-accent-700` —
`oklch(0.939 0.045 150)` and `oklch(0.488 0.124 150)`, byte for byte what
`Group.dc.html:28,49` and `Thread.dc.html:35` draw. Messages opts in on the 1:1
header avatar, the incoming message avatar, and the group stack's FIRST face;
the faces behind it stay neutral because the artboard fills them
`oklch(0.963 0.021 84)`, which is `surface-sunken` — the default already. One
hue, so "one accent, spent on meaning only" survives. Whether accent should
become the primitive's app-wide default is an open question for the owner, not
a call this lane made.

The incoming avatar renders on every incoming row, 1:1 included. It was gated to
groups on a width argument that does not survive measurement: 390px screen, 16px
padding a side, 32px column plus `gap-2` — 318px left against a 288px bubble cap.

## The day chip is a per-boundary separator, so it sits in flow (2026-09-07)

`Thread.dc.html:51`'s authored comment — "the day chip FLOATS over the thread on
glass, not inline in it" — describes a chip positioned against the SCROLL
CONTAINER at `top: 12px`: ONE chip pinned at the head of the pane, a current-day
indicator. Generalised into a per-boundary separator it became an absolute
element over a zero-height row and painted on top of the sender name of the
group beneath it. `Group.dc.html:44` is the artboard that matches a group thread
and draws the same chip `display: flex; justify-content: center; padding: 0 0
16px 0` — in flow, so it structurally cannot collide. The chip's material stays
Thread's glass, which `audit/DECISIONS.md` froze; only the placement moved.

## Opening a thread at its newest message: arm, then pin (2026-09-07)

Two defects made a thread open at its OLDEST message once it was tall enough to
overflow, and they compounded. Both are closed; the shape of the fix is worth
keeping because either half alone leaves the bug.

**A pane with no layout must not decide anything.** On a phone the thread pane is
MOUNTED while the rail is still the visible half — the page auto-selects the
first conversation, so the opening layout effect runs against a container whose
`clientHeight` is 0. Writing `scrollTop = scrollHeight` there is `0 = 0`, a
no-op that looked like a completed pin, and the effect then spent its one-shot
`pendingInitialScrollConversationIdRef`. Tapping that same already-selected row
does not change `conversation.id`, so the effect never ran again. The effect now
ARMS the stick-to-bottom hold unconditionally — that is the intent, true with or
without geometry — and pins and spends the sentinel only when the container has
height.

**An effect that reads a ref from a conditional branch cannot be keyed on
something that never changes.** The stick-to-bottom `ResizeObserver` watches
`messagesContentRef`, which lives in the LOADED branch, so on a real open (always
`loading: true` at mount) it is null, the effect returns early, and
`[conversation?.id]` never changes to re-run it — the observer was never attached
in production at all. Its deps are `[conversation?.id, loading]` now. Revealing
the pane resizes the content from 0 to its real height, which is a growth event
like the late images and font swaps the observer already existed to handle.

The tell that this was two bugs and not one: switching conversations always
worked, because that DOES change the id. Only the auto-selected first open broke.
A test that renders with `loading: false` from the start cannot see either half.

## Known Risk Areas

- Announcement inline tasks can drift from task completion state if tasks and assignment tables are not read consistently.
- Push notification coverage is not guaranteed just because in-app/email records exist.
- Storage attachment rules can become a security issue if signed URL or path handling is loosened.
- Realtime messaging can pass static checks but fail through channel cleanup or participant filtering.

## Tests To Prefer

- `e2e/messages.spec.ts`
- RLS tests when conversation, message, announcement, recipient, or acknowledgement policies change.
- Browser/mobile checks for attachment send, announcement acknowledgement, and targeted-recipient views.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`
