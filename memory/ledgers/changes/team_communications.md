# Change ledger — team_communications

## 2026-09-07 — the message actions get the separator that gives Delete distance (G-55)

- SHA: 70844b57b.
- Change: both action rows in `MessageThreadPane.tsx` gained a 1px rule
  between the reversible actions and Delete — the mobile long-press row
  (Copy, Edit, — Delete, Close) and the desktop hover row (Edit, — Delete).
  `bg-border-subtle`, `w-px`, `mx-1.5`, `aria-hidden`.
- Correction to the finding: `M00-MANIFEST.md` calls G-55 "three sources,
  three orders". There are two. `Reactions.dc.html` and §12.4's prose agree
  exactly — Reply, Copy, Edit, — separator — Delete — and `Actions.dc.html`
  differs from them by ONE swap, leading with Copy. Same set, same tail.
  `audit/DECISIONS.md:31` already records this. The consequence is that the
  decided RELATIVE order of Copy/Edit/Delete was what the code already
  shipped, so the implementable delta was never the order: it was the
  separator, which is the part that carries the meaning, and which neither
  row had.
- Why the token, not a literal: `Actions.dc.html:52` paints the rule
  `oklch(0.862 0.013 82 / 0.95)`, byte-identical to
  `--fw-color-border-subtle` (`design-tokens.css:147`). Fourth free token
  application this audit has found, after G-32 (rail), G-49b (bubbles) and
  G-47 (dock). The two artboards DISAGREE on this colour —
  `Reactions.dc.html:88` uses the glass bottom edge,
  `oklch(0.32 0.045 68 / 0.12)` — and AGENTS.md's authority order settles it
  without a preference having to be invented: the one that matches a token
  wins. The suite asserts the disagreement rather than hiding it, so the tie
  is re-examined if either artboard moves.
- Geometry: the artboards' `margin: 6px 12px` is 6px ACROSS the gap the rule
  opens and 12px along its length. These rows run the other way, so the 6px
  becomes the inline margin — `mx-1.5`. A vertical rule rather than a
  horizontal one for the same reason; turning the row into the artboards'
  labelled vertical list is G-56's job, not this finding's.
- Reply is absent by DEFERRAL, not disagreement. The affordance is G-20c and
  is not built; `golf_messages.reply_to_id` and its FK already exist. A test
  demanding the slot would be asserting a plan.
- Known limit, recorded rather than hidden: `Close` still trails Delete, so
  it inherits the past-the-separator position without being destructive. It
  is a sheet dismissal with no slot in either artboard's list, and G-56
  replaces this row with a real labelled sheet and a scrim — which is where
  the dismissal stops needing a slot at all. A second separator to fence it
  off would be geometry no source asks for.
- Not changed: Delete's `variant="danger"` (both artboards colour it
  `oklch(0.505 0.19 27)`; the separator is additional distance, not a
  substitute), and the rule that incoming messages get no Edit/Delete —
  G-42 is the finding that gives them an action surface of their own.

## 2026-09-07 — a failed attachment insert stops reporting success (G-08)

- SHA: fabfae3e5.
- Change: `sendGolfMessageWithAttachmentsImpl`
  (`src/app/golf/actions/message-attachments.ts`) compensates when the
  `golf_message_attachments` insert fails instead of logging and falling
  through to `{ success: true }`. It removes the orphaned storage objects;
  deletes the message when no text survives (returning failure, so the
  composer keeps the draft); and when text does survive, clears
  `has_attachments` and falls THROUGH to the conversation-timestamp update and
  the recipient fan-out before returning `attachmentsFailed: true`. Return type
  widened with an optional `attachmentsFailed`.
