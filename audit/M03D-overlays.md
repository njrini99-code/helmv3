# M03D — overlays, groups and recipients specialist

**Revision 2** — incorporates ADDENDUM 1 (approved-design artboards located as source markup).
Revision 1's main/branch source findings are retained below and re-scored where the
addendum changes what counts as approved-vs-proposal; new artboard-grounded findings
are appended (F15-F20).

## Files inspected

Canonical tree (`/Users/ricknini/Downloads/helmv3`, HEAD `3c90f9f17`, branch `main`):
- `src/components/fairway/pages/messages/conversation-kind.ts` (40 lines, full read)
- `src/components/fairway/pages/messages/index.ts` (16 lines, full read)
- `src/components/fairway/pages/messages/FairwayNewMessageSheet.tsx` (480 lines, full read) + `FairwayNewMessageSheet.test.tsx` (grepped, not fully read)
- `src/components/fairway/pages/messages/FairwayTeamBroadcastSheet.tsx` (453 lines, full read)
- `src/components/fairway/pages/messages/MessageThreadPane.tsx` (1318 lines; read in full for header/details/actions/reactions regions: 1–460, 800–950, 1090–1260; grepped elsewhere)
- `src/components/fairway/pages/messages/FairwayMessages.tsx` (728 lines; read 120–340 in full — group-participant fetch, new-conversation/broadcast wiring; grepped elsewhere)
- `src/components/fairway/overlays/Sheet.tsx` (read panel/grip/header class composition, ~1-350)
- `src/hooks/golf/use-golf-messages.ts` (1183 lines; read 555–585, grepped for `reaction`)
- `src/lib/types/database.ts` (grepped/read: `golf_message_reactions` 14135–14164, `golf_messages` 14198–14232, `golf_conversation_participants` 12307–12335, `golf_conversations` 12353–12385 incl. `created_by`/`is_team_channel`, `users.notification_preferences` 20435–20453)
- `supabase/migrations/20260904160000_golf_messaging_structured.sql` (grepped, not fully read)
- Plan: `GolfHelm_Messaging_Parallel_Audit_Plan_v2.md` §10–12, §19.3, §21, §22, §24.5; `00-SHARED-BRIEF.md` incl. ADDENDUM 1; `memory/features/team-communications.md`

Approved-design artboards (`/Users/ricknini/worktrees/helmv3/mobile-messages-audit/audit/reference/`, full read, all 390×844 source HTML with literal `oklch()`/px values):
- `GroupDetails.dc.html` (149 lines) — D04
- `NewMessage.dc.html` (140 lines) — D10, confirmed complete (not a partial crop)
- `Actions.dc.html` (62 lines) — D07, base long-press action sheet
- `Reactions.dc.html` (98 lines) — D06, reaction tray + settled chips + action sheet
- `Group.dc.html` (60 of 105 lines read — header region) — unmapped in the addendum's D-ref column, but its header is squarely §10.1 ("Group thread"), which is this lane's section

Unmerged branches, read via `git show <ref>:<path>` (read-only, no checkout, nothing written to canonical):
- `agent/messages-instant-entry` (tip `e3aec2315`) and `ci-fix-1833` — byte-identical for the files below (`git diff` empty)
  - `src/components/fairway/pages/messages/ConversationDetailsSheet.tsx` (147 lines, full read)
  - `src/components/fairway/pages/messages/MessageThreadPane.tsx` (header region 1075–1215 and action/reaction region 1460–1560, full read; grepped elsewhere)
  - `src/components/fairway/pages/messages/FairwayMessages.tsx` (grepped for `groupParticipants`, `onSearch`)
  - `src/lib/golf/message-reactions.ts` (11 lines, full read)
  - repo-wide `git grep onSearch` and `git grep -i reaction` over the branch tree

