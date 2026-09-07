# M00 — coordinator gap manifest (in progress)

Wave 0, read-only. Lane reports land in this directory; this file is the deduped,
coordinator-verified roll-up. A lane's claim is not promoted here until I have either
re-checked it myself or marked it `lane-asserted, unverified`.

Reference: `audit/reference/*.dc.html` (ten artboards extracted from the owner's
"GolfHelm Messages" design canvas). Spec: `~/Downloads/GolfHelm_Messaging_Parallel_Audit_Plan_v2.md`.
Feature: `team_communications` (criticality high).

## Lane status
| Lane | State | Report |
|---|---|---|
| M03A inbox | COMPLETE | `M03A-inbox.md` |
| M03B thread | COMPLETE | `M03B-thread.md` |
| M03C composer | COMPLETE | `M03C-composer.md` |
| M03D overlays | COMPLETE | `M03D-overlays.md` |
| M01 identity | COMPLETE | `M01-identity.md` |
| M02 state | COMPLETE | `M02-state.md` |
| M04 media | COMPLETE | `M04-media.md` |
| M05 fidelity | not dispatched — see Decisions D-02 | — |

---

## TOP OF THE LIST — unresolved, and the only one that could be live in production

### G-38 — A cross-tenant injection fix may never have been applied  [CRITICAL — UNRESOLVED] [coordinator-verified]
`supabase/migrations/20260819070000_conversation_creator_cannot_inject_third_party.sql`
adds an RLS guard stopping a conversation creator from injecting a third party into a
thread. At `:100-102` the migration says of itself:

> NOT APPLIED BY THE AUTHORING SESSION. Docker was unavailable, so the clean-room local-stack
> replay could not be exercised. Ships in the PR for deliberate application.

Nothing anywhere in the repo records that the deliberate application ever happened. This is
exactly the "Applied ≠ recorded" trap `.claude/rules/database.md` documents — and that rule
notes `schema_migrations` has already been wrong in this project.

**The repo cannot answer this question.** Resolving it needs one read against production
`pg_policies`. I did not run it: the Supabase MCP requires an OAuth flow that only the owner
can complete, and starting one unasked is not mine to do. Say the word and I will walk it.

Until then treat the guard as **status unknown**, not as present. M01 additionally found
three tables shipped 2026-09-04 (`golf_message_reactions`, `golf_message_mentions`,
`golf_message_responses`) whose own migrations admit the real policies were never captured in
this repo — so their access rules are likewise unknown here. And there is **zero pgTAP RLS
coverage** on `golf_conversations`, `golf_conversation_participants` or `golf_messages`,
despite three confirmed historical cross-tenant breaches in this exact area.

---

## Confirmed findings

### G-01 — No pinned conversations exist, in UI *or* schema  [high] [coordinator-verified]
M03A F01 reports no Pinned rail in `MessageConversationRail.tsx` — the rail is search +
an Unread bucket + four time-recency buckets. I verified the half the lane could not:
**there is no pin column on either conversation table.**
- `src/lib/types/database.ts:12307` `golf_conversation_participants.Row` — columns are
  `conversation_id, id, joined_at, last_read_at, muted_until, notification_level, user_id`.
  No pin.
- `src/lib/types/database.ts:12352` `golf_conversations.Row` — `created_at, created_by, id,
  is_team_channel, is_team_chat, team_id, ...`. No pin.
- The `is_pinned`/`pinned` columns that DO exist belong to other features entirely
  (`golf_coachhelm_chat_conversations`, `golf_team_saved_courses`, `crm_notes`,
  `baseball_*`) — do not mistake them for this one.
- Approved design requires it: `audit/reference/Main.dc.html` has a labelled PINNED
  section with "See all" and 52px avatars.

**Consequence — this is the single biggest scope correction so far.** The plan treats
Pinned as a UI lane item ("real Pinned versus Recent", §24.2), implying a mislabeled list
to relabel. It is actually a **schema change**: a new column or join table, RLS, a
migration, and a contract before any UI work is possible. That routes to M01 + the
A10/A00 migration gate (§19.3), NOT to M03A. Per §23.5 no schema mutation is authorized
by the plan; this needs an explicit owner-approved migration packet.

### G-08 — A failed attachment insert is reported to the sender as SUCCESS  [high] [coordinator-verified]
M04 finding 1, and I read the whole path. The send is two unbatched statements:

- `src/app/golf/actions/message-attachments.ts:94-99` inserts the `golf_messages` row with
  `has_attachments: hasAttachments` (true whenever files were picked).