- Why: the `golf_messages` row commits first with `has_attachments: true`. A
  later attachment-insert failure left it flagged with no attachment rows,
  which `MessageThreadPane`'s SUCCESSFUL-BUT-EMPTY branch reads as "the rows
  have not committed YET" and offers a one-shot retry for. That reading is
  correct for the two-statement commit race it was written for and wrong for
  this failure, which is permanent — so the retry could never succeed and the
  bubble stayed dead for the rest of the session, while the sender had been
  told the photo was delivered. Found as G-08 in the Wave 0 messages audit
  (`audit/M00-MANIFEST.md`), the highest-severity item in it; open issue #1825
  ("Message image attachments render as nothing — two independent user
  reports") is the user-visible form.
- Verification: `golf_messages_delete` and `golf_messages_update_v2` are each
  `sender_id = auth.uid()`, read from production `pg_policies`, so both
  compensations are permitted for the sender under RLS. The bucket
  `golf-attachments` is private and `golf_attachments_owner_delete` is
  `owner = auth.uid()`, so the sender may remove their own uploads.
- Note: the fall-through rather than an early return is load-bearing. The
  message really was delivered, so returning at the compensation point would
  have suppressed the recipient's push/email for a message they can see. A
  test pins it.

## 2026-09-07 — message metadata nested in its column (G-26)

- SHA: 21e33781b.
- Change: in `MessageThreadPane`, the timestamp / read-receipt block moved from
  being a SIBLING of the message column to being its last child. Dropped `pb-1`,
  which only existed to compensate for the row's `items-end`.
- Why: the row is `flex items-end gap-2`, so as a sibling the metadata was a
  third flex item consuming row width — every message carrying a timestamp had
  its bubble pushed inward by the width of the time plus the gap and no longer
  lined up with its group-mates. G-26, the defect the audit plan names in its
  own opening paragraph.
- Test note: jsdom computes no flex layout, so the visual symptom is
  unobservable in vitest and both pre-existing message-pane suites passed over
  this defect. The new suite asserts DOM NESTING, which jsdom does model, and
  was verified to fail (2 of 3) against the pre-fix structure. Rendered geometry
  remains open as `audit/PROGRESS.md` W8.

## 2026-09-07 — a failed send retains the message (G-19)

- SHA: fef04dbb9.
- Change: `useGolfMessages.sendMessage`'s three failure branches mark the
  optimistic row `sendFailed` instead of filtering it out. New `retryMessage`
  (re-sends under the SAME id) and `discardFailedMessage` (guarded on
  `sendFailed`) are returned from the hook and wired through `FairwayMessages`
  to `MessageThreadPane`, which renders the failed bubble muted, labelled
  "Not sent", with Retry and Discard. `MessageComposer` now clears only the
  text it actually sent.
- Why: deleting the user's message on failure left a toast as the only trace of
  something they wrote (§9.2 names this shortcut explicitly). Separately, a
  blanket `setMessage('')` on success discarded anything typed during the round
  trip, because the textarea deliberately stays enabled while a send is in
  flight (§9.3).
- Correction to the finding: M03C said the clear was "unconditional". It was
  already inside `if (success)`. The real defect was narrower — it cleared the
  BOX rather than what was SENT.
- Safety: retry reuses the row's existing id, so a retry racing a commit
  collides on `golf_messages`' primary key and the action reports 23505 as the
  success it is, rather than duplicating. `sendFailed` is client-only and can
  never appear on a row that came from the database.

## 2026-09-07 — attachment send fails closed; stale fetch guarded (G-21, G-13)

- SHA: f5744c0bc.
- G-21: `MessageComposer` branched `if (hasAttachments && onSendWithAttachments)
  … else onSend(text)`, so a missing handler fell through to the text-only path
  — message delivered, files silently dropped, success reported. It now refuses,
  retains the draft and staged files, and surfaces the reason. Latent (the
  production call site always passes the handler), which is why nothing covered
  the branch.
- G-13: `useGolfMessages` takes the conversation id as an argument rather than a
  React key, so one hook instance owns one `messages` state across conversation
  switches, and `fetchMessages` wrote unconditionally. A slow fetch for A
  resolving after B opened wrote A's messages/loading/error into B's view. Added
  `liveConversationIdRef`, assigned during render and compared after all three
  awaited writes.
- Why the ref is assigned during render, not in an effect: an effect leaves it
  one render behind exactly while a conversation switch is in progress, which is
  the only moment it matters.

## 2026-09-07 — honest last-message preview; duplicate-key equivalence (G-15, G-18)

- G-15: `useGolfConversations` built every conversation's `last_message` as a
  full `GolfMessageRow`, which forced it to invent the columns
  `get_golf_conversations_with_details` does not return — a literal `id: ''` on
  every row in the inbox and a constant `read: false` (§16.1). Narrowed to a new
  `GolfConversationLastMessage` (`content`, `created_at`, `sender_id`), which
  makes the compiler, not a grep, the proof that nothing consumed the
  fabrication. `sender_id` also stops being coerced to `''`.
- G-15, second half: `ConversationRow` declared 13 of the RPC's 14 columns, so
  `is_team_channel` never reached the client, and the supplemental team-chat
  query did not select it either. Both fixed.
- The M01 authority question is answered in `audit/M01-TEAM-FLAGS.md`:
  `is_team_chat` is the grouping flag (the RPC's `is_group` output is literally
  `COALESCE(c.is_team_chat, FALSE)`); `is_team_channel` is a separate flag used
  only by the function's own `ORDER BY`. The manifest's "dropped in favour of"
  framing is wrong — they are two flags, not two spellings.
- Deliberately NOT changed: the client's sort. Ordering the inbox is the
  client's contract (it uses `last_message.created_at`, a better key than the
  RPC's `updated_at`), the rail buckets by time before rendering, and inbox
  sectioning is G-01's.
- G-18: `sendMessage`'s 23505 short-circuit returned `{ success: true }` on the
  strength of the constraint alone. It now verifies the existing row is this
  sender's, in this conversation, with this content, and fails closed when the
  row is invisible or the lookup errors (§17.3). The idempotency
  `withOneTransportRetry` and `retryMessage` depend on is preserved exactly.
- Why failing closed here is not a regression: G-19 landed first, so the caller
  retains the optimistic bubble and offers Retry instead of deleting it.

## 2026-09-07 — Enter no longer sends mid-IME-composition (G-23)

- `MessageComposer`'s Enter-to-send treated every unshifted Enter as a send. For
  a Japanese/Chinese/Korean/Vietnamese IME, Enter is the COMMIT key, so
  confirming a candidate mid-sentence sent the fragment and cleared the box.
- Three signals are read, because no single one covers every engine: the
  standard `nativeEvent.isComposing` (Chromium, Gecko), the legacy
  `keyCode === 229` (what some Android WebViews report instead), and a ref
  driven by compositionstart/compositionend for WebKit, which ends composition
  BEFORE dispatching the commit keydown.
- The ref is cleared on a macrotask, not synchronously. That is deliberate: it
  swallows exactly the one keydown WebKit dispatches after compositionend, and
  nothing a human could type in the next turn of the event loop.
- The guard RETURNS rather than calling `preventDefault()` — consuming the event
  would stop the IME committing the candidate at all.
- Only reachable with a fine pointer, since a touch keyboard already falls
  through to a native newline (the `isPointerFine` branch above it).

## 2026-09-07 — group unread is per-viewer (G-40)

- `get_golf_conversations_with_details` computes `unread_count` as
  `COUNT(*) WHERE read = FALSE AND sender_id <> me`, running on
  `golf_messages.read` — ONE boolean shared by every participant.
  `mark_golf_messages_read` flips it on every message the opener did not send,
  so in a 3+ person team chat one member opening the thread cleared the badge
  for everyone (§17.2, M-T06 FAIL).
- A correct per-viewer computation already existed in `useGolfConversations` —
  but only on the SUPPLEMENTAL team-chat path, reached for chats the RPC
  missed. The normal path was the broken one. The same computation now runs
  over every group conversation the RPC returns, from the viewer's own
  `golf_conversation_participants.last_read_at`. No schema change: that column
  exists in production and in the migrations (`A1-RESOLUTION.md` §3).
- DMs are deliberately left on the shared boolean. With two people, "not sent
  by me" and "not read by me" are the same set, so it is already per-viewer
  there — and it is what DM read receipts are built on.
- Degradation is explicit: if the `last_read_at` lookup fails, every badge
  keeps the RPC's number; if one conversation's count fails, only that one
  does. A failed count must never read as 0, which looks like "caught up".
- Two pure functions carry the decisions — `perViewerUnreadTargets` (which rows)
  and `applyPerViewerUnread` (what happens to a row with no recomputed number)
  — so they can be exercised without a realtime + auth harness. This is also
  why `ConversationRow` was hoisted to module scope as
  `GolfConversationRpcRow`.
- Still open, and NOT fixed here: the RPC itself. Correcting `unread_count` at
  the source means changing a SECURITY DEFINER function, i.e. a migration —
  writing one is in scope for this branch, applying it is not, and the client
  cannot depend on an unapplied function. The client-side derivation is what
  actually ships.
- `head: true, count: 'exact'` transfers zero rows, so the PostgREST 1000-row
  cap cannot silently under-count a busy chat; the id list is chunked at 200
  because PostgREST filters travel in the URL.
- Cost note: the per-conversation head count now fires for EVERY group row,
  where the supplemental path only ever covered rows the RPC had missed. The
  "team chats per viewer are few" reasoning behind the `Promise.all` was
  written for that rare path and now covers the common one — production
  currently has 6 team chats total, so N is small, but this is the number to
  watch if group chats grow.
- What clears the badge changed with it. The count no longer falls because
  `golf_messages.read` flipped; it falls because the viewer's own
  `last_read_at` moved. `markMessagesAsRead` writes that row first and treats
  it as the primary read marker, and the rail's realtime subscription is
  `golf_conversation_participants` / `event: '*'` / `filter: user_id=eq.<me>`
  — the viewer's own row included — so the write refetches the rail. Pinned by
  test, because the sibling receipts subscription in `useGolfMessages`
  deliberately ignores the current user and is an easy thing to copy.

## 2026-09-07 — the mute columns get a migration (G-58)

- `golf_conversation_participants.notification_level` and `.muted_until` exist
  in production and are declared in `supabase/schemas/golf/10_tables.sql`, but
  no file under `supabase/migrations/` creates either. The only other hits are
  in `supabase/migrations_archive/`, which is never replayed. Confirmed by
  querying the local stack, which is built from migrations: it had exactly
  `id, conversation_id, user_id, joined_at, last_read_at`.
- So every environment built from migrations — fresh local stack, CI, preview
  branch, disaster-recovery restore — lacked the mute contract. Production was
  the only place it existed, and a restore-from-migrations would have dropped
  it silently.
- `supabase/migrations/20260907120000_golf_participants_mute_columns.sql`
  converges them. Shapes were read from the production catalog
  (`information_schema.columns`, `pg_constraint`, `pg_indexes`,
  `col_description`), not from the mirror, because the mirror is the artifact
  under suspicion.
- It is a strict no-op against production, and that constrained three choices:
  no index (production has none on either column); column order matching
  production's ordinal positions, so a rebuild converges on the same shape and
  not merely the same set; and a `COMMENT ON` guarded on the comment being
  absent. That last one matters — production's comment on `notification_level`
  is the only written record anywhere of the mute semantics (the level lapses
  back to `all` once `muted_until` passes, evaluated on read), and it is in no
  repo file. An unguarded `COMMENT ON` would have overwritten it with a worse
  paraphrase.
- `ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL, hence the `pg_constraint`
  lookup in a `DO` block rather than a bare `ALTER`.
- WRITTEN, NOT APPLIED. Applying it is the owner's, through `npm run db:apply`
  after `db-migration-reviewer`. It is not a held migration and gets no row in
  `supabase/migrations/HELD.md`.
- Verified rather than assumed: applied to the local stack, which then matched
  production's shape exactly; a second apply changed nothing and did not
  duplicate the constraint.
- Enforced from here. Both columns are now in `GOLF_EXPECTED_COLUMNS` in
  `scripts/db/check-supabase-drift.mjs`, and `ci.yml` runs `db:drift:check`
  against the stack it rebuilds from migrations. That is the schemas→migrations
  direction — `ci.yml`'s declarative-schema step checks migrations→schemas, and
  the drift check's golf invariant did not name these two, so neither would
  have caught it. Deleting or breaking the migration now fails CI.

## 2026-09-07 — the composer's last legacy-palette child (G-46)

- `src/components/golf/messages/AttachmentPreview.tsx` renders inside every
  composer attachment state and was still painting from `warm-*`, `cream-*`,
  `red-*`, `primary-*` and `purple-*` — every one banned by
  `.claude/rules/design-system.md`. It is now on Fairway tokens, and off the
  raw-Tailwind radii the Fairway path forbids (`rounded-lg` → `rounded-fw-md`).
- This is a prerequisite, not a tidy-up: composer fidelity cannot be reached
  while one of the composer's children paints from a retired palette.
- Three mappings were judgement rather than substitution, and the reasoning is
  in the file's own docstring so the next person does not re-litigate it: the
  purple audio tile now matches the document tile beside it (purple is in no
  Fairway scale, and the icon already tells them apart); the red/blue/green
  PDF-DOC-XLS labels are all `text-text-secondary` (no blue token exists,
  `red-*` is banned outright, and the word itself is the signal); the video
  scrim keeps `bg-black/20`, which is not in the banned set and is more honest
  than a surface token over arbitrary user media.
- Alpha modifiers on `fw-*` utilities compile — `tailwind.config.ts` bridges
  them through `color-mix()` rather than channel triplets — so `bg-surface/85`
  and `bg-fw-danger-bg/90` render. The same expressions against a raw `var()`
  token would have emitted no rule at all, which is the 2026-07-24 audit's
  286-site failure mode.
- DELIBERATELY UNCHANGED: the remove control stays `IconButton` from
  `@/components/ui/button` at `w-5 h-5`. `MessageComposer.tsx` — the Fairway
  file that renders this one — imports its own `Button` from that same legacy
  module, so it is the local idiom, not drift.
- New finding **G-60** [med]: that control is a 20px target and WCAG 2.2
  SC 2.5.8 wants 24px. Recorded against W5/G-47, which owns composer geometry.
  Fairway's `IconButton` is not the fix — its smallest size is 36px, 44px on a
  coarse pointer, which at `-top-1 -right-1` on an 80px tile overhangs into the
  neighbouring tile's `gap-2`. The fix is a hit-area expansion, not a bigger
  badge.
- §19.3 lease: G-46's own text notes this file sits under no lease row and asks
  for one before the write phase. Single-agent execution collapses that — there
  is no concurrent worker to conflict with — so the row was not added rather
  than inventing lease bookkeeping for a lane of one. Stated here because the
  finding asked, and silence would have looked like an oversight.

## 2026-09-07 — the bubble was one radius step too round (G-48)

- The finding as first written said the artboard's bubble radii match no
  `--fw-radius-*` token, citing the ramp as sm/md/lg = 10/14/28px. That reading
  skips `--fw-radius-card`. Measured from both primary sources rather than from
  either summary: `audit/reference/Bubbles.dc.html`'s dominant bubble corner is
  `1.25rem`, byte-identical to `--fw-radius-card`, whose own comment calls it
  "THE card radius". So this was a token MISUSE, not a missing token, and the
  fix is a class swap rather than a new scale.
- `rounded-fw-lg` → `rounded-card` at all five sites in
  `MessageThreadPane.tsx`: the three bubble corner cases, plus the typing
  indicator (which copies the incoming-bubble shorthand) and the edit box
  (which replaces a bubble in place). Leaving either of the last two behind
  would have made the swap read as an inconsistency rather than a correction.
- UNCHANGED, deliberately: the 6px tail (`rounded-br-sm` / `rounded-bl-sm`) and
  the 12px grouped inner corners. Both fall below `--fw-radius-sm` (10px), so
  the fw ramp has no step for either, and §19.3 routes exactly those two values
  to A03 as variant requests — messaging proposes changes to shared primitives,
  it does not fork them.
- Correction to the manifest, which calls the target class `rounded-fw-card`:
  that class is defined nowhere in `tailwind.config.ts`. The name is
  `rounded-card`. Related referral, found while checking: `rounded-fw-card` IS
  used once in the tree, at `src/components/golf/courses/CourseCard.tsx:152`,
  where it therefore emits no rule at all and the card renders with square
  corners. One site, outside the messages tree and another feature's lease —
  recorded, not fixed.

## 2026-09-07 — artboard values bound to tokens that already existed (G-32)

- G-32's claim is that the token file already holds nearly everything the
  design needs and the gap is application, not vocabulary. Measuring both sides
  confirms it. `audit/A03-VARIANT-REQUESTS.md` is the deliverable: every value
  taken out of `audit/reference/*.dc.html` and compared against
  `src/styles/design-tokens.css`, rather than read off a lane summary.
- Applied here: the unread conversation row's lift, and the page wash.
  `Main.dc.html` labels the row in its own markup — "unread row: cream card
  lifting off the champagne" — and its box-shadow is byte-identical to
  `--fw-shadow-card`. The rail drew it flat. The wash is
  `bg-canvas-gradient` LAYERED OVER `bg-canvas` at four page-shell sites, not
  replacing it: the token's own comment says to keep the colour underneath so
  overscroll stays warm, and the gradient's radial layer ends at
  `transparent 78%`, so a replacement would leave bare ground.
- Verified already-correct and deliberately not touched: the conversation-row
  radius (`0.875rem` = `rounded-fw-md`) and the search well (`0.625rem` =
  `rounded-fw-sm`). "Already right" is a result, not a no-op.
- A TRAP worth knowing: **`shadow-card` is not `--fw-shadow-card`.** That
  utility name resolves to a legacy cool-grey value in `tailwind.config.ts`
  (`0 1px 3px rgba(0,0,0,0.04), …`), and NO utility bridges the Fairway token,
  so the repo's idiom is the arbitrary-property escape
  `[box-shadow:var(--fw-shadow-card)]` (~8 sites). A later "cleanup" shortening
  it to the class would silently change the colour; a test pins that.
- The unread face is `bg-surface` rather than the artboard's two-stop cream
  gradient, which has no token and goes to A03. `--fw-color-surface` sits
  between the gradient's two stops, so it is the honest approximation — and a
  shadow with no face would only have been a floating halo.
- TWO CORRECTIONS to the manifest, both from measurement. The unmapped set is
  **five values, not six**: `.send-on` in `Composer.dc.html:26` and the
  pinned-rail pill in `Main.dc.html:49` carry the identical 165deg
  declaration, so M03A's "solid green gradient's second stop" and M03C's
  "send-on gradient's second stop" are one request. And the composer's upload
  progress bar, listed as unmapped, is `accent-600 → accent-500` exactly — it
  needs no request at all. Separately, the recurring cream gradient appears in
  seven places, not four.
- Two values belong to A03 rather than to messaging even though both tokens
  exist: the avatar fallback (`accent-100` / `accent-700` exactly) lives on the
  shared `controls/avatar.tsx` primitive and changing it repaints every avatar
  in the app; and the pinned-rail colours have nothing to apply to, since G-01
  is deferred pending a migration and the D-03 product call. Measured and
  recorded so G-01 does not have to re-measure them.
- NOT requested, deliberately: the artboard's presence dot, though both its
  colours are exact token matches. D-03a says member rows carry no presence
  dot and G-51 is a standing referral to remove the dead roster one. Mapping a
  value the design has decided against would be tidy and wrong.

## 2026-09-07 — the day chip floats on glass (G-50a)

- `MessageThreadPane.tsx`'s day separator was a flex row with two `h-px flex-1`
  hairlines binding the label into the list. `Thread.dc.html:51` carries an
  authored comment — "the day chip FLOATS over the thread on glass, not inline
  in it" — and DECISIONS.md takes that over `Group.dc.html`'s unannotated
  inline bordered pill, on the rule that a stated intent beats a variant that
  does not say why it looks that way.
- STATIC, not sticky. The decision is presentation — float-over vs. sit-inline.
  Pinning the chip while its day scrolls would turn a boundary label into a
  running current-day indicator: new behaviour nobody asked for, and it would
  pre-empt G-29, still open in the same wave.
- The row now contributes no layout height (`relative h-0`) and the chip is
  absolutely centred over the boundary, `pointer-events-none`, on the canonical
  `z-raised` tier rather than the artboard's ad-hoc `z-index: 2`.
  `role="separator"` is carried across — the a11y semantics are the part a
  visual change quietly loses.
- Four tokens that already existed and had never been used in messaging did the
  whole job: `--fw-glass-bg` is byte-identical to the artboard's `.glass`
  background, `--fw-blur-glass` to its `22px`, `--fw-glass-saturate` to its
  `190%`, and `--fw-shadow-pop` to the two shadow layers under the specular.
  The ink is `--fw-color-text-secondary`, an exact match. Referenced through
  the arbitrary-property escape — never `bg-glass` / `backdrop-blur-glass`,
  which are the LEGACY cream-100 utilities the design-system rule bans and are
  unrelated to the `--fw-glass-*` tokens.
- ONE value absorbed rather than requested: the inset specular is
  `rgb(255 248 233 / 0.6)` against the token's `/ 0.5` — same channels, one
  tenth of alpha on a 1px rim over glass. Recorded in `A03-VARIANT-REQUESTS.md`
  so the call is findable; the token is used and the literal is not hardcoded.
- The glass licence is this chip and nothing else. DECISIONS.md bounds it
  explicitly, and the file header's own ban — no `bg-white`/`backdrop-blur` on
  BUBBLES — still stands. Both hold at once, and a test pins that the file has
  exactly one `backdrop-filter` site (plus its `-webkit-` pair).

## 2026-09-07 — the bubble width is the rule, not a specimen (G-50b)

- The base cap was `max-w-[78%] sm:max-w-[70%]` — a guess at the artboard
  rather than the artboard. Three widths appear across the reference set (288,
  296, 268/292) and they are not three opinions: `Bubbles.dc.html:17` states
  288px as a CLASS RULE, in the artboard whose entire purpose is bubble
  grammar, while the others are inline styles on individual specimens inside
  scene compositions. DECISIONS.md takes the rule. The base is now
  `max-w-[288px]`.
- Group-incoming needed no number of its own. The 32px avatar column and the
  row's `gap-2` sit OUTSIDE the capped element, so an incoming row's available
  width is already 40px less than an outgoing row's. 268 is written nowhere.
- SIXTH CORRECTION FROM MEASUREMENT, and this one is against a frozen decision
  rather than the manifest. DECISIONS.md says group-incoming's 268px "falls out
  of the same rule minus the avatar gutter". That arithmetic does not
  reproduce: the gutter is 40px — a 32px avatar at an 8px gap, identical in
  `Group.dc.html:49-50` and in the component — and 288 − 40 = 248, not 268.
  The group specimens are also uniformly 1px tighter on padding than the `.bub`
  rule (`11px 15px` vs `12px 16px`), so 268 is a hand-tuned scene value of
  exactly the same class as the 292-vs-296 spread the decision itself already
  dismisses as render noise. **The rule and the derivation direction are
  implemented; the specimen number is not reproduced, and chasing it would have
  meant inventing a magic number the decision explicitly forbids.**
- The `sm:` cap deliberately stays a percentage. Every artboard is a 390px
  phone scene, so 288px is what the design actually specifies; the pane is
  `max-w-[720px]` on desktop (`FairwayMessages.tsx:649`), where a flat 288px
  would narrow bubbles by 216px on no authority at all. The rule is applied
  where it was stated and nowhere else.
- Consequence worth stating plainly: on a 390px phone the 288px cap binds for
  incoming and outgoing alike (358px of content, minus the 40px gutter, still
  leaves 318px), so the derivation only becomes visible below roughly a 360px
  viewport. That is what the rule produces. It is not the artboard's 268.

## 2026-09-07 — message text is the artboards' 15px (G-29a)

- Bubble text was `text-body-sm` (13px) with `leading-relaxed` on top. It is now
  `text-body`, which the type scale defines at exactly 15px — the size stated in
  the `.bub` CLASS RULE, identically, in both `Bubbles.dc.html:17` and
  `Thread.dc.html:16`.
- SEVENTH CORRECTION FROM MEASUREMENT. M03B's F7 asked for 17px `body-lg`,
  reasoning that "the repo already has a semantic token at exactly the spec's
  target size". It does — but the target came from §8.3's PROSE, "approximately
  17px", not from an artboard. The artboards state a rule and the prose gives an
  approximation. The rule wins, which is the same call DECISIONS.md made for
  G-50b's width, and 17px would have been 2px larger than the design in the
  direction the finding did not check.
- `leading-relaxed` is gone rather than carried across. The token specifies its
  own 24px leading, and stacking a multiplier on a token that already carries
  one is how a type scale stops meaning anything.
- The 22px the artboard states has no token and is NOT hardcoded: it is A03
  variant request #6, and the token's 24px ships until it exists. Deliberately a
  request rather than an absorption — 2px per line compounds down a multi-line
  bubble, so a six-line message is 12px taller than the artboard draws it. That
  is a design value, not the render noise the G-50a alpha delta was.
- The inline edit `Textarea` moves with the bubble. Left at 13px the text would
  shrink the moment you tapped edit and grow back on save — the same words at
  two sizes, which reads as a rendering bug.
- SCOPE. G-29 is four sub-items on one line. This commit is the typography one.
  Day separators were already closed by G-50a (M03B's F8 IS that finding).
  Pagination past the newest-200 fetch is out of lease for this file — the
  `.limit(200)` with no cursor lives in `use-golf-messages.ts` — and is deferred
  to G-17, recorded in PROGRESS.md rather than dropped. Photo layout (G-29b) and
  the group member stack (G-29c) follow as their own commits.
- Worth recording for G-29b: the photo specimen is in `Bubbles.dc.html:73-83`,
  NOT in `Thread.dc.html`, which contains no photo message at all. M03B cited
  measurements against "the artboard" without naming which one.

## 2026-09-07 — the image is the message object (G-29b)

- §8.6: "the image is the message object, with a caption below; it is not an
  image nested inside a large padded generic chat card." Both halves were
  violated. `msg.content` rendered before the attachments UNCONDITIONALLY, so
  the caption sat above the image; and one flat `px-4 py-2.5` applied to text
  and image alike, which is exactly the padded generic card.
- The caption now renders after the attachments, and a photo message's bubble
  becomes a frame (`p-1 pb-2.5`) instead of a padded card, with the caption
  carrying its own inset so the image stays flush to the frame. The edited badge
  picks up the same inset or it hangs off the edge.
- `isPhotoMessage` is derived from the RESOLVED attachments rather than
  `has_attachments`: until the signed URLs land there is nothing to frame, and
  reshaping the bubble before then would make it visibly snap on load.
- THREE DEAD WIDTH CAPS REMOVED. The image carried `max-w-[260px]` and the file
  chip carried the same. Inside a 288px column (G-50b) neither ever bound —
  numbers that looked like constraints and were not. The artboard puts the cap
  on the bubble, and `Bubbles.dc.html:88` draws the file bubble at the same
  288px the `.bub` rule states. The photo specimen's own `250px` is deliberately
  NOT reproduced, on the precedent G-50b set: the column takes the stated rule,
  not a scene specimen.
- The specimen is `Bubbles.dc.html:73-83`. M03B cited its measurements against
  "the artboard" without naming which one, and `Thread.dc.html` — the artboard a
  reader would assume — contains no photo message at all. A test pins that, so
  the point does not have to be re-derived.
- What did NOT ship, and why. The image's asymmetric per-corner radius
  (`1rem 1rem 0.5rem 0.25rem`) is A03 request #7: two of its corners are below
  the ramp's 10px floor, and it is a tail ECHO, so it depends on a tail. The
  artboard shows ONE state — incoming, bottom-left tail — while the component's
  radius matrix has four, and a grouped middle photo has no tail to echo. The
  other three are not invented here. `rounded-fw-md` ships as a defensible
  interim: against a 20px `rounded-card` outer at a 4px frame, 14px reads as
  concentric.
- The caption's `14px/20px` is an OPEN QUESTION recorded in A03, not a silent
  call. `text-body-sm` matches its leading exactly and its size by 1px, which by
  this audit's own threshold is noise — but the caption ships at `text-body`
  (15px) with every other message body, and splitting a photo caption into its
  own type role is a design decision rather than a measurement. Only the design
  owner can say whether that 1px is a role or a hand-tune.

## 2026-09-07 — a group's identity is who is in it (G-29c)

- The thread header rendered a single static `Users` glyph in a tinted circle
  and a subtitle reading "Group conversation" — a category label sitting next to
  a stack of nothing, restating what the reader already knows. `Group.dc.html:27-34`
  draws an overlapping member stack and the literal count, "9 members".
- Both now ship, and neither needed new plumbing. `groupParticipants`
  (user_id → name/avatar) was already threaded into this component for
  per-bubble sender attribution and simply never surfaced in the header;
  `participant_count` was already being read one line above the subtitle, to
  decide WHICH label to show. The count only ever needed printing.
- The generic glyph stays as the fallback, deliberately. The participants map is
  fetched async, so before it lands there is nobody to stack — an empty stack, or
  a "+N" derived from a half-loaded map, would be a header that lies for a
  moment on every group open.
- A PRIMITIVE GAINED A KNOB RATHER THAN A FORK. `AvatarGroup` hardcoded
  `ring-canvas` on both the avatar rims and the overflow chip. The rim exists to
  read as a cutout in whatever the stack sits ON, and this header sits on the
  InstrumentPanel's `--fw-color-surface` — byte-identical to the artboard's
  `2px solid oklch(0.984 0.016 86)`. So `AvatarGroup` takes an optional `ring`,
  defaulting to `ring-canvas`; every existing caller is unchanged. A messaging
  copy of the primitive to fix one token would have been the wrong trade.
- Two geometry deltas absorbed, recorded in A03 with different reasoning. 34px →
  32px is 2px on an avatar, in line with every other absorption here. -12px →
  -8px is 4px and larger, taken anyway because the overlap lives on the shared
  `ringPad` scale: changing it restacks every avatar group in the app, and a
  messaging-only overlap would be forking a primitive to gain 4px. If that is
  ever granted it belongs on `ringPad`.
- The faces are `decorative`. The subtitle beside them says "N members" and the
  title names the group, so announcing every face again would only make the
  header longer to listen to.
- G-29 is now complete: G-29a (typography), G-29b (photo framing), G-29c (this),
  day separators closed by G-50a, and pagination deferred to G-17 as recorded.

## G-49a — the bubble measure cap is absolute, not a percentage of the pane
`src/components/fairway/pages/messages/MessageThreadPane.tsx`

- G-50b applied `max-w-[288px]` and deliberately KEPT `sm:max-w-[70%]`, writing in
  its own comment that every artboard is a 390px phone scene and supplies no
  desktop authority. That reasoning was right on the evidence it had. G-49's F13
  is the evidence it lacked: "The repo constrains bubble width by percentage
  only, with no absolute cap... on the desktop 720px-capped panel a bubble can
  reach ~475px — well past the readable measure §8.3 is protecting."
- The decisive quote is the plan's own, via `audit/M03B-thread.md:94`: "D08
  annotates a **288px maximum text measure**... constrained by available row
  width." A maximum narrowed by row width is a CEILING. A percentage cap cannot
  express one — it is a function of the container, which is the variable the
  rule exists to protect against.
- Tailwind's `sm:` is min-width 640px and the pane is `max-w-[720px]`, so the
  override was not a desktop refinement on top of the cap: above 640px it was the
  only rule in effect, and 288px never applied anywhere it was measurable.
- NOT a correction to G-50b. G-50b named the desktop case as unresolved in the
  comment it shipped; G-49 resolved it. Nothing about the 288-vs-268 derivation
  changes, and the bubbleWidth suite's assertions about it all still pass.
- A test assertion was re-anchored, not weakened. `bubbleWidth.test.ts` asserted
  `sm:max-w-[70%]` was PRESENT — it encoded the decision, not the derivation. It
  now asserts its absence and says in the test body which finding superseded it,
  so the reasoning is not lost. Same treatment as the G-26 metadata suite in G-50b.
- One assertion I wrote and then deleted, recorded because the deletion is the
  honest part: a "characters per line" block claiming 504px busts the 45-75
  character band. At the conventional 0.5em advance it computes to 67 characters,
  which is inside the band — so the arithmetic did not support the claim, and the
  comment I had written in the component saying "roughly 85 characters" was wrong.
  Removed both. The finding stands on the maximum being exceeded, which needs no
  invented constant.

## G-49b — the bubble depth system
`src/components/fairway/pages/messages/MessageThreadPane.tsx`

- F14: "Bubbles and canvas are flat single colors with zero box-shadow. The
  artboard gives every surface a gradient + inset highlight + drop shadow. Hues
  match closely; the depth system is simply absent." The manifest adds that this
  is the same gap M03A found on unread rows (G-03) — "one systemic issue across
  two lanes, not two."
- THE OTHER LANE WAS ALREADY CLOSED. G-32 applied `--fw-shadow-card` to the
  rail's unread row and layered `bg-canvas-gradient` over `bg-canvas` at four
  page-shell sites. So F14's canvas half and G-03's elevation half both shipped
  three commits ago; this commit is the thread-bubble half, and G-03 does not
  become newly outstanding because of it. (G-03 stays in PROGRESS.md's DEFERRED
  table for its own reason — it is sequenced behind G-04 — and its elevation
  claim specifically is satisfied.)
- INCOMING WAS FREE. `Bubbles.dc.html:18`'s `.lit` is byte-identical to
  `--fw-shadow-card`. Not asserted from memory: the test parses both
  declarations, normalises whitespace and compares, so if either side moves the
  suite fails rather than shipping a stale value.
- `shadow-card` is NOT that token. It is a legacy Tailwind entry with a
  different value, which is why the escape `[box-shadow:var(--fw-shadow-card)]`
  is the repo idiom — the same trap G-32's rail comment records, now pinned by a
  test that also asserts the bridge really is absent from tailwind.config.ts.
- OWN WAS NOT FREE. `.lit-accent` is a hued ambient —
  `0 8px 20px oklch(0.488 0.124 150 / 0.22)` — a green cast under a green
  bubble. Every `--fw-shadow-*` is a neutral warm grey; a hued shadow is not a
  step on that ramp but a different kind of value. A03 request #8, and the test
  compares `.lit-accent` against EVERY shadow token to prove the request is
  real rather than unexamined.
- Reusing `--fw-shadow-card` there would have been a visible defect, not an
  absorption: its inset is a 0.55-alpha white top edge for a light cream card,
  and the artboard dims the same edge to 0.14 on the green bubble because the
  surface beneath is dark. `shadow-soft` ships instead — a real bridge, the same
  two-layer ambient structure, and no inset at all.
- The failed-send state is left alone deliberately. `Bubbles.dc.html:132` draws
  it as `.bub green` WITHOUT `.lit-accent` — the ambient comes off and a danger
  ring replaces it. G-19's `opacity-60` reaches approximately the same place
  from the other direction, fading the shadow with the fill. Recorded in A03 as
  a question for whoever revisits that treatment, not as a request.
- Two test patterns I wrote too broadly and narrowed, both the hyphen-boundary
  trap this audit keeps hitting: `\bshadow-card\b` matches INSIDE
  `--fw-shadow-card` (a word boundary sits before a hyphen), so it could never
  fail — now a lookbehind/lookahead pair. And a blanket "no raw box-shadow"
  regex flagged G-50a's day chip, which legitimately composes two tokens inside
  the escape; narrowed to forbid a hand-typed `oklch(`/`rgb(` instead.

## G-20a — the "Didn't send" banner, and the half of it that already shipped
`src/components/fairway/pages/messages/MessageComposer.tsx`

- THE EIGHTH CORRECTION FROM MEASUREMENT, and it changed what got built. G-20
  says Did-not-send "has no implementation in MessageComposer.tsx — no failure
  banner, no Retry". Tracing both send paths shows that is half stale:
  - `onSend` → `FairwayMessages.handleSendMessage` → `useGolfMessages.sendMessage`.
    The optimistic row is pushed BEFORE the `try`, unconditionally, so no text
    failure can avoid it: every one ends as a muted bubble with its own Retry.
    G-19 built the artboard's sixth state already, in a better place than the
    artboard drew it — §9.2 keeps the message where the user sent it rather
    than pushing it back into the field.
  - `onSendWithAttachments` → `handleSendMessageWithAttachments` →
    `useMessageAttachments`. No optimistic row anywhere in that path. On failure
    there is a toast and nothing else, and the message exists nowhere but in the
    composer. That is the case the banner is for, and the only one.
- AND THE TRACE FOUND A DEFECT G-19 LEFT BEHIND. `if (success)` guarded the
  draft clear, so a failed TEXT send kept the words in the field while G-19's
  bubble showed the same words in the thread: one sentence, two places, two
  different retries, and pressing both would have been the duplicate-send risk
  `memory/features/team-communications.md:82-90` already treats as accepted
  doctrine. The composer now lets go on that path — the thread owns it.
- The clear reuses the mid-flight logic, extracted as `dropSent`. A blanket
  `setMessage('')` would discard a second sentence typed while the failed send
  was in flight, which is the exact bug §9.3's original comment exists to
  prevent; only `sentRaw` leaves the field, on success and on failure alike.
- NO PROP SIGNATURE CHANGED. `hasAttachments` is already computed at the top of
  the submit and is exactly the discriminator, so the composer knows which path
  it took without being told. The asymmetry is documented on the state instead:
  `onSend` returning false means the thread holds a failed row;
  `onSendWithAttachments` returning false means nothing was recorded anywhere.
- Retry on this path re-submits what is still staged rather than calling
  `retryMessage`. There is no persisted id to re-send — `useMessageAttachments`
  wrote nothing — so the draft and the pending files ARE the record of the
  attempt. That is what the artboard's "the text is never lost" caption means
  here.
- `sendError` gained `retryable`, which separates the two things that land in
  it. A failed attachment send can be tried again; the G-21 refusal (no
  attachment-capable handler) cannot — retrying a missing prop just refuses
  again — so it keeps its text and shows no Retry.
- The banner moved ABOVE the track, where `Composer.dc.html:140-149` draws it.
  Below it (where the G-21 refusal whispered in secondary ink) it read as a
  footnote to a field that still looked ready.
- Values: `px-3 py-2` and `rounded-fw-md` are exact against the artboard's
  `8px 12px` / `0.875rem`; `gap-2` absorbs 1px off 9px; `text-caption` is
  12px/18px against 12px/17px — one line, so a 1px leading delta does not
  compound the way G-29's per-line 2px did. The ink is A03 entry #3 already
  (`oklch(0.505 0.19 27)`, a genuinely unmapped third step on the danger ramp);
  `fw-danger-ink` ships paired with `fw-danger-bg` because that pairing is the
  one the token file actually contrast-measured (7.27:1 on the light wash).
  Approximating the artboard's 8%-alpha tint under a borrowed ink would have
  been a guess at both halves.

## G-20b — the §9.5 outcome taxonomy
`src/hooks/golf/use-golf-messages.ts`, `FairwayMessages.tsx`, `MessageThreadPane.tsx`

- §9.5, quoted in `audit/M03C-composer.md:36`: "An unknown commit outcome uses
  Checking status or Confirmation unavailable, not a red definitive failure that
  invites duplication." F3 measures the collapse: every non-success path was
  treated identically and one generic toast covered all of them, so nothing on
  screen could tell "it was refused" from "we don't know".
- THE DISCRIMINATOR WAS ALREADY THERE. `isTransientNetworkErrorMessage` exists
  and is already used by `withOneTransportRetry` on this exact call. A transport
  error means `fetch` itself threw, so no response was ever read and the POST
  may have committed. Anything else — including an `{ error }` the action
  returned — means the request arrived and the server refused it. No new
  plumbing, no new classification vocabulary.
- TWO OUTCOMES, NOT EIGHT. §9.5's table names eight (Sending / Sent / Read /
  Checking status·Confirmation unavailable / Could not send / Access revoked /
  Invalid content / Local persistence failed). F3 documents ONE collapse as the
  gap. The other six have no evidence asking for them and are not invented here.
- The row and the toast read the same classifier, so they cannot disagree: the
  bubble says "Not confirmed" instead of "Not sent", and the toast says
  "Couldn't confirm this send — check the thread before sending again."
- `retryMessage` clears `sendOutcome` along with `sendFailed`. Left behind, a
  row that retried out of `unknown` into `refused` would still be wearing the
  old label.
- Duplication risk unchanged and still safe: `retryMessage` reuses the row's
  existing id, so a retry racing a commit collides on the primary key and the
  action reports 23505 as the success it is. The taxonomy fixes what the user is
  TOLD, which is the gap F3 isolates — explicitly separate from the idempotency
  question `memory/features/team-communications.md:82-90` already treats as
  accepted doctrine.
- A test assertion re-anchored, not weakened. The G-19 suite pinned
  `markSendFailed(optimisticId)` exactly and the row's whole shape, so adding a
  second parameter broke two tests about a property they do not own (every
  failure branch MARKS rather than filters). Both are now argument-agnostic past
  the part they own. Proven not weakened: checked out `fef04dbb9~1` — the commit
  before G-19 — and all six still fail there.

## G-09a — the upload bar was wired to nothing

- Change: `MessageComposer.onSendWithAttachments` takes a third argument, a
  per-file `onProgress(attachmentId, progress)` the composer supplies;
  `FairwayMessages.handleSendMessageWithAttachments` accepts it and forwards it
  into `sendMessageWithAttachments`. The composer moves everything staged to
  `uploading` when the transfer starts and updates each tile's
  `uploadProgress` as the transport reports.
- A CORRECTION to the finding, and it changes its severity claim. M00 reads
  G-09 as a §1.1 "no false progress" violation on the strength of
  `attachments.ts`'s hardcoded 10/90/100. Those constants reached no pixel.
  `useMessageAttachments` has always ACCEPTED an `onProgress` and threaded it
  into `uploadAttachment` per file, and `AttachmentPreview.tsx:170,189` has
  always rendered `{uploadProgress}%` and a bar at that width — but
  `FairwayMessages` called `sendMessageWithAttachments({conversationId,
  content, attachments})` with no callback, and the composer wrote
  `uploadProgress: 0` at staging and never wrote it again. Nothing false was on
  screen because nothing was on screen. The defect is a dead wire, not a lie.
- Split from the transport for that reason. G-09a is the wiring and carries no
  transport risk: it makes the bar move in real time even against today's
  simulated constants, and it is the socket a real byte signal plugs into.
  G-09b (XHR over `createSignedUploadUrl`, replacing the fabricated constants,
  with the current `storage.upload()` as the fallback) is where the risk lives
  and is tracked separately.
- Monotonic and clamped. An upload reports per chunk and a transport that
  re-sends one can re-announce a lower byte count; a bar that slides backwards
  is the one thing a progress indicator must never do. `Math.max` against the
  tile's current value holds it, and the 0–100 clamp stops a transport that
  overshoots its own total from painting past the track.
- A failed send returns the tiles to `pending` at 0 rather than freezing them
  mid-bar. Whatever fraction was on screen when the send failed is a claim
  about a transfer that is not happening, and this path's Retry (G-20a) starts
  the upload from the first byte.
- The composer owns the staged tiles, so the composer owns the callback. The
  parent holds no progress state of its own — a second source would drift from
  what is rendered.

## G-61 — the `contentType` upload option was inert (new finding, found under G-09)

- Change: `uploadAttachment` retypes the Blob it uploads. When
  `uploadFile.type` already equals the resolved type the same object is passed
  through untouched; otherwise a `File` is rebuilt with
  `{ type: resolvedMimeType, lastModified }`. `heic-to-jpeg.ts:69` constructs a
  File the same way, so this is the local idiom.
- The defect: `.upload(path, file, { contentType: resolvedMimeType })` does not
  do what the comment above it said. `uploadOrUpdate`
  (`@supabase/storage-js/dist/index.mjs:615-641`) branches on the body type —
  a Blob goes into a `FormData` with the file appended and `options.contentType`
  never read; only the raw-body branch (631-636) turns that option into a
  `content-type` header. A `File` is a Blob, and `convertHeicToJpeg` returns
  the ORIGINAL file for anything that is not HEIC, so the mime the Storage API
  saw was the file's own `type` — blank on an iOS camera capture, which the
  browser then labels `application/octet-stream` in the multipart part.
- LATENT, not confirmed live, and the distinction is deliberate. What the SDK
  source supports is that the option is dropped for a Blob body and the comment
  overstated it. Whether the Storage API then rejects the object depends on how
  it reads a multipart part's type, which is not visible from this repo. Sentry
  (org `helm-xs`) is quiet over 90d on upload/mime failures, which is weak
  evidence either way — this path may simply carry little traffic. Written as
  latent for the same reason the "85 characters a line" constant was retracted
  earlier in this audit: the finding does not need the stronger claim.
- Found while tracing G-09's transport. Landed on its own and BEFORE the
  transport change, because it survives if G-09b defers, it needs no transport
  mocking to test, and it makes the two upload paths coherent: without it the
  signed-URL PUT and the `.upload()` fallback would send different mime types
  for the same file, so a 4xx on one would say nothing about the other.
- The `contentType` option is kept, not deleted. It is correct for the raw-body
  branch, and the comment now says which branch reads it.

## G-09b — the numbers come from the transfer

- Change: `uploadAttachment` uploads through `createSignedUploadUrl` + an
  `XMLHttpRequest` PUT, reporting `upload.onprogress` bytes. The hardcoded
  10 / 90 / 100 and the "we simulate progress for UX" comment are gone.
  `supabase.storage.upload()` stays as the fallback.
- `XMLHttpRequest` rather than `fetch`, and no new dependency: `xhr.upload.
  onprogress` is the only upload-progress signal a browser gives without a
  streaming request body, and it is the same object whose `abort()` G-24
  needs. A TUS client would add nothing this path uses.
- The headers are COPIED from the SDK's own raw-body branch
  (`@supabase/storage-js/dist/index.mjs:631-636`) rather than invented — that
  branch is the proof the endpoint accepts a raw body PUT. `cache-control:
  max-age=3600` is carried across deliberately; it was easy to drop while
  rewriting the call and would have silently changed object caching. No
  `Authorization` and no `apikey`: the token is in the query string, which is
  what lets a bare XHR work.
- WHEN THE FALLBACK FIRES, narrower than "anything not 2xx" and stated because
  it is a judgement call: a signing failure and a transport failure mean no
  server answered, so the other path can still succeed. A 4xx IS an answer —
  and since G-61 both paths send the same mime for the same bytes, re-sending
  them would collect the same refusal at twice the latency. 5xx falls back: a
  server fault is not a verdict about this request.
- `lengthComputable === false` reports NOTHING. `event.total` is 0 there, so
  `loaded / total` is NaN or Infinity, and a number derived from it is exactly
  the fabricated progress §1.1 forbids. The bar holds its position, which is
  the honest reading of "we cannot tell".
- Capped at 99 while bytes are moving; 100 is reported by the caller once the
  response has arrived. "The last byte left this device" and "the server
  accepted it" are different facts, and the gap between them is the window in
  which the upload can still be refused.
- The fallback reports 0 and then 100 and nothing between. `.upload()` exposes
  no transfer signal, and the shimmer overlay at 0% already reads as "working".
  Recorded here rather than hidden: the fallback also cannot be cancelled,
  which G-24 inherits.

## G-24 — the X on an uploading tile is a cancel

- Change: an `AbortSignal` runs the length of an attachment send.
  `uploadAttachment` and `putWithProgress` take one and call `xhr.abort()`;
  `useMessageAttachments` threads one signal through every parallel upload and
  reports `cancelled` rather than a failure; `FairwayMessages` forwards it and
  suppresses the toast and the `logError` for a cancel; `MessageComposer` owns
  the controller and aborts it when a tile that is mid-transfer is removed;
  `AttachmentPreview` names the control "Cancel upload of <file>" while that
  file is uploading.
- The control already existed and was misleading. `AttachmentPreview`'s remove
  button renders in every state, so mid-upload it took the tile off screen
  while the bytes kept going — the file finished uploading and the send carried
  it anyway, because the handler holds its own captured array. A user could
  remove a photo and still send it.
- G-09b is what made this reachable. The transport is an `XMLHttpRequest`
  because `upload.onprogress` is the only browser upload signal without a
  streaming body — and the same object is the one with an `abort()`. The
  manifest predicted exactly this ("one change closes both") and it held.
- A cancel is not a fault, and the code says so in four places: no fallback to
  the uncancellable transport, no `console.error`, no `logError`, no toast. It
  is also not the "Didn't send" banner (G-20a) — announcing a failure to the
  person who caused it is noise. `cancelledByUserRef` is what scopes that
  suppression; it is reset at the start of every send, so a cancel cannot
  silence the NEXT attempt's real failure.
- One signal for the whole send, not one per file, because the message is the
  unit: `sendGolfMessageWithAttachments` takes all the attachments at once and
  a message cannot be committed with some of them. Cancelling therefore
  abandons the send, deletes whatever finished uploading before the signal
  fired (a new `cleanup-cancelled-attachments` path, sharing the orphan
  removal the message-failure branch already had), and hands the draft and the
  remaining files back to the composer.
- The fallback stays uncancellable and this is stated rather than hidden:
  `.upload()` takes no signal in this SDK version, so a cancel is honoured only
  if it lands before the fallback starts. That check is there, and it is the
  whole of what can be honoured.
- The side effects in `handleRemoveAttachment` moved out of the
  `setPendingAttachments` updater. Revoking an object URL and aborting a
  transfer must happen once, and React may call an updater more than once.

## G-22 — five-line growth was a hardcoded 120px

- Change: `MessageComposer` computes the cap from the textarea's own resolved
  style — `line-height × 5`, plus vertical padding and border where
  `box-sizing: border-box` puts them inside `height`. The `Math.min(
  scrollHeight, 120)` clamp and the inline `maxHeight: '120px'` are gone; the
  computed value is written to `style.maxHeight` so no CSS cap can quietly
  take charge again.
- The constant was not even five lines. At the composer's 24px line-height,
  120px is five lines of CONTENT, and `py-2` spends 16px of it — about 4.3
  visible lines at the default text size. Every step up from there (browser
  zoom, OS text-size, iOS Dynamic Type) took another fraction away, which is
  precisely the case §9.4 was written to protect. The fix is therefore 16px
  taller at the default size and scales from there.
- Two details the computation gets right on purpose. `line-height: normal`
  computes to the STRING "normal", so `parseFloat` yields NaN — unguarded,
  that NaN poisons the max and the field grows without limit; the fallback is
  the ratio browsers use for `normal`, approximate because the platform
  declined to resolve it. And padding counts only under `border-box`: adding
  it under `content-box` would overshoot by exactly the padding, the same
  class of error as the constant being replaced.
- A `resize` listener re-measures. Text size changes without a keystroke — a
  zoom, an OS setting, a webfont finishing its load — and the effect keyed on
  `message` alone would keep a cap measured against type no longer rendering.
- `minHeight: '40px'` is deliberately UNCHANGED. §9.4 is about growth; the
  control's resting height is composer geometry and belongs to G-47.

## 2026-09-07 — G-47 composer geometry, from the artboard's numbers

- Change: five deltas, one finding. (1) A raised outer glass DOCK now wraps
  the writing track — the `<form>` is only the safe-area gutter. (2) The send
  control is a full circle. (3) It draws 40px at every width with a 44px tap
  target as an invisible overlay. (4) The track centres at rest and
  bottom-aligns once the field has grown. (5) The placeholder names the
  recipient.
- THE DOCK IS A FREE TOKEN APPLICATION, and that is the finding rather than a
  convenience — the third time this audit has found it (G-32 on the rail,
  G-49b on the bubbles). `Composer.dc.html:18-20`'s `.slab` is byte-identical
  to the Fairway glass material: `rgb(244 232 210 / 0.74)` IS `--fw-glass-bg`,
  `blur(22px)` IS `--fw-blur-glass`, `saturate(190%)` IS `--fw-glass-saturate`,
  `1.75rem` IS `--fw-radius-lg` (whose own comment reads "glass bars"), and
  the two drop layers `0 2px 4px oklch(0.18 0.01 60 / 0.06), 0 12px 32px
  oklch(0.18 0.01 60 / 0.10)` ARE `--fw-shadow-pop`, to the byte. The
  artboard's inset specular `rgb(255 248 233 / 0.6)` against
  `--fw-glass-highlight`'s `rgb(255 249 235 / 0.55)` is two channel units and
  0.05 alpha — absorbed as render noise, not raised as a variant request.
- `.fw-glass-regular` deliberately NOT reused. It is the same material, but it
  declares itself "LOCAL to the group", is emitted only by the Fairway overlay
  primitives, and composes `--fw-shadow-raise` (0 18px 44px / 0.15) where the
  artboard uses `--fw-shadow-pop` (0 12px 32px / 0.10). Reaching for the class
  would have taken a depth step the artboard did not draw — a popover floating
  above the page rather than a dock resting on it.
- Arbitrary-value syntax (`[background:var(--fw-glass-bg)]`) because the
  `--fw-glass-*` family has NO Tailwind bridge: `backdrop-blur-glass` is 16px,
  from the older cream-derived scale, not the token's 22px.
  `CourseDetailDrawer.tsx:301` is the local idiom for exactly this.
- The send button's two corrections are separate. `rounded-fw-md` (14px) made
  the focal action a rounded square where `--fw-radius-full`'s own comment
  reserves the pill axis for "primary CTAs". And mobile drew 44px VISIBLE,
  which inverts §9.1's own split — it asks for a 40px circle inside a 44px hit
  area, and the code grew the circle instead of the tap zone. The fix puts the
  hit area in an `after:-inset-0.5` overlay: 40 + 2 + 2 = 44 exactly, and not
  one drawn pixel moves.
- Alignment is MEASURED, not counted. `isGrown` compares the resized height
  against one line's worth of the same box G-22 computes; whether text wraps
  depends on the width, so a character count would be wrong at some widths.
- The recipient name reads the SAME source as the thread header
  (`MessageThreadPane.tsx:838`), so the two cannot name different people. A
  1:1 uses the first name, matching what the artboard writes; a group keeps
  its title whole, because clipping "Varsity Team Chat" at the first space
  would invent a person. Undefined falls back to the generic string rather
  than rendering "Message undefined".
- OUT OF SCOPE deliberately, and stated so nobody reads silence as agreement:
  the artboard's `.track` gradient fill, `.send-on` gradient and `.send-off`
  `oklch(0.963 0.021 84)` are not among G-47's five bullets. The track keeps
  `bg-surface` and the disabled send keeps `bg-surface-sunken`.

## 2026-09-07 — G-45 / D-05 the focus ring: artboard geometry, token colour

- Change: the composer track's focus treatment is
  `focus-within:border-border-focus/30` plus a single new outer shadow,
  `0 0 0 4px color-mix(in oklab, var(--fw-color-border-focus) 10%,
  transparent)`. It replaces `focus-within:border-accent-500
  focus-within:ring-2 focus-within:ring-border-focus/30`.
- Implements the owner's FROZEN call (`audit/DECISIONS.md` D-05): keep the
  tokens, take the artboard's geometry. Not a preference of this session's.
- The conflict was real and the fix turns on it. `Composer.dc.html:24`'s
  `.track-on` glow is built from `oklch(0.648 0.149 149.6)` — accent-500 to the
  byte — and `design-tokens.css:150-165` documents that light theme must not
  use accent-500 for focus: ~2.67:1 against WCAG 2.2's 3:1 non-text minimum,
  `fwFocusRing` had already hard-coded accent-600 for that reason, and 175 call
  sites reaching for `ring-border-focus` were "drawing a ring nobody with low
  vision could reliably find". `focus-within:border-accent-500` WAS one of
  those 175. Copying the artboard literal would have re-opened a closed
  accessibility defect.
- The part the lane missed, and the reason this stays a token rather than a
  chosen literal: it is THEME-DEPENDENT. Dark keeps accent-500 deliberately
  (`design-tokens.css:512`) because there it is the lighter green and the one
  that earns contrast. Any single literal is wrong in exactly one theme.
- The inner 1px layer is the BORDER that was already on the element, not a
  ring outside it. Same 1px of visual weight, and no 1px of layout shift the
  moment the field takes focus. Only the 4px outer layer is a new shadow.
- Written with `color-mix(in oklab, …)`, which is what the Tailwind alpha
  bridge itself emits (`tailwind.config.ts:38`) — a channel-triplet or rgba
  form against a raw `var()` token emits no rule at all, which is the trap
  `AttachmentPreview`'s G-46 note already recorded.
- OBSERVATION, not a deviation: the composite indicator (1px @ 30% + 4px @
  10%) is lighter than the `ring-2 @ 30%` it replaces. D-05 states the glow
  geometry "carries no contrast risk", and that is the frozen call, so it
  ships as decided — but nothing here MEASURED the rendered result, and a
  rendered contrast check of the focus indicator belongs to W8 alongside G-26.