Git history: `git log --all -- '**/ConversationDetailsSheet*'`, `git log --all --diff-filter=A/D`, `git merge-base --is-ancestor`, `git branch --all --contains` to establish which commits are/aren't reachable from `main`.

## Priority task — where the group-details surface actually lives (unchanged by the addendum)

**It does not exist on `main` at all.** `MessageThreadPane.tsx:855-898` is the entire thread header: a Back button, a static glyph/avatar, a truncated title, and an optional subtitle line. No `onClick`, no button role, no state variable in the file opens any details/member/mute/search/leave surface — verified by reading the full header block and by grepping the file for `detail`, `mute`, `leave`, `member`, `Sheet`. Tapping the identity does nothing on `main`.

**The surface exists only on two unmerged branches**, `agent/messages-instant-entry` (tip `e3aec2315`) and `ci-fix-1833` (tip `c65dd47b5`), byte-identical for every file this lane touches:
- `src/components/fairway/pages/messages/ConversationDetailsSheet.tsx` — 147 lines, new file, self-labeled `spec §37` in its own header comment.
- Wired in `MessageThreadPane.tsx:1208-1214` (mount), opened from the identity button (`:1130-1138`) and a `MoreHorizontal` kebab (`:1196-1204`).
- `git merge-base --is-ancestor e3aec2315 HEAD` is false — neither branch is an ancestor of current `main`. `c65dd47b5` on `ci-fix-1833` is titled "merge: main into the messaging rebuild," so the branches may have diverged further than the identical files checked here (unverified — no `gh`/network access this phase).

**Conclusion for the write phase, now sharper with the artboard in hand:** the real lease target is `ConversationDetailsSheet.tsx` + its `MessageThreadPane.tsx` wiring on one of those two unmerged branches — but per F15 below, that 147-line file is a small fraction of what `GroupDetails.dc.html` actually specifies. It is the closest existing thing, not a near-complete one.

## Findings — main/branch source comparison (Revision 1, retained)

### F1 plan-drift: §10.3's baseline is the unmerged branch, not the audited tree [plan-drift] [severity: high]
- Evidence: `main` has no details surface at all (`MessageThreadPane.tsx:855-898`); the branch's `ConversationDetailsSheet.tsx` has exactly what §10.3 describes.
- Spec: plan §10.3 — "The reread feature-branch details sheet contains name/count, one search row, and member names."
- Gap: §10.3 is accurate against the *branch*, not `main`, which is the tree the brief instructed this audit to inspect (`00-SHARED-BRIEF.md:5`).

### F2 observed: branch's D04 implementation — what exists and what's missing (superseded in degree, not kind, by F15) [observed] [severity: high]
- Evidence: `ConversationDetailsSheet.tsx` (branch, full read) renders: centered name + optional DM avatar; a member count line; one "Search messages" row; a flat `<ul>` of member rows (avatar-or-nothing + name only, alphabetically sorted).
- Spec: plan §10.2's nine-part composition.
- Gap: no avatar stack inside the sheet, no creation metadata, no three-tile row, no Add, no Show all, no shared-files preview, no Leave group. F15 below replaces the qualitative list with the artboard's exact numbers.

### F3 observed: the branch's "Search" row is unreachable dead code [observed] [severity: med]
- Evidence: `ConversationDetailsSheet.tsx:38,48,98-113` (branch) declares and gates on `onSearch?: () => void`. `MessageThreadPane.tsx:1208-1214` (branch) instantiates the sheet without it. Repo-wide `git grep -n onSearch` on the whole branch tree finds no call site that supplies it.
- Spec: plan §10.4's action-contracts table.
- Gap: stronger than §10.3's own claim ("focuses the inbox search instead"). The row never renders at all.