- `:120-128` then inserts `golf_message_attachments`. On error it logs and **deliberately
  falls through** — the in-code comment reads "Message was sent but attachments failed -
  log but don't fail completely ... we could try to clean up but that risks data loss".
- `:157` returns `{ success: true, messageId }` regardless.

Result: a message row with `has_attachments: true` and zero attachment rows, and a sender
told the send succeeded. This is precisely the class §1.1 makes a release blocker —
"an unknown send result must not look sent ... a silent attachment omission".

**What makes it worse than the lane could see from its own file.** The client at
`src/components/fairway/pages/messages/MessageThreadPane.tsx:576-596` already handles
"successful but empty", but its comment shows it reasons about this as a *commit-order
race* — "it means the rows are not readable YET" — and it pairs the state with a one-shot
auto-retry that "usually closes the race". In the permanent failure above there is nothing
to become readable: the rows were never written. So the recipient gets a retry affordance
that can never succeed, and the existing code comment will actively mislead the next
reader into thinking the case is already handled. Fixing the server path must include
revisiting that comment.

Related, same finding: no cleanup of the already-uploaded storage object in this mode, and
none when the client-to-server call throws (M04 finding 2). No GC job exists anywhere in
`src/` or `scripts/`, so orphans accumulate unbounded.

### G-39 — The details sheet and reactions already exist, on unmerged branches  [high] [coordinator-verified]
M03D's priority finding, and it reframes the write phase. I verified the git facts:
- `ConversationDetailsSheet.tsx` **and** `ConversationDetailsSheet.visual.test.ts` exist on
  `agent/messages-instant-entry`; neither is an ancestor of `origin/main`.
- `ci-fix-1833` and `origin/agent/messages-instant-entry` are the same commit
  (`c65dd47b5b3ef`). The **local** `agent/messages-instant-entry` is `e3aec23153edf` — so the
  local branch carries at least one commit its own remote does not. M03D described the two as
  byte-identical; that holds for the two remote-side tips, not for the local branch. Anyone
  reconciling must pick a tip deliberately rather than assume they are the same.
- M03D also reports reactions fully built on the branch with the exact five-emoji set the
  design requires.

So parts of D04 and D06 are not greenfield — they are **unmerged work to reconcile**, which is
what §24.1 means by "reconcile branches feature by feature ... preserve good fixes while
rejecting unapproved layout/state drift." Note the caveat M03D kept: even on the branch,
reactions/actions render as an inline flex row rather than the scrim/portal focus owner §12.1
requires, so the branch is a starting point, not the target.

**Consequence for the plan**: §10.3 and §21's V20 row describe the branch, not `main`. Anyone
auditing `main` against them will report gaps the plan's author had already seen fixed.

### G-40 — Group unread is shared, not per-viewer  [high] [lane-asserted]
M01 finding 3: team-chat unread goes through a shared `golf_messages.read` boolean via
`get_golf_conversations_with_details` and a conversation-wide UPDATE in
`mark_golf_messages_read` — not each participant's `last_read_at`. One member opening a
3+-person team chat clears the badge **for everyone**. A correct per-viewer fallback exists
client-side but only fires for team chats the RPC happens to miss, so the normal path is the
broken one. §17.2 violation; M-T06 FAIL.

### G-41 — DM creation is an unconstrained lookup-then-insert race  [high] [lane-asserted]
M01 finding 1: no DB-level unique or serialization constraint backs the "find or create DM"
path, so two concurrent creates for the same pair can produce two conversations. The absence
of the mechanism is observed in source; the race itself was not executed (no DB access).

### G-42 — Incoming messages have no action surface, and desktop has none at all  [med] [lane-asserted]
M03D: on `main`, non-own messages get no long-press and no Copy — worse than the spec's
Edit/Delete-only omission. Separately, desktop has no path to message actions whatsoever: the
hover row is not keyboard-focus-visible and `onContextMenu` is unconditionally suppressed with
nothing substituted. That is an accessibility gap (§15.3), not only a fidelity one.

### G-43 — A failed group-roster fetch silently renders a near-empty sheet  [med] [lane-asserted]
Same P257 masquerade shape the feature doc bars for the rail — a failure that renders as
emptiness — on a surface the rail's carve-out does not cover. Compounds G-33: the roster is
hardcoded empty anyway, so this failure mode is indistinguishable from normal operation today.

