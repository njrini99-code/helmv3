# M03D — overlays, groups and recipients specialist

## Files inspected

Canonical tree (`/Users/ricknini/Downloads/helmv3`, HEAD `3c90f9f17`, branch `main`):
- `src/components/fairway/pages/messages/conversation-kind.ts` (40 lines, full read)
- `src/components/fairway/pages/messages/index.ts` (16 lines, full read)
- `src/components/fairway/pages/messages/FairwayNewMessageSheet.tsx` (480 lines, full read) + `FairwayNewMessageSheet.test.tsx` (grepped, not fully read)
- `src/components/fairway/pages/messages/FairwayTeamBroadcastSheet.tsx` (453 lines, full read)
- `src/components/fairway/pages/messages/MessageThreadPane.tsx` (1318 lines; read in full for header/details/actions/reactions regions: 1–460, 800–950, 1090–1260; grepped elsewhere)
- `src/components/fairway/pages/messages/FairwayMessages.tsx` (728 lines; read 120–340 in full — group-participant fetch, new-conversation/broadcast wiring; grepped elsewhere)
- `src/hooks/golf/use-golf-messages.ts` (1183 lines; read 555–585, grepped for `reaction`)
- `src/lib/types/database.ts` (grepped/read at specific line ranges: `golf_message_reactions` 14135–14164, `golf_messages` 14198–14232, `golf_conversation_participants` 12307–12335, `users.notification_preferences` 20435–20453)
- `supabase/migrations/20260904160000_golf_messaging_structured.sql` (grepped, not fully read)
- `.claude`/plan files: `GolfHelm_Messaging_Parallel_Audit_Plan_v2.md` §10–12, §19.3, §21, §22, §24.5; `00-SHARED-BRIEF.md`; `memory/features/team-communications.md`

Unmerged branches, read via `git show <ref>:<path>` (read-only, no checkout, nothing written to canonical):
- `agent/messages-instant-entry` (tip `e3aec2315`) and `ci-fix-1833` — byte-identical for the files below (`git diff` empty)
  - `src/components/fairway/pages/messages/ConversationDetailsSheet.tsx` (147 lines, full read)
  - `src/components/fairway/pages/messages/MessageThreadPane.tsx` (header region 1075–1215 and action/reaction region 1460–1560, full read; grepped elsewhere)
  - `src/components/fairway/pages/messages/FairwayMessages.tsx` (grepped for `groupParticipants`, `onSearch`)
  - `src/lib/golf/message-reactions.ts` (11 lines, full read)
  - repo-wide `git grep onSearch` and `git grep -i reaction` over the branch tree

Git history: `git log --all -- '**/ConversationDetailsSheet*'`, `git log --all --diff-filter=A/D`, `git merge-base --is-ancestor`, `git branch --all --contains` to establish which commits are/aren't reachable from `main`.

## Priority task — where the group-details surface actually lives

**It does not exist on `main` at all.** `MessageThreadPane.tsx:855-898` is the entire thread header: a Back button, a static glyph/avatar, a truncated title, and an optional subtitle line. There is no `onClick`, no button role, no state variable anywhere in the file that opens any details/member/mute/search/leave surface — verified by reading the full header block and by grepping the file for `detail`, `mute`, `leave`, `member`, `Sheet` (only one incidental match, unrelated). Tapping the identity does nothing on `main`. §10.3's "not a small spacing discrepancy" framing undersells this: on the audited tree there is zero implementation, not a stripped-down one.

**The surface exists only on two unmerged branches**, `agent/messages-instant-entry` (tip `e3aec2315`) and `ci-fix-1833` (tip `c65dd47b5`), with byte-identical content for every file this lane touches:
- `src/components/fairway/pages/messages/ConversationDetailsSheet.tsx` — 147 lines, new file, spec-labeled `spec §37` in its own header comment.
- Wired in `MessageThreadPane.tsx:1208-1214` (the `<ConversationDetailsSheet .../>` mount), opened from two triggers: the identity button (`:1130-1138`, `onClick={() => setDetailsOpen(true)}`) and a `MoreHorizontal` kebab (`:1196-1204`, same handler).
- `git merge-base --is-ancestor e3aec2315 HEAD` returns false — neither branch is an ancestor of current `main`. `c65dd47b5` on `ci-fix-1833` is titled "merge: main into the messaging rebuild," so the two branches have already diverged from each other in ways beyond this file (unverified — no `gh`/network access this phase; `dangerouslyDisableSandbox` was not requested for this read-only audit).