### F4 source-confirmed: a failed group-roster read renders a silently near-empty details sheet [source-confirmed] [severity: high]
- Evidence: `fetchGroupParticipants` (near-identical on `main`, `FairwayMessages.tsx:141-186`, and the branch) logs and returns `new Map()` on a `participantsError`, with no error flag surfaced. `ConversationDetailsSheet.tsx` gates both the count and the entire Members section on `members.length > 0`.
- Spec: plan §10.5 — "a failed file query says it could not load... do not hide the whole sheet behind a spinner" (same principle, member list).
- Gap: a denied/failed roster read is indistinguishable from a real 1-member group or a still-loading one. Not exempted by the shared brief's rail-only P257 carve-out — same masquerade shape, different surface.

### F5 observed: reactions are entirely absent from `main`; fully built (differently) on the branch [observed] [severity: high]
- Evidence: `golf_message_reactions` exists in the live schema (`database.ts:14135-14164`). Grepping `src/components/fairway/pages/messages/*.tsx` on `main` for `reaction` returns zero matches. On the branch: `src/lib/golf/message-reactions.ts` defines `GOLF_QUICK_REACTIONS = ['👍','❤️','😂','👀','✅']`, consumed by `useGolfMessageReactions` + `ReactionChips` in `MessageThreadPane.tsx`.
- Spec: plan §12.3, now confirmed by `Reactions.dc.html`'s literal five (`👍❤️😂👀✅`, lines 60-64) — exact match to the branch's constant.
- Gap: 100% absent on `main`. Presentation gap on the branch is F6/F18.

### F6 observed: even on the branch, reactions/actions are an inline row, not the D06/D07 focus-owner overlay [observed] [severity: high] — **now artboard-confirmed, see F18**
- Evidence: branch `MessageThreadPane.tsx:1497-1547` renders the quick-reaction strip and action list as a flex child inside the message's own column, toggled by `mobileActionsId === msg.id`. `main`'s equivalent (Copy/Edit/Delete only) is the same shape at `:1114-1126`.
- Spec: plan §12.1; now `Reactions.dc.html` gives the literal target (see F18).
- Gap: confirmed structural, not merely inferred from prose.

### F7 observed: on `main`, incoming (other-authored) messages have no action surface of any kind [observed] [severity: med]
- Evidence: `MessageThreadPane.tsx:1099` wraps the entire own-message-controls block in `isOwn && ...`; `:1190`'s long-press spread is `{...(isOwn ? longPressHandlers(msg.id) : {})}`.
- Spec: plan §12.4 (Edit/Delete alone should be omitted on incoming, not the whole menu).
- Gap: `main` omits Copy/Reply too on incoming messages. Branch fixes this (`longPressHandlers` unconditional at branch `:1626`).

### F8 observed: `main` has no non-touch path to message actions [observed] [severity: med]
- Evidence: desktop hover row `opacity-0 ... group-hover:opacity-100 lg:flex` (`:1101`), no `focus-within`/`focus-visible` variant. `onContextMenu: (e) => e.preventDefault()` (`:451`) is unconditional wherever `longPressHandlers` is spread, while the mobile menu is `lg:hidden` — so desktop right-click suppresses the native menu and opens nothing.
- Spec: plan §12.2 — "Do not make a long press the only path to reply or copy."
- Gap: mobile has no alternative to long-press ("No persistent kebab," `:1109` comment); desktop's one native alternative is disabled with nothing substituted.

### F9 risk: `conversation-kind.ts`'s "one derivation" is not converted at every call site [risk] [severity: low]
- Evidence: `MessageThreadPane.tsx:812` uses `isGroupConversation(conversation)` for `isGroup`; `:823`'s `headerSubtitle` reads `conversation.is_group` directly instead.
- Spec: `conversation-kind.ts:20-27`'s own doc comment.
- Gap: could reintroduce the avatar/subtitle disagreement the file exists to prevent. Not confirmed against live data this phase — needs a query for `is_group=false AND participant_count>2` or the reverse.