### G-44 — Signed URLs may not enforce membership  [risk] [lane-asserted]
M01: `getSignedUrlsForAttachments` signs any caller-supplied storage path behind only a
session check, with no membership check. Whether Supabase's `createSignedUrl` applies the
bucket's participant-scoped SELECT RLS the way a direct read would is not determinable from
source. Correctly labelled `risk`. Resolving it needs the same production read as G-38.

### G-33 — Group member lists are hardcoded empty  [high] [coordinator-verified]
M02's addendum, and the sharpest new item this round. `src/hooks/golf/use-golf-messages.ts:930-931`
literally sets, for every group conversation:
```
participant_ids: [],
participant_names: [],
```
And `:982-988` — the batch name lookup — is wrapped in `if (!conv.is_group)`, so groups are
skipped; even without that guard it would resolve nothing, because the array it would read is
the empty one above.

Two consequences worth separating:
1. **D04 group details has no data underneath it.** `GroupDetails.dc.html`'s member list and
   avatar stack cannot be populated from the current contract at all. Pair this with G-30
   (the thread header has no info-button slot to open the sheet from) and M03D is looking at
   a surface with neither an entry point nor a data source — not a re-skin.
2. **A group's last-message sender can never be named.** `Main.dc.html:101` shows a
   `senderLabel` on group previews; nothing can resolve it today.

### G-34 — `creator_id` and `is_team_channel`: precision correction to M02  [med] [coordinator-corrected]
M02 reported that `creator_id` "is dropped at the same transform step that drops
`is_team_channel`". Directionally right, mechanically different, and the difference changes
who fixes it:
- `creator_id` is declared on the row type at `:733` and **set only in the group-supplement
  branch** (`:925`, `creator_id: conv.created_by`). The RPC branch never populates it. So it
  is not dropped in a shared transform — it is missing from one of two paths.
- `is_team_channel` is never referenced anywhere in the hook. The select at `:780` asks for
  `is_team_chat` only (`:820`, `:827`). So it is not "dropped in favour of" the other column
  at a transform step; it is simply never requested.

M01 still owns the underlying question — which of the two columns on `golf_conversations` is
authoritative — but the fix sites are different from what the lane report implies.

### G-35 — Reactions have a concrete target shape now  [med] [lane-asserted]
`Reactions.dc.html` requires a closed five-emoji vocabulary, per-emoji counts, and
viewer-own-reaction state. That turns G-17/G-28's "reactions absent" into a specifiable
contract against the `golf_message_reactions` table that already exists unused.

### G-36 — Reply/quote needs more than `reply_to_id`  [med] [lane-asserted]
`Thread.dc.html`'s quote bubble needs a hydrated sender name and a truncated excerpt, plus a
defined fallback when the reply target sits outside the unpaginated 200-message window
(G-17). Selecting the column is necessary and not sufficient.

### G-37 — The "NEW" unread divider is in the approved design  [low] [lane-self-corrected]
M02 corrected its own base report: the unread boundary appears in `Thread.dc.html`, so it is
a design requirement rather than speculation. The underlying gap (no `entryUnreadBoundary`
state) is unchanged. Noting the self-correction because it is the kind of framing error that
otherwise hardens into a wrong scope decision.

### G-26 — QA line C: metadata shoves the bubble inward. Reproducible, untested  [high] [coordinator-verified]
M03B's headline, and I read the markup. This is the defect §1.1 names in its opening
paragraph ("timestamps pushing the final outgoing bubble inward"), still live:

- `src/components/fairway/pages/messages/MessageThreadPane.tsx:1046-1053` — the per-message
  row is `flex items-end gap-2` with `justify-end` when `isOwn`.
- The message column closes at `:1254`.
- `:1256-1270` — the time + read-receipt block is a **sibling flex item of that column**,
  not nested inside it, rendered only when `showTime`.

Under `justify-end` the column and the metadata pack together against the right edge, so any
message carrying metadata sits left of its neighbours in the same group by (metadata width +
the 8px `gap-2`). On a narrow viewport the column additionally shrinks to make room, so the
bubble itself narrows. The alignment reference is the wrong element: the bubble's right edge
should be pinned to the row, with metadata below it (§8.4), not beside it.

**Nothing catches this.** Both message-pane test files run under jsdom, which computes no
real flex layout — their own comments say so. So this is a green suite over a defect the
spec calls out by name, and §24.3's "make the alignment test fail before repair" is the right
sequence. No test was written this phase, per the read-only constraint.

