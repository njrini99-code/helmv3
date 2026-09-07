# Change ledger — team_communications

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