### F10 observed: Mute is schema-ready but unwired [observed] [severity: med]
- Evidence: `golf_conversation_participants.muted_until` / `.notification_level` exist (`database.ts:12313-12314`); grep for either across `src/app src/hooks src/components` (main) and via `git grep` on the branch returns nothing outside `database.ts`. `users.notification_preferences` (`database.ts:20435`) is a separate, global, all-conversations toggle (wired by commit `87d53761a`), not per-conversation.
- Spec: plan §10.4 Mute row.
- Gap: needs a server action + UI, not a migration.

### F11 observed → superseded by F16 (D10 no longer a proposal) [observed] [severity: high]
- Evidence: `FairwayNewMessageSheet.tsx` is single-select only (`selectedId: string | null`); `FairwayTeamBroadcastSheet.tsx` is coach-only, fixed to the team roster.
- Spec: was plan §11.2 (`proposal`); **ADDENDUM 1 makes `NewMessage.dc.html` an approved, complete artboard — see F16 for the re-scored, no-longer-proposal comparison.**

### F12 observed: what `FairwayNewMessageSheet.tsx` gets right, to preserve [observed] [severity: n/a — positive]
- Evidence: dedup/selection keyed on `userId` (`:393`, `:262-267`); no auto-create on row tap (`:401-412`); `creating` guard blocks repeat-tap double-submit (`:300-311`); four distinct empty/error/loading copy variants (`:436-459`).
- Spec: plan §11.2/§11.3.
- Preserve this when the sheet is extended toward the approved D10 shape.

## Findings — artboard-grounded (new, ADDENDUM 1)

### F13 plan-drift: §11.1's "D10 is only a partial crop" no longer holds [plan-drift] [severity: high]
- Evidence: `NewMessage.dc.html` (140 lines) is a complete, self-contained 390×844 artboard — full header (`Cancel` / `New message` / `Start`), removable chips, a focused search field, a `SEND TO EVERYONE` section, a `PLAYERS` section, and a bottom primary CTA, all with literal values.
- Spec: plan §11.1 — "D10 shows only part of the artboard... Do not fabricate a claim of pixel-perfect restoration."
- Gap: this limitation is stale as of ADDENDUM 1. Per the team lead's correction, the §11.2 target is now audited as approved design, not proposal (F16).

### F14 decision-needed: the two reference action-sheet artboards disagree with each other on item order [decision-needed] [severity: med]
- Evidence: `Actions.dc.html:40-56` orders **Copy, Reply, Edit, [divider], Delete**. `Reactions.dc.html:76-92` — the action list under an *already-reacted* message — orders **Reply, Copy, Edit, [divider], Delete**. Row height also differs: 52px (`Actions.dc.html:40`) vs 50px (`Reactions.dc.html:76`).
- Spec: plan §12.4 itself proposes a third order — "Reply, Copy, Edit, then separated Delete" — which matches `Reactions.dc.html` but not `Actions.dc.html`.
- Not resolved here per the team lead's instruction to record artboard conflicts as `decision-needed` for M00 rather than resolve them. Whoever decides should also confirm whether the 52px/50px difference is intentional (e.g., reaction-context rows compressed to fit the tray above them) or drift between mock passes.

### F15 observed: numeric delta table for D04 (`GroupDetails.dc.html`) vs the branch's `ConversationDetailsSheet.tsx` [observed] [severity: high]
- Evidence/Spec/Gap, one row per artboard element (all `GroupDetails.dc.html` line numbers; branch file is `ConversationDetailsSheet.tsx` unless noted):