### G-27 — Deletes hard-remove instead of tombstoning  [high] [lane-asserted]
`applyRealtimeMessageUpdate` + `removeMessage` drop the row from the array. §8.8 requires a
tombstone. Same shape as G-19's failed-send erasure: the thread silently loses content that
the reader saw a moment ago, and in a group the other participants' view diverges.

### G-28 — Reply/quote and reactions are absent though the schema is live  [high] [lane-asserted]
`MessageThreadPane.tsx` renders neither, and its `.select()` does not even fetch the columns.
`golf_messages.reply_to_id`, `golf_message_reactions` and `golf_message_mentions` are live
production schema from 2026-09-04 migrations. So the database is ahead of the UI by a full
feature — M02 reached the same conclusion from the hook side (G-17). Two lanes, same gap.

### G-29 — Thread typography, photo layout, group header and day separators all off-spec  [med] [lane-asserted]
- Message text uses the 13px `body-sm` token where a 17px `body-lg` token **already exists**
  matching the spec target.
- Photo messages render caption-above-image inside the generic padded bubble; §8.6 wants the
  image as the object with the caption below.
- The group header shows a generic Users icon, not a member avatar stack.
- Day separators are the old hairline+label, not the capsule.
- No pagination past the newest-200 fetch (agrees with M02, G-17).

### G-30 — The thread header has no slot to hang group details from  [med] [lane-asserted]
M03B traced the `ConversationDetailsSheet.tsx` drift to its root: the header markup has no
trailing info-button slot at all. So D04 is not "a sheet that needs rebuilding" — there is
no entry point to open one. Relevant to M03D's lease and to sequencing.

### G-31 — The masthead is the wrong shape, and no bell exists in the app  [high] [lane-asserted]
M03A F10, after reading `Main.dc.html`: the artboard is title + ONE trailing bell; shipped is
title + two text buttons (Team, New message). Grep finds no bell anywhere in the Messages
surface or the shared `FairwayTopBar`. So this is not a duplicated-chrome case to
de-duplicate — it is absent, and the badge count has no existing semantics to preserve.

### G-45 — The artboard's focus glow contradicts a documented accessibility fix  [med] [coordinator-verified, DECISION-NEEDED]
M03C's F14, and the evidence is stronger than the lane put it. The artboard's `.track-on`
focus treatment is a two-layer soft glow built from `accent-500`. In
`src/styles/design-tokens.css:152-165` the light theme deliberately does NOT use accent-500
for focus, and the comment explains why at length: the shared `fwFocusRing` helper had already
hard-coded accent-600 for this reason, but **175 call sites** reached for `ring-border-focus`
directly and "every one of them was drawing a ring nobody with low vision could reliably
find." Light theme therefore resolves `--fw-color-border-focus` to `accent-600` (`:165`).

**The part the lane did not note: it is theme-dependent.** At `:512` the dark theme keeps
accent-500 on purpose — there it is the *lighter* green and is what earns contrast against a
dark ground; the comment says darkening it there "would make the ring harder to see, not
easier." So the artboard's literal value is right in dark and wrong in light. This cannot be
resolved by picking one color.

Compounding it, the plan disagrees with its own artboard: §9.1 asks for a focus edge that is
"crisp, not a wide blurry green glow", while the artboard draws exactly that glow. Three-way
conflict — plan prose, artboard, and a documented WCAG fix. Owner decision; a UI lane must not
settle it, and any resolution needs a contrast re-check per theme.

### G-46 — `AttachmentPreview.tsx` is unmigrated legacy, and unleased  [med] [coordinator-verified]
`src/components/golf/messages/AttachmentPreview.tsx` renders inside every composer attachment
state and is still entirely legacy classes — `warm-700/600/500/400/200/100/50`, `red-600/500/50`,
`primary-600/500`, `cream-*` — all banned by `.claude/rules/design-system.md`.

Two things make this worse than one stale file. It sits under `src/components/golf/messages/**`,
which the registry maps to this feature (`memory/registry.yml:1001`) but which **no §19.3 lease
row covers** — every lease names `src/components/fairway/pages/messages/*`. And because it is
reused inside states M03C owns, composer fidelity cannot be achieved without editing a file
outside every current lease. Add it to a lease before the write phase, or the first UI worker
to touch it violates §19.3 by necessity.

### G-47 — Composer geometry: the numbers, now that the artboard supplies them  [med] [lane-asserted]
- The outer raised "glass dock" (28px radius, translucent cream, backdrop-blur, three-part
  shadow) **does not exist** — the code has one flush flat footer, not two layered surfaces.