**Conclusion for the write phase:** the real lease target is not "the existing partial names list" inline in `MessageThreadPane.tsx`/`FairwayMessages.tsx` on `main` — it is `ConversationDetailsSheet.tsx` plus its ~140-line `MessageThreadPane.tsx` wiring on one of those two unmerged branches. Which branch becomes the write-phase base (or whether it's rebuilt fresh on top of current `main`) is the lead's call, not mine — I did not have PR/CI state to see if either is otherwise farther along or closer to landing.

## Findings

### F1 plan-drift: §10.3's baseline is the unmerged branch, not the audited tree [plan-drift] [severity: high]
- Evidence: `main` has no details surface at all (`MessageThreadPane.tsx:855-898`); the branch's `ConversationDetailsSheet.tsx` (full file, `agent/messages-instant-entry`) has exactly what §10.3 describes.
- Spec: plan §10.3 — "The reread feature-branch details sheet contains name/count, one search row, and member names."
- Gap: §10.3 is accurate against the *branch*, not against `main`, which is the tree the brief instructed this audit to inspect (`00-SHARED-BRIEF.md:5`). Anyone reading §10.3 as a description of current `main` will understate the gap from "stripped-down" to "absent."

### F2 observed: branch's D04 implementation — what exists and what's missing [observed] [severity: high]
- Evidence: `ConversationDetailsSheet.tsx` (branch, full read) renders: centered name + optional DM avatar; a member count line (`isGroup && members.length > 0`); one "Search messages" row; a flat `<ul>` of member rows (avatar-or-nothing + name, alphabetically sorted).
- Spec: plan §10.2's nine-part composition — scrim+grip sheet, avatar stack, creation metadata, three action tiles (Mute/Search/Files), Members heading + capability-gated Add, Show all, shared-files preview, Leave group.
- Gap: no avatar stack (only a plain `Users` icon for a group; the trigger *button* in `MessageThreadPane.tsx` has an `AvatarGroup` for ≥2-photo groups, but that stack is in the header pill, not inside the sheet itself, at `agent/messages-instant-entry:MessageThreadPane.tsx:1148-1163`), no creation metadata line, no three-tile row, no Add, no Show all, no shared-files preview, no Leave group action. Confirms §10.3's claim item-for-item.

### F3 observed: the branch's "Search" row is unreachable dead code [observed] [severity: med]
- Evidence: `ConversationDetailsSheet.tsx:38,48,98-113` (branch) — `onSearch?: () => void` prop, row gated `{onSearch ? ... : null}`. `MessageThreadPane.tsx:1208-1214` (branch) instantiates the sheet with `name`, `isGroup`, `avatar`, `participants` only — no `onSearch`. `git grep -n onSearch` across the *entire* `agent/messages-instant-entry` tree turns up zero call sites that pass it into this component (only the prop's own declaration/usage and unrelated `onSearch` props on other, non-messages components).
- Spec: plan §10.4's Action-contracts table — "Search: opens an identified conversation scope... returns to the same place after result exploration."
- Gap: this is stronger than §10.3's own characterization ("its search focuses the inbox search instead of establishing a conversation-scoped search"). The code doesn't do the wrong thing — it doesn't render at all, because the one caller never supplies the callback. §10.4's "decorative vs. authorized operation" question resolves to "neither is reachable."

### F4 source-confirmed: a failed group-roster read renders a silently near-empty details sheet [source-confirmed] [severity: high]
- Evidence: `fetchGroupParticipants` exists near-identically on `main` (`FairwayMessages.tsx:141-186`) and the branch — on a `participantsError` from `golf_conversation_participants`, it logs the error and returns `new Map()`, with no error flag surfaced to the caller. `ConversationDetailsSheet.tsx` (branch) gates both the member-count line and the entire Members section on `members.length > 0` (lines ~88-93, ~117-140) — there is no separate loading/error branch for that section.
- Spec: plan §10.5 — "Member loading has member-shaped placeholders... a failed file query says it could not load. Do not hide the whole sheet behind a spinner." (Same principle for the member list, its explicit sibling requirement in the same paragraph.)
- Gap: a denied or transiently-failed roster read is indistinguishable from "this group genuinely has one visible member" or "still loading" — title renders, nothing else does, no retry, no error text. `memory/features/team-communications.md`'s P257 rail rule ("a failed load must never render the cheerful 'No conversations yet'") is explicitly scoped to the rail in the shared brief's accepted-behavior list, so this is not exempted by that carve-out — it is the same masquerade shape on a different surface.

### F5 observed: reactions are entirely absent from `main`; fully built (differently) on the branch [observed] [severity: high]
- Evidence: `golf_message_reactions` exists in the live schema (`database.ts:14135-14164`, `emoji`/`message_id`/`user_id`), created by `supabase/migrations/20260904160000_golf_messaging_structured.sql`. Grepping every file in `src/components/fairway/pages/messages/` on `main` for `reaction` returns zero matches; `use-golf-messages.ts:570-572` only has a comment noting the column exists. On the branch, reactions are fully wired: `src/lib/golf/message-reactions.ts` defines `GOLF_QUICK_REACTIONS = ['👍','❤️','😂','👀','✅']` (exactly the spec's five), consumed by `useGolfMessageReactions` and a `ReactionChips` component inside `MessageThreadPane.tsx`.
- Spec: plan §12.3 — "Use the app's existing five choices: thumbs-up, heart, laughing, eyes, and check... do not add a generic full emoji picker."
- Gap: on `main`, this is a 100% gap (no reaction feature of any kind). On the branch, the emoji set is exactly right; see F6 for the presentation gap that remains even there.

### F6 observed: even on the branch, reactions/actions are an inline row, not the D06/D07 focus-owner overlay [observed] [severity: high]
- Evidence: branch `MessageThreadPane.tsx:1497-1547` renders the quick-reaction strip and action list as a `<div className="relative mt-1 flex flex-col gap-1 lg:hidden" ...>` — a sibling flex child pushed into the message's own column, toggled by `mobileActionsId === msg.id`. `main`'s equivalent (Copy/Edit/Delete only) is the same shape at `MessageThreadPane.tsx:1114-1126`. Neither uses a scrim, a portal, a dimmed background, or a measured/anchored clone of the selected bubble.
- Spec: plan §12.1 — "one visual composition, one focus owner... Do not replace this with a generic centered modal or a permanently visible inline row of tiny action icons... Reuse the existing overlay framework."
- Gap: this is the anti-pattern the spec names, in a gesture-gated (not permanently-visible) form. Toggling by long-press avoids "permanently visible," but the structural requirement — one focus scene with the rest of the thread receding — is unmet in both trees.

### F7 observed: on `main`, incoming (other-authored) messages have no action surface of any kind [observed] [severity: med]
- Evidence: `MessageThreadPane.tsx:1099` wraps the entire own-message-controls block in `isOwn && ...`; the long-press spread at `:1190` is `{...(isOwn ? longPressHandlers(msg.id) : {})}`. An incoming message gets neither the hover row nor the long-press handlers nor the mobile action menu — no Copy, no Reply (Reply doesn't exist on `main` at all; see below).
- Spec: plan §12.4 — "Incoming messages omit Edit/Delete unless capabilities explicitly permit them" (implying Reply/Copy remain available on incoming messages).
- Gap: `main` omits the entire menu on incoming messages, not just Edit/Delete — a player cannot copy or (once built) reply to a coach's message. The branch fixes this: `longPressHandlers(msg.id)` is applied unconditionally there (`MessageThreadPane.tsx:1626` on the branch), with only the Edit/Delete icons individually gated by `isOwn` inside the menu.

### F8 observed: `main` has no non-touch path to message actions — the §12.2 "long-press-only" violation with a citation [observed] [severity: med]
- Evidence: the desktop hover row is `className="... opacity-0 transition-opacity group-hover:opacity-100 lg:flex"` (`MessageThreadPane.tsx:1101`) — no `group-focus-within` or `focus-visible` variant, so keyboard-focused controls are not visibly indicated even if technically tab-reachable. Separately, `longPressHandlers` unconditionally attaches `onContextMenu: (e) => e.preventDefault()` (`:451`) to any bubble it's spread onto, which happens at every viewport width for own messages, while the mobile action menu itself is `lg:hidden` (`:1114`). Right-clicking your own message on a desktop-width viewport therefore suppresses the native browser context menu and opens nothing.
- Spec: plan §12.2 — "The menu should also be reachable by accessible explicit actions, keyboard/context-menu mechanisms... Do not make a long press the only path to reply or copy."
- Gap: on mobile, long-press genuinely is the only path (no persistent kebab — the code comment at `:1109` says so explicitly: "No persistent kebab"). On desktop, the one native alternative (right-click) is actively disabled with nothing substituted.

### F9 risk: `conversation-kind.ts`'s "one derivation" is not actually used everywhere its own file is imported into [risk] [severity: low]
- Evidence: `MessageThreadPane.tsx:812` uses `isGroupConversation(conversation)` for `isGroup` (avatar/title); `MessageThreadPane.tsx:823` computes `headerSubtitle` from `conversation.is_group` directly, not from the `isGroup` constant three lines above it.
- Spec: `conversation-kind.ts:20-27`'s own doc comment — "One derivation, used everywhere" — describing exactly the avatar/subtitle disagreement this file exists to prevent.
- Gap: for a conversation where `is_group` and `participant_count` disagree (the file's own doc says this happens for a broadcast sent to one player, and could in principle happen in the other direction too), the avatar/title and the subtitle can render inconsistent identities again — the same bug class the file was written to close, reopened by one line that never got converted. I could not confirm this combination occurs in live `golf_conversations` data (no DB query run this phase) — recording as `risk`, not `observed`. Confirming it needs a query for `is_group=false AND participant_count>2` or `is_group=true AND participant_count<=2` rows.

### F10 observed: Mute is schema-ready but has zero application-layer wiring — a UI/action gap, not a migration [observed] [severity: med]
- Evidence: `golf_conversation_participants.muted_until` (timestamptz) and `.notification_level` (string) exist in the live schema (`database.ts:12313-12314`). `grep -rl "muted_until\|notification_level" src/app src/hooks src/components` returns nothing on `main`; the same grep against the branch tree via `git grep` returns only `database.ts` itself. Separately, `users.notification_preferences` (`database.ts:20435`, keys `email_messages`/`push_messages` per commit `87d53761a`) is a global, all-conversations toggle, not per-conversation, and cannot stand in for it.
- Spec: plan §10.4 — "Mute: Updates only this viewer's permitted notification preference and actually changes delivery policy."
- Gap: implementing the D04 Mute tile needs a new server action reading/writing the existing `muted_until`/`notification_level` columns plus UI — no schema change required. Worth stating precisely because it changes the write-phase estimate for that one tile from "needs a migration" to "needs an action."

### F11 observed: no ad hoc multi-recipient private-group flow exists anywhere; two narrower flows exist instead [observed] [severity: high]
- Evidence: `FairwayNewMessageSheet.tsx` (480 lines, full read) is single-select only — `selectedId: string | null` (not a `Set`), one "Start conversation" primary action, `onSelect(userId: string)`. `FairwayTeamBroadcastSheet.tsx` (453 lines, full read) is coach-only and always scoped to the coach's own team roster (`getGolfTeamPlayersForBroadcast`), framed as "New team message" → "Group details" (its own naming step, not a view of an *existing* conversation's details) → "Create group."
- Spec: plan §11.2 (explicitly marked `proposal` per §11.1's evidence-limit note, and per the team lead's instruction to treat it as such) — "Multiple selected people creates the intended private group... chips include real names and removable controls."
- Gap: neither flow lets a user pick an arbitrary multi-person subset outside a coach's fixed team-broadcast context. This is the concrete distance from the §11.2 proposal, not a defect against an approved spec.

### F12 observed: what `FairwayNewMessageSheet.tsx` gets right, for the write phase to preserve [observed] [severity: n/a — positive]
- Evidence: dedup and selection are keyed on `userId` (auth user id), not display name or player-row id — `isSelected = selectedId === result.userId` (`:393`), and the player/teammate dedup pass keys on `r.userId` (`:262-267`). Tapping a directory row only calls `setSelectedId`, never auto-creates (`:401-412`); creation is a separate submit gated by a `creating` boolean that also blocks repeat-tap double-submit (`:300-311`). Loading/no-team/search-failed/no-match(query)/no-match(empty-roster) render four distinct `EmptyState` copy variants (`:436-459`).
- Spec: plan §11.2 ("no auto-create on directory tap"), §11.3 ("deduplicated by auth user ID," "no-match, directory-error, loading, no-team... are different").
- This satisfies those specific requirements now and should not be regressed when the sheet is extended to multi-select.

## Plan-vs-tree drift

- `ConversationDetailsSheet.tsx` (§19.3 line 823 leases it to M03D) does not exist on `main`; it exists only on unmerged `agent/messages-instant-entry` / `ci-fix-1833` (F1). This is the priority item the team lead flagged, confirmed and localized.
- `FairwayTeamBroadcastSheet.tsx` and `conversation-kind.ts` appear in no §19.3 lease row (confirmed by reading the full table, lines 815-830). `FairwayTeamBroadcastSheet.tsx` is a recipient-selection surface and belongs under M03D per §21's role-summary table (line 809: "Recipient/details/action/reaction surfaces"). `conversation-kind.ts` is consumed by at least the thread header (this lane's overlay trigger reads `isGroup` from it) and, on the branch, by `ConversationDetailsSheet.tsx` itself — a shared derivation with multiple consumers and no owner is the exact collision §19.3's closing paragraph warns against; recommend either an explicit shared-file lease or folding it under M02's "conversation state owners" row.
- §21's V20 row ("Group header/details only partially represented") describes the unmerged branch's state, not `main`'s (F1/F14 — on `main` it is not partial, it is absent).
- §10.3's "current implementation" characterization of the Search row (F3) is less true than the plan states: the row is unreachable dead code, not a misdirected search.

## Checks scored

All device/pixel-fidelity aspects of these checks are `NOT_RUN` — no screenshots exist on this machine (per shared brief) and no dev server/runtime was started (read-only constraint). Structural/wiring aspects are scored from source.

| Check | Score | Reason |
| --- | --- | --- |
| M-V37 (D04 composition) | FAIL | Absent on `main`; on branch, only title/count/member-list/dead-search exist — no avatar stack, no action tiles, no file preview, no leave (F1, F2). |
| M-V38 (Details actions scoped effects/permission gating) | FAIL | None of Mute/Search/Files/Add/Show all/Leave function on either tree; Search is unreachable dead code on the branch (F3, F10). |
| M-V39 (Member/files partial data, failed read ≠ "no files") | FAIL | No-photo members lose their avatar slot entirely; failed roster read renders as a near-empty sheet with no error text (F2, F4). |
| M-V40 (D10 proposed completion) | FAIL | No chip/multi-select/scoped-audience specimen exists in either tree (F11). |
| M-V41 (Recipient create: distinct one/multi paths, exact DM/group ops, repeat-tap safety) | FAIL (structural) | Single-DM path is correct and repeat-tap-safe (F12); no general multi-select "create group" path exists, so the compound requirement is unmet (F11). |
| M-V42 (D06/D07 focus/portal scene) | FAIL | No scrim, portal, or dimmed background in either tree; both use an inline flex row (F6). |
| M-V43 (Reaction tray: five choices, selected ring, stable order/counts, no generic picker) | FAIL (`main`) / NOT_RUN for visual fidelity (branch) | `main` has zero reaction implementation (F5). Branch has the correct five-emoji closed set with an `aria-pressed` indicator, but it is not a floating tray per D07 and chip-order/count-jump behavior cannot be assessed without a rendered screenshot. |
| M-V44 (Hold/cancel/access — reachable without long press) | FAIL | Hold-cancel-on-move works (`onPointerMove` cancels the timer); "reachable without long press" fails on both mobile (no persistent kebab) and desktop (context menu actively suppressed, hover row not keyboard-visible) (F8). |
| M-T14 (reaction convergence) | NOT_RUN | Requires two authenticated accounts and a running app; not attempted (read-only Wave 0 constraint). |
| M-T16 (member capability enforcement server-side) | NOT_RUN | No Add/Leave/Mute server actions exist yet to test (F10, F11); would need multi-user runtime regardless. |
| M-T20 (actions/accessibility: hold-yields-to-scroll, alternatives, VoiceOver, haptics-off) | NOT_RUN | Hold-yields-to-scroll is structurally present (`onPointerMove` cancels) but VoiceOver/haptics-off/large-text behavior needs a device, not attempted. |

## What I could not determine and why

- Whether `agent/messages-instant-entry` or `ci-fix-1833` is the intended write-phase base, or whether they've diverged further than the identical files I checked — no `gh`/network access was used this phase (read-only audit; invoking it would need `dangerouslyDisableSandbox`, out of scope for Wave 0).
- Whether the `is_group`/`participant_count` disagreement in F9 occurs in live data — would need a read-only query against `golf_conversations`, not run this phase.
- Any actual pixel/contrast/scrim/shadow/clipping fidelity for D04/D06/D07/D10 — no screenshots exist on this machine per the shared brief; every finding above is structural/wiring, not visual.
- `FairwayNewMessageSheet.test.tsx` and `MessageComposer.enterKey.test.tsx` and other test files in the directory were grepped for context but not read line-by-line; I can't rule out additional coverage or gaps they encode.
- Whether `AttachmentButton.tsx`/`AttachmentPreview.tsx` under `src/components/golf/messages/` interact with any overlay/action surface in my scope — grepped for reaction/context-menu terms only (no matches), not read in full (out of this lane's Section 10-12 scope).
- RLS/authorization behavior for any of the not-yet-built actions (Add, Leave, Mute) — no policies exist to read since no action exists yet; this is a write-phase design question, not an audit gap.