| Element | Artboard (`GroupDetails.dc.html`) | Current (branch) | Gap |
| --- | --- | --- | --- |
| Sheet surface | `:44-46` warm frosted glass: `rgb(244 232 210/0.88)` + `backdrop-filter: blur(36px) saturate(190%)`, top radius `1.75rem` | Generic `Sheet` primitive: `bg-elevated` (opaque token) + `shadow-fw-modal`, `rounded-t-fw-lg` (`Sheet.tsx:52,207`) | No blur/warm-tint treatment exists on the shared primitive at all — this is an **A03 shared-primitive question** per §19.3, not something M03D can fork locally. |
| Grip | `:48` 38×4px, `oklch(0.32 0.045 68/0.18)` | `Sheet.tsx:214` `h-1.5 w-10` (24×40px in default rem scale, i.e. ~6×40px), `bg-border-strong` | Close in width, off in height/color-treatment; shared-primitive scope again. |
| Identity | `:52-57` four overlapping 58px circles, `-18px` overlap, 3px ring border, real initials, "+6" overflow styled identically to a member avatar | None — sheet shows only a single DM avatar or nothing; no stack of any kind (`ConversationDetailsSheet.tsx:74-84`) | Full gap — F2's "no avatar stack" now has an exact target: 58px/-18px/3px-border/4-visible-then-overflow. |
| Title + creation metadata | `:59-60` one line `"Travel — Kiawah"` (20px/600) + one subtitle line `"9 members · created by you, Jul 21"` combining count and creator/date with a middot | `:80-91` title only; count line exists (`"N members"`) but never combined with creator/date — no creation metadata rendered at all | `golf_conversations.created_by`/`created_at` exist in schema (`database.ts:12353-12385`) — this is buildable without a migration, just unbuilt. |
| Three action tiles | `:65-78` equal-weight, `flex-grow:1`, `height:68px`, `border-radius:1rem`, icon 21px + label 12px/500 stacked, cream gradient | None | Full gap, exact target now available for M03D to build against. |
| Members header + Add | `:80-83` `MEMBERS` eyebrow (11px/600, uppercase tracking) + trailing `Add` (12px/500, green) | `:117-124` `Members` heading with `Users` icon, no `Add` control at all | Add is missing entirely, not just ungated. |
| Member row | `:85-92` 42px avatar, name 15px/500 (+"(you)" in lighter weight), secondary line (role or class year), first (self) row carries an `Admin` pill (green, 11px/600) | `:126-141` avatar-or-nothing (no placeholder for missing photo), name only, no secondary line, no role/admin pill of any kind | Confirms F2's member-row gap with the artboard's exact fields: name + one secondary line + conditional role pill. |
| Presence dot | `:96` green 11px dot, bottom-right of Alexis Bennett's avatar, 2px border | Not present (branch has no presence concept anywhere in messages) | **Flagging as `decision-needed` per the team lead's caution** — §24.5 bars inventing presence, but this artboard (like `Main.dc.html`) shows it. Needs real backing data (a presence/last-active signal) before this is buildable; recording for M00, not resolving or building it. |
| Show all | `:117-119` indented row, `"Show all 9"`, 13px/500, green | Not present — the branch always renders the full unpaginated list | No abbreviation/pagination exists at all, so nothing triggers "Show all" — a gap in the opposite direction from what the plan's checklist implies (nothing to expand because nothing is ever collapsed). |
| Shared files | `:122-140` `SHARED FILES` eyebrow + two inline preview tiles (doc icon+name+size in mono, or an image-gradient placeholder) | Not present | Full gap. |
| Leave group | `:142-144` full-width pill, 50px height, fully rounded, **soft** red tint (`oklch(0.505 0.19 27/0.09)` background, not solid), 15px/600 red text | Not present | Full gap; artboard confirms §10.2's "quiet destructive... not the most visually attractive primary action" is a literal low-opacity tint, not merely a smaller button. |

- Overall: `ConversationDetailsSheet.tsx` (147 lines) implements roughly 3 of the artboard's ~11 distinct elements (title, member count, a flat member list) at reduced fidelity (no role/admin/presence data, no photo-fallback, no combined creation line) and is missing the other 8 outright. This replaces F2's qualitative "stripped-down" framing with a citable count.