- Send button is a rounded square (`rounded-fw-md`, 14px); the artboard wants a full circle,
  which is what `--fw-radius-full`'s own token comment says it is for ("primary CTAs").
- Mobile send circle is 44px visible against the artboard's 40px — inverting §9.1's own
  visible-40px / hit-area-44px split by enlarging the visible circle instead of the tap zone.
- Track alignment is hardcoded `items-end`; the artboard bottom-aligns only once the field has
  grown, staying centered at rest.
- Placeholder is generic "Type a message…" where the artboard names the recipient
  ("Message Cole") — upgraded to source-confirmed.

### G-32 — Most artboard values already map onto unused existing tokens  [info] [lane-asserted]
The most useful thing M03A's artboard pass produced. Search well, unread-row shadow
(byte-identical to `--fw-shadow-card`), unread/pinned radii, Pinned-rail and avatar-fallback
colors are **exact matches to tokens already in `design-tokens.css`, simply unused on this
page**. Two values are genuinely unmapped and go to A03 per §14.2: a recurring two-stop cream
gradient used in four places (one new token, not four) and the solid green gradient's second
stop, near but not equal to `--fw-color-accent-650`.

M03C's composer pass reached the same conclusion independently: surface, surface-sunken,
border-subtle, text-tertiary/-primary/-on-accent, accent-500/600/700/750 and radius-lg are all
byte-identical or near-identical matches to existing tokens. Its two unmapped values are the
send-on gradient's second stop and the failure-banner red (between `--fw-color-danger` and
`-danger-ink`). Across two lanes the pattern holds: the token file already contains nearly
everything the design needs.

This materially lowers the estimate for the visual lane: much of the gap is applying tokens
that exist, not negotiating new ones. Related cheap win (M03A F11): the page uses flat
`bg-canvas` where the already-wired `bg-canvas-gradient` utility nearly byte-matches the
artboard — a three-call-site class swap.

### G-19 — Failed sends erase the message instead of retaining it  [high] [cross-lane confirmed]
M03C finding 2. On failure `src/hooks/golf/use-golf-messages.ts` rolls the optimistic bubble
out of the thread — `setMessages(prev => prev.filter(m => m.id !== optimisticId))` at `:599`,
`:604` and `:611`, one per failure branch — and a toast is the only trace. §9.2 requires a
muted-but-retained failed bubble with a retry affordance. Deleting the user's message on
failure is the specific shortcut the spec names.

Compounding it (M03C finding 6, verified at `MessageComposer.tsx:199-206`): a send in flight
does not lock the textarea, and on success `setMessage('')` runs unconditionally. Text typed
during the round trip is wiped. §9.3 forbids this explicitly.

### G-20 — Two of six composer states do not exist  [high] [lane-asserted]
Replying and Did-not-send have no implementation in `MessageComposer.tsx` — no reply-context
slot, no failure banner, no Retry. Unknown-commit and definitive-rejection also collapse into
one generic toast, so the §9.5 outcome taxonomy is absent: nothing can distinguish "we don't
know" from "it was refused".

### G-21 — Attachment send fails OPEN  [med] [coordinator-verified]
`MessageComposer.tsx:193-197`:
```
if (hasAttachments && onSendWithAttachments) { ...withAttachments } else { onSend(text) }
```
If the handler were ever absent, the text sends and **the files are silently dropped**. The
production call site always passes it, so this is latent, not live — but the fallback should
refuse, not send a lesser message. §1.1's "silent attachment omission" is the named risk.

### G-22 — Five-line growth is a hardcoded 120px  [med] [coordinator-verified]
`MessageComposer.tsx:91` and `:273` clamp 40→120px. §9.4 requires computed lines. At the
token line-height of 24px that is ~4.3 lines at default text size — it undershoots before
large-text settings are even considered, which is the case §9.4 was written to protect.

### G-23 — No IME composition guard on Enter-to-send  [med] [coordinator-verified]
Grepping the messages tree for `isComposing` and `229` returns nothing. Enter during an IME
composition sends a partial word. `MessageComposer.enterKey.test.tsx` exists and passes
without ever exercising this — a green suite over an untested contract, exactly the shape
`.claude/rules/quality-gates.md` warns about.