### F16 observed: D10 (`NewMessage.dc.html`) vs current recipient flows — no longer a proposal-vs-current comparison, now an approved-design gap [observed] [severity: high]
- Evidence: `NewMessage.dc.html` is one unified sheet: `Cancel` / `New message` / `Start` header row (`:47-51`); removable recipient chips already selected (`:54-65`, pill with a 24px initials badge + name + × glyph); one focused search field with a green focus ring (`:68-72`); a `SEND TO EVERYONE` section containing a single **Team broadcast** row with a distinct icon and `"Everyone on Demo University Golf · 9"` subtitle (`:74-84`); a `PLAYERS` section of individually toggleable rows, each with a trailing selection ring (filled green check when selected, hollow outline when not) (`:86-128`); and a bottom pill CTA whose label changes with selection count — `"Start group · 2"` shown for 2 selected (`:130-135`), implying `"Open conversation"` (or similar) for exactly 1 and `"Start group · N"` for 2+, per §11.2's "primary action labels the actual operation."
- Spec: was plan §11.2 (marked `proposal`); ADDENDUM 1 makes this an approved target (F13).
- Gap: current `main` has two separate sheets instead of this one unified surface — `FairwayNewMessageSheet.tsx` (single-select DM, no chips, generic "Start conversation" label regardless of count) and `FairwayTeamBroadcastSheet.tsx` (a distinct two-step modal, not a row inside the same sheet, and restricted to the coach role/fixed team roster rather than being one row alongside individual recipients for anyone). Neither has removable chips, a mixed broadcast-row-plus-individual-rows structure, or a selection-count-driven CTA label. This is now a real, approved-spec delta rather than a distance-from-proposal note.
- Proposal: the two existing sheets' logic (verbatim recipient search/create-conversation calls, verbatim broadcast creation) can likely be recomposed under the artboard's single-sheet layout without touching the underlying server actions — a layout/composition change, not a new data layer, based on what's read here. Confirming that needs the write-phase implementer's own read of the full data flow.

### F17 observed: `Actions.dc.html`/`Reactions.dc.html` show a labeled vertical action LIST; current code (both trees) shows an icon-only horizontal row [observed] [severity: high]
- Evidence: `Actions.dc.html:40-56` and `Reactions.dc.html:76-92` are both full-width rows — 21px icon + 16px/500 text label per row, height 50-52px, vertically stacked, with an explicit divider line before Delete. Neither artboard renders a "close" control — dismissal is implied to be scrim-tap (consistent with §12.1's overlay model). Current code, on both `main` (`MessageThreadPane.tsx:1114-1126`) and the branch (`:1497-1547`), renders `IconButton`-only glyphs (no text label at all) in a single horizontal `Inset` strip, plus an explicit `X` "Close" button that has no artboard counterpart.
- Spec: plan §12.4 — "consistent row heights, left icon alignment, text weight, and separator placement" (implicitly assumes labeled rows, now confirmed literally by the artboards).
- Gap: icon-only vs labeled-list is a different interaction pattern, not a styling delta — a user cannot read what a bare icon does without recognizing the glyph. The extra "X" close button is very likely compensating for the missing scrim (F6/F18) rather than an intentional design element; removing it once a proper scrim/overlay exists would align with the artboards' no-close-row composition.

### F18 observed: `Reactions.dc.html` confirms the floating-tray-over-dimmed-background composition; current code has neither [observed] [severity: high]
- Evidence: `Reactions.dc.html:36,55-65` — background messages sit at `opacity: 0.34` (`:36`), the held/selected bubble stays fully opaque and gains a lifted shadow (`lit-accent` box-shadow, `:19,67`), and the reaction tray is a `position: relative; z-index: 2` floating pill (`:57-65`, 46×46px circular targets, `backdrop-filter: blur(36px) saturate(190%)`, warm-glass background) positioned ABOVE the held bubble — not appended below it in document flow. Current code (branch, `MessageThreadPane.tsx:1497-1547`) has none of: opacity-reduced siblings, an elevated/re-shadowed selected bubble, a floating/absolutely-positioned tray, or a blur/glass surface — it is a plain sibling `<div>` in the same flex column as the bubble, at the bubble's *default* elevation.
- Spec: plan §12.1's "one visual composition, one focus owner" now has a literal opacity value (0.34) and a literal tray treatment to build against.
- Reaction-chip positioning, by contrast, is close: branch's `ReactionChips` uses `-mt-2` overlap (`MessageThreadPane.tsx:329`, ≈-8px in the default 4px scale) against the artboard's `margin-top: -9px` (`Reactions.dc.html:39,44`) — within a token-quantization rounding difference, and both order chips by descending count. This one piece does not need rework; it's cited so the write phase doesn't regress it while rebuilding the rest.

### F19 decision-needed: `GroupDetails.dc.html`'s "Admin" pill needs a data model that doesn't exist yet [decision-needed] [severity: med]
- Evidence: `GroupDetails.dc.html:91` shows an "Admin" pill on the self/coach row, separate from the "Head Coach" secondary-line role text on the same row conceptually (the artboard's self row actually shows the pill instead of a role line, but the plan text and the artboard together imply both could coexist). `golf_conversations.created_by` (`database.ts:12353-12385`) is the only existing signal that could back a single-creator-is-admin model.
- Spec: plan §10.4 — "A Head Coach role is not proof of private-group Admin... `created_by` may support a creator-managed model; transferable/multiple admins require explicit representation."
- Not resolved here: whether "Admin" in the shipped sheet should be a `created_by === current_user` check (single, non-transferable) or requires new schema for multiple/transferable admins is a product decision, flagged for M00 rather than answered.

## Checks scored

Device/pixel-rendering fidelity remains `NOT_RUN` for every check below (no browser/device this phase, per ADDENDUM 1's own limit: "It does NOT make runtime/device/multi-user evidence possible"). Structural/geometric/wiring aspects are now scored against the artboards where one exists, not "no reference" placeholders.

| Check | Score | Reason |
| --- | --- | --- |
| M-V37 (D04 composition) | FAIL | Artboard-confirmed: ~3 of 11 distinct D04 elements exist, all at reduced fidelity, on the branch; zero on `main` (F15). |
| M-V38 (Details actions scoped effects/permission gating) | FAIL | Mute/Add/Files/Show all/Leave don't exist in any tree; Search is dead code (F3, F10, F15). |
| M-V39 (Member/files partial data, failed read ≠ "no files") | FAIL | No-photo members lose their avatar slot entirely; failed roster read renders as a near-empty sheet with no error text (F4, F15). |
| M-V40 (D10 proposed completion) | FAIL — **re-scored: this is now an approved-spec FAIL, not a "no proposal exists" placeholder** | A complete, approved D10 artboard exists (F13); current code has two narrower, structurally different sheets, neither matching its chip/broadcast-row/CTA-label composition (F16). |
| M-V41 (Recipient create: distinct one/multi paths, exact DM/group ops, repeat-tap safety) | FAIL (structural), single-DM sub-path correct | Single-DM path is correct and repeat-tap-safe (F12); no unified sheet with the artboard's broadcast-row + individually-toggleable-rows + count-driven CTA exists (F16). |
| M-V42 (D06/D07 focus/portal scene) | FAIL — **re-scored with exact target** | Artboard specifies 0.34 background opacity + floating glass tray + re-elevated held bubble (F18); current code has none of the three, in either tree. |
| M-V43 (Reaction tray: five choices, selected ring, stable order/counts, no generic picker) | FAIL (`main`) / FAIL (branch, tray structure) — **chip positioning/ordering sub-check now PASSES** | `main`: zero implementation (F5). Branch: exact 5-emoji set matches (F5); tray is inline, not floating/glass per F18 (FAIL); but chip overlap (-8px vs -9px) and count-descending order match the artboard closely enough to score that specific sub-part a pass, not a gap (F18, last paragraph). |
| M-V44 (Hold/cancel/access — reachable without long press) | FAIL | Hold-cancel-on-move works; no non-long-press path exists on mobile (no kebab) or desktop (context menu suppressed) in either tree (F8). No artboard bears on this specific check (it's an interaction-model question, not a visual one). |
| M-T14 (reaction convergence) | NOT_RUN | Requires two authenticated accounts and a running app — still true after the addendum, which supplies design source, not runtime. |
| M-T16 (member capability enforcement server-side) | NOT_RUN | No Add/Leave/Mute server actions exist yet to test (F10, F16); needs multi-user runtime regardless. |
| M-T20 (actions/accessibility: hold-yields-to-scroll, alternatives, VoiceOver, haptics-off) | NOT_RUN | Hold-yields-to-scroll is structurally present; VoiceOver/haptics-off/large-text still need a device. |

## Plan-vs-tree / plan-vs-artboard drift

- `ConversationDetailsSheet.tsx` (§19.3:823 leases it to M03D) does not exist on `main`; exists only on unmerged `agent/messages-instant-entry` / `ci-fix-1833` (F1, priority task).
- `FairwayTeamBroadcastSheet.tsx` and `conversation-kind.ts` appear in no §19.3 lease row (confirmed reading the full table, lines 815-830). `FairwayTeamBroadcastSheet.tsx` belongs under M03D per §21's role-summary line 809; `conversation-kind.ts` has 3+ consumers across lanes and no owner — recommend an explicit shared-file lease or folding under M02.
- §21's V20 row ("only partially represented") describes the unmerged branch, not `main` (absent there) — unaffected by the addendum, still true.
- **§11.1's partial-D10 evidence limit is stale as of ADDENDUM 1** (F13) — `NewMessage.dc.html` is a complete artboard; the §11.2 target is no longer `proposal`.
- **New: the two action-sheet artboards disagree with each other and with §12.4's own prose on item order** (F14) — a `decision-needed` conflict in the source of truth itself, not a code defect.
- **New: `GroupDetails.dc.html` shows a presence dot and an "Admin" pill** with no backing data model in the tree today (F15/F19) — recorded as `decision-needed` per the team lead's instruction, not resolved or built.

## What I could not determine and why

- Whether `agent/messages-instant-entry` or `ci-fix-1833` is the intended write-phase base, or whether they've diverged further than the identical files checked — no `gh`/network access this phase.
- Whether the `is_group`/`participant_count` disagreement in F9 occurs in live data — needs a read-only query against `golf_conversations`, not run this phase.
- Actual rendered fidelity (does the shared `Sheet` primitive's `bg-elevated` visually clash with the artboard's warm/blur treatment badly enough to need a token exception, exact blur/backdrop-filter browser support, real contrast ratios) — the artboard gives literal source values but I have no browser this phase to render either side; this is exactly the boundary ADDENDUM 1 draws ("does NOT make runtime/device/multi-user evidence possible").
- `unmapped oklch() values` — I did not attempt a token-by-token reconciliation against `src/styles/design-tokens.css`'s `--fw-*` custom properties for every literal in these four artboards; that mapping exercise is explicitly A03's per §14.2, and I did not want to preempt it with a partial pass. Flagging that a full reconciliation pass is still owed, not done here.
- `FairwayNewMessageSheet.test.tsx` and other test files in the directory were grepped for context but not read line-by-line.
- Whether `AttachmentButton.tsx`/`AttachmentPreview.tsx` under `src/components/golf/messages/` interact with any overlay/action surface in my scope — grepped for reaction/context-menu terms only (no matches), not read in full (out of Section 10-12 scope).
- RLS/authorization behavior for any of the not-yet-built actions (Add, Leave, Mute) — no policies exist to read since no action exists yet.