### G-24 — No cancel path for an in-flight upload  [med] [lane-asserted, artboard-confirmed]
M04-08: `reference/Composer.dc.html:108-110` shows an explicit cancel (X) mid-upload, but
grep finds no `AbortController` or cancel path anywhere in `src/lib/storage/attachments.ts`
or `use-message-attachments.ts`. If M03C built the button there would be nothing to call.

### G-25 — "Shared files" needs a conversation-scoped query that does not exist  [med] [lane-asserted, artboard-confirmed]
M04-09: `reference/GroupDetails.dc.html:122-140` (list) and `:74-77` (Files quick action)
require attachments scoped to a conversation. Every read in `message-attachments.ts` is
scoped to one `messageId` or an explicit path list. A missing capability, not a re-skin.

### G-09 — Upload progress is fabricated  [med→high] [cross-lane confirmed, artboard-confirmed]
`src/lib/storage/attachments.ts:296-323` hardcodes 10/90/100 with the comment "we simulate
progress for UX". §1.1's "no false progress" is a release requirement.

Both other lanes sharpened this. M04's addendum found `reference/Composer.dc.html:93` labels
the state "Attachment — staged, with real upload progress" and renders a continuous 62% fill
with a proportional bar (`:102`, `:105`) — so it is a fidelity gap as well, and unfixable by
interpolation because no byte signal exists to interpolate. M03C found the other end: the
composer never updates `uploadProgress` after staging and `FairwayMessages.tsx` never wires
`onProgress` through to the upload hook, so today **no progress reaches the UI at all**.
Fixing this means adopting a real transfer callback (Supabase resumable/TUS), which also
supplies the byte signal G-24's cancel needs — one change closes both.

### G-10 — Notification defaults mean a message may notify in-app only  [info/policy] [lane-asserted]
Message email runs through `notifyNewMessage` → `sendEmailNotification` → `gateCustomerEmail`,
gated by `HELM_CUSTOMER_EMAIL_ENABLED` (default off). Push is real (APNs edge function, not
a stub) but gated by a `push_messages` preference that defaults OFF. In-app bell is
unconditional. Under default config a new message reaches a recipient only via the in-app
bell. Not a defect — a policy fact the owner should confirm is intended.

### G-11 — Attachment sends have no transport retry  [low] [lane-asserted]
Text sends get `withOneTransportRetry`; attachment sends get nothing, and no doc says that
asymmetry is deliberate. Note the feature doc records the exact field incident that
motivated the text-send retry, which makes the gap more likely an oversight than a choice.

### G-12 — Typing-status broadcast channel may not be RLS-scoped  [low] [risk]
`src/hooks/golf/use-golf-messages.ts:429` — the typing channel is not configured as a
Supabase private channel; broadcast events are not RLS-scoped the way `postgres_changes`
are. M04 correctly labelled this `risk`, not `observed`, having no live project access.

### G-13 — A slow fetch for an abandoned conversation overwrites the open one  [high] [coordinator-verified]
M02 finding 1, verified end to end:
- `src/components/fairway/pages/messages/FairwayMessages.tsx:121` —
  `useGolfMessages(selectedConversationId || '')`. The conversation id is an **argument**,
  not a React key, so switching conversations does NOT remount; there is exactly one
  persistent hook instance owning one `messages` state.
- `src/hooks/golf/use-golf-messages.ts:294` `fetchMessages` — and `:347`
  `setMessages(((data || []) as MessageWithReadStatus[]).reverse())` fires
  **unconditionally**. It never compares the id captured in its closure against the
  currently-selected one.
- Grepping the whole hook for `AbortController`, `abort`, `signal`, `generation`,
  `requestId` returns nothing (the single `abort` hit is an unrelated comment at `:728`).

So an in-flight fetch for conversation A resolves after the user opens B and writes A's
messages, loading and error into B's view. The `useCallback` is recreated on id change, but
the already-running promise from the old closure still calls the same shared setter — a
new callback identity does not cancel an outstanding request. FAILs M-T01.

### G-14 — Two unequal send paths, and the weaker one is the mobile-failure-prone one  [high] [cross-lane confirmed]
`useGolfMessages.sendMessage` has an optimistic bubble, a collision-proof id and
`withOneTransportRetry`. `useMessageAttachments.sendMessageWithAttachments` has none of the
three and uses a different id scheme. §17.3 requires ONE send operation.

This is the same defect M04 reached from the media side (G-11), so two lanes confirm it
independently. The sharp edge: the feature doc records a real field incident (two
Shenandoah phones, 2026-09-01/02) where a WebKit "Load failed" transport drop lost a send
with `navigator.onLine === true`. Text sends were hardened against exactly that. Attachment
sends — the heavier, slower, more drop-prone request — were not.

### G-15 — Fabricated `id: ''` rows in the inbox view model  [med] [coordinator-verified]
`src/hooks/golf/use-golf-messages.ts:1044` and `:1091` build `last_message` with a literal
`id: ''` (the second carries the comment "Not returned by function, but not typically
needed"). §16.1 names this anti-pattern explicitly. Any consumer keyed on message id sees
every conversation's last message share one empty id.

Same area: the RPC returns a real `is_team_channel` column that is silently dropped in
favour of a different `is_team_chat` column. Both exist on `golf_conversations`
(`src/lib/types/database.ts:12352`) — M01 should say which is authoritative before any UI
branches on either.

### G-16 — No reconnect or foreground resync  [high] [lane-asserted]
M02 finding 4: realtime "connected" is treated as "caught up". A background/network gap
silently drops messages until the user navigates manually. §13.4 requires reconnect
feedback; this is the state bug underneath it, and it compounds G-06 (no offline handling).

### G-17 — Fields exist in the database but are never selected  [med] [lane-asserted]
`reply_to_id`, `kind`, `payload`, `pinned_at` exist in the schema and generated types but
are not selected by the hook — the same bug class as the already-fixed `has_attachments`
incident. Reactions have **zero code reference anywhere in `src/`** outside generated types.
No pagination beyond newest-200 exists.

Note how this lands against G-01: `pinned_at` exists on a messages-side table, which is
about pinning a *message*, not a *conversation*. It does not satisfy the inbox PINNED
section. M01 should confirm.

### G-18 — Duplicate-key short-circuit does not verify equivalence  [low] [lane-asserted]
`src/app/actions/messages.ts:168-170` treats a 23505 duplicate as success without checking
sender/conversation/content equivalence (§17.3). Not exploitable given current client
discipline, but unenforced in code. M01 owns the file.

### G-02 — Mute is backed by schema but has no UI  [med] [coordinator-corrected, independently confirmed]
M03A F07 grouped "draft/muted/failed-send" together as having neither UI state nor data
fields. That is right for draft and failed-send, but **wrong for mute**:
`golf_conversation_participants` already carries `muted_until` AND `notification_level`
(`src/lib/types/database.ts:12307`). So mute is a pure UI/wiring gap, not a schema gap —
materially cheaper than the other two, and it should not be bundled with them in
sequencing.

M04 reached the same conclusion independently from the other direction: both columns are
**read and written nowhere in `src/`**. So there is no mute UI *and* no enforcement — the
schema is inert. Two lanes agreeing from opposite ends makes this the best-evidenced
finding in the manifest.

### G-03 — Unread rows carry no material elevation  [high] [lane-asserted, unverified]
M03A F02, `MessageConversationRail.tsx:139-224`: unread is signalled only by text weight,
color and a count badge; §6.2 requires a raised surface + contact shadow. Compare against
`Main.dc.html` for the literal target values before implementing.

### G-04 — No filter row; the visible "Team" control is a different feature  [high] [lane-asserted, unverified]
M03A F03: there is no All/Unread/Team filter row and no compose control within one. The
"Team" button on screen is `FairwayTeamBroadcastSheet`'s trigger — a broadcast composer,
not a filter. Worth holding onto: it would be easy for a later reader to credit this as
the spec's Team filter and score the check green.

### G-05 — No stale/retry cue on background-refresh failure with rows on screen  [med] [lane-asserted]
M03A F04. Distinct from the accepted P257 rail-failure semantics, which cover the
*empty* case; this is the rows-already-shown case.

### G-06 — No offline handling anywhere in the messages tree  [med] [lane-asserted]
M03A F05, grep returned zero hits. §13.4 requires reconnect feedback.

### G-07 — No draft or failed-send row state  [med] [lane-asserted]
M03A F07, minus the mute half corrected in G-02.

## Not a gap
- Avatar no-photo fallback (initials → neutral glyph) is spec-compliant —
  `src/components/fairway/controls/avatar.tsx:78-136` (M03A F08). §6.3 satisfied.

## Risk items (traced in source, not executable this phase)
- M03A F06: search well shares a token with selected-row background — may collapse two
  distinct states visually. Needs rendered evidence.
- M03A F09: two different day-boundary rules, one for row time and one for section
  grouping. Needs a date-boundary fixture to confirm.

---

## Decisions needed from the owner
- **D-01 Presence and unread counts.** Now evidenced from three lanes. M03A: no presence
  data source exists in `use-golf-messages.ts` — no Realtime Presence channel, no
  online-status column read. M04: the existing typing-broadcast channel is not even a private
  channel (`use-golf-messages.ts:429`), which is the minimum plumbing §17.6 presence would
  need. M04 also notes `Main.dc.html` shows dots on 2 of 5 pinned avatars and omits 3, and
  that the markup alone cannot tell you whether the dot means "online" or something else.
  The masthead bell badge (`Main.dc.html:28`, "7") is separately green-field: no bell exists
  anywhere in the app, so there is no semantics to preserve — someone has to decide what it
  counts. Original note follows.
- **D-01a (original wording).** `Main.dc.html` shows presence dots on pinned
  avatars and an unread count badge on the masthead bell. §24.5 forbids *inventing*
  presence/"Active now". The design asks for it; the plan forbids fabricating it. Needs
  an owner call, plus M01's answer on whether any authorized data could back it.
- **D-02 M05 dispatch.** M05 (independent fidelity review) is not runnable as written —
  §24.6 requires comparing rendered components against the reference, and nothing has
  been rendered this phase. Either accept a source-level M05 with that limitation stated,
  or defer M05 to a phase where the app is actually running.
- **D-05 Focus-ring color.** G-45 — a three-way conflict between §9.1's prose, the artboard's
  accent-500 glow, and a documented 175-call-site WCAG fix that deliberately chose accent-600
  for light and accent-500 for dark. Needs an owner call plus a per-theme contrast re-check.
- **D-04 Branch reconciliation.** G-39 means the write phase starts by deciding what to take
  from `agent/messages-instant-entry` / `ci-fix-1833` (details sheet, reactions) rather than
  building from zero. That decision precedes any M03D implementation work, and the local-vs-
  remote tip divergence has to be resolved first.
- **D-03a Group member roles.** M02 found no candidate column for an "Admin" role badge on
  `golf_conversation_participants` (its columns are `conversation_id, id, joined_at,
  last_read_at, muted_until, notification_level, user_id`). §24.5 forbids inventing roles.
  If `GroupDetails.dc.html` shows role text, that needs an owner decision and probably a
  schema change — do not let a UI lane infer one.
- **D-03 Pinned scope.** G-01 turns a UI item into a migration. Confirm before anyone
  designs against it.

## Plan-vs-tree drift
- §19.3 leases `ConversationDetailsSheet.tsx`; the file does not exist.
- `FairwayTeamBroadcastSheet.tsx` and `conversation-kind.ts` appear in no lease row.
- §24.2 assumes a Recent-vs-Pinned relabel; no such list exists (G-01).
- §24.2 assumes a Team filter tab; that control is a broadcast composer (G-04).
- §11.1 calls the D10 reference partial; `NewMessage.dc.html` is a complete artboard. M03D
  separately confirms §11 should stay `proposal` for a different reason: no ad hoc
  multi-recipient group-creation flow exists anywhere — only single-select DM
  (`FairwayNewMessageSheet.tsx`) and fixed-team broadcast (`FairwayTeamBroadcastSheet.tsx`).
- §10.3 and §21's V20 row describe the unmerged branch, not `main` (G-39).
- M03D's lease recommendation: `FairwayTeamBroadcastSheet.tsx` joins M03D's lease;
  `conversation-kind.ts` needs an explicit shared-file lease (3+ consumers across lanes).
- **Check-id collision, and it already cost a lane time.** §4's `V18`/`V19` are composer
  backlog items owned by M03C; §21's `M-V18`/`M-V19` are bubble/thread acceptance checks
  owned by M03B. The bare form "V18-V19" appears in §19.2's M03C row. M03C correctly scored
  only the §4 pair and flagged the ambiguity rather than guessing. **M-V18/M-V19 are M03B's**
  and fall inside its brief. Anyone reading a lane report must check which table a bare
  `V<n>` refers to.
- §16 assigns search state to M01/M02, but search lives entirely in
  `MessageConversationRail.tsx` — M03A's leased file (M02). The lease and the ownership
  table disagree.
- `docs/PUSH_NOTIFICATION_AUDIT.md` claims message push is missing/critical. It is
  self-marked STALE and the current fanout code does dispatch push for `new_message`
  (M04). The doc is in this feature's mapped doc set, so it will mislead the next reader.
