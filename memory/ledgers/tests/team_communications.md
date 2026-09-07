# Test ledger — team_communications

## 2026-09-07 — W7b group membership: pgTAP + 31 more component/action assertions

- SHA: 79f6e1a07.
- Added `supabase/tests/rls/golf_group_membership_management.sql` (14 pgTAP
  assertions), 31 tests to
  `src/components/fairway/pages/messages/GroupDetailsSheet.test.ts` (45 → 76),
  and `GroupDetailsSheet.membership.test.tsx` (24 jsdom render tests, of which
  19 fail against the pre-change component — the 5 that pass are correctly the
  read-only assertions).
- THE PGTAP SUITE IS THE LOAD-BEARING ONE, and the split is deliberate: the
  component suite pins TEXT (the migration says what it must, the actions
  surface a refusal, the sheet offers the control to the right person), while
  only the pgTAP suite proves BEHAVIOUR. `pg_policies` will happily show a
  policy whose three bounds are each present and jointly wrong — this same table
  has already shipped a predicate that read correctly and evaluated to
  `p.x = p.x`.
- RUN IN BOTH DIRECTIONS, which is what makes it evidence. With the migration
  applied: 14/14. With both policies reverted to their pre-migration shape
  inside the same transaction: exactly 3 fail (the delete policy's creator
  branch, the add, the remove) and the rest still pass. Those matter as much as
  the 3 — they are the 2026-08-19 refusals and the creation order, and they show
  the widening did not disturb them.
- A THIRD CONTROL RUN, AND THE SUITE RECORDS WHAT IT FOUND AGAINST ITSELF. GROUP
  4 (creator leaves, then tries to remove someone) was added for the DELETE
  branch's new participation clause — and with that clause ALONE removed, all 14
  still pass. Measured reason: `golf_participants_select_v2` already makes the
  target rows invisible to a non-participant. So GROUP 4 is a contract on the
  OUTCOME, holding today through two independent mechanisms, and the file says
  so in a "ONE HONEST LIMIT" note rather than letting a reader take it for a
  test of the clause. Test 13 (the leave itself succeeded) exists so test 14
  cannot pass because the leave silently did nothing.
- THE REFUSALS ARE PAIRED WITH PERMISSIONS ON PURPOSE. The trap is named in
  20260819070000's own verification block: a predicate that blocks everything
  passes every refusal check. So "creator CAN add a teammate" sits beside
  "CANNOT add a non-teammate", and the two-statement creation order — the exact
  shape `createConversation` uses, and the thing a naive "zero existing
  participants" predicate breaks — is asserted alongside them.
- THE ASSERTION THAT WAS WRONG FIRST. A DELETE denied by RLS removes zero rows
  rather than raising, so these are row-count assertions, not `throws_ok`. The
  first draft took those counts AS THE ACTING USER and reported test 11 red for
  the right outcome by the wrong route: the creator's participant row is not
  selectable by a non-creator either way, so the count reads 0 whether the
  delete was refused or succeeded. Both delete assertions now `RESET role`
  first. This is the class of test that passes against the defect it exists to
  catch.
- ANON IS ASSERTED SEPARATELY FROM PUBLIC on the new definer helper, because
  they are two different grants and revoking one is a common half-fix. A
  SECURITY DEFINER function is EXECUTE-to-PUBLIC by default and anyone holding
  the publishable key is `anon`, so without both this helper is an
  unauthenticated roster oracle.
- THE RECURSION TRAP IS ASSERTED AS AN ABSENCE, scoped to the policy body rather
  than the file: the INSERT policy must not contain
  `from public.golf_conversation_participants`. An inline read of its own table
  fails EVERY query against the table, not just that branch, and the repo has
  been bitten by this before.
- THREE BOUNDS, THREE SEPARATE ASSERTIONS. Team-chat-only, creator-only, and
  target-already-on-team are checked individually so dropping any ONE of them
  goes red — the safety argument is that they hold TOGETHER, and a single
  combined assertion would let two-of-three pass.
- THE ABSENCE LIST SHRANK, WHICH IS THE MECHANISM WORKING. `'Add member'` and
  `'Leave group'` were removed from the deferred-control `it.each`; Mute, Search
  and Files stay. That block was written so enabling one of these costs a
  deleted assertion — it did, and the comment now records that it happened
  rather than leaving the list looking as though it had always been three.
- TWO ACTION-COUNT TRIPWIRES MOVED, with the arithmetic written into both:
  `coverage-contract.foundation` 428 → 432 (and golf message exports 10 → 14),
  `feature-registry` 420 → 424. The second was needed because
  `src/app/actions/messages.ts` is one of the explicitly-listed manifest entries
  rather than an `'ALL'`-mapped file, so the four new actions had to be named in
  `feature-registry.ts` too. Neither is a known-bad ratchet being raised to pass
  a build — they are exact-count tripwires whose whole job is to make a new
  public POSTable server action a deliberate act.
- THE ARTBOARD IS MEASURED ON BOTH SIDES for the two controls it actually draws:
  the "Add" link's 12px/500 accent against `caption-1`'s own 12px/400 step, and
  the "Leave group" pill's 50px height and 15px against `subhead`. The artboard
  draws no per-row Remove at all — that affordance is an addition, and is
  recorded as one rather than being attributed to the design.

## 2026-09-07 — W7 GroupDetailsSheet.test.ts

- SHA: 0897e63cc.
- Added `src/components/fairway/pages/messages/GroupDetailsSheet.test.ts`
  (45 tests). Verified to fail (12 of 45) against the pre-fix tree: the three
  tracked files were reverted to HEAD, the suite run, and the tree restored.
  The new component cannot be reverted (the suite imports it), so the 12 are
  exactly the assertions about the DATA and the ENTRY POINT — which is the half
  that existed before and was wrong.
- MEASURED ON BOTH SIDES, which is the point of the artboard block: every
  claimed token match parses the number out of `GroupDetails.dc.html` AND out of
  `design-tokens.css` / `tailwind.config.ts`, then compares them. A hardcoded
  expectation would let a token change slide past silently; this way the suite
  goes red if EITHER side moves, and the premise under the fix is re-checked
  rather than outliving its reason.
- The assertion that carries the most weight is the subtitle one, because it is
  the whole argument for reaching outside the canonical ramp: `.sub` sets
  `font-size: 12px` and NO `font-weight`, so it is 400 — and the test asserts
  both that `caption-1` is `'400'` and that canonical `caption` is `'500'`. If
  someone later normalises the canonical step to 400, this goes red and the
  reason for using the iOS step is re-examined instead of being inherited.
- Same shape for the name: both `subhead` and `body` are asserted to be 15px,
  so the test states plainly that the two steps differ only on leading, and
  then pins the artboard's 21px against `subhead`'s 1.35 and `body`'s flat 24px.
- THE PRESENCE DOT IS PINNED AS PRESENT IN THE ARTBOARD. The dot is genuinely
  drawn (`:94-96`, accent-500 to the byte) and is deliberately not shipped
  (D-01a / G-51). Asserting the artboard still draws it keeps the omission a
  DECISION: if the design ever drops the dot, this test goes red and someone
  re-reads why the code omits it, rather than the two silently agreeing for
  different reasons.
- The five deferred controls (Mute / Search / Files / Add member / Leave group)
  are each asserted ABSENT, one case per label. Absence is normally the thing a
  suite cannot see, and here it is the scope boundary: a later pass that adds
  one has to delete an assertion, which is the point.
- THE TWO DERIVATIONS ARE EXERCISED DIRECTLY, not asserted to exist — the split
  the G-13 stale-fetch suite established: source assertions prove the code is
  PRESENT, direct tests prove it is RIGHT. `orderMembers` and `describeGroup`
  are exported for exactly this. Eleven cases cover viewer-first regardless of
  input position, alphabetical remainder, the viewer absent, a null/undefined
  viewer dropping nobody, non-mutation of the caller's array, both creator
  branches, the creator who cannot be named (clause drops WHOLE — the
  "created by someone" failure), a missing and an unparseable timestamp (date
  drops, creator survives), and `1 member` singular.
- Source-side guarantees on the hook, all comment-stripped first: every one of
  these files documents the defect it fixes by quoting it, so a naive whole-file
  search finds the old shape inside the prose describing its removal. The
  stripped text is what the code assertions read.
- The `shrink-0` assertion is scoped to a 300-character window after the
  control's `aria-label`, not to the file, so it pins the property on THIS
  element rather than passing on any `shrink-0` anywhere in a 1,900-line file.
- The existing `MessageThreadPane.groupHeader.test.ts` (G-29c) was re-read
  before the header change: its `<AvatarGroup>` slice assertion is 400
  characters forward from the stack, and the new control is inserted AFTER the
  title column, so nothing there is disturbed. It still passes unmodified.

## 2026-09-07 — G-56 action sheet, and two suites re-anchored

- SHA: 0a6f67aef.
- Added `src/components/fairway/pages/messages/MessageThreadPane.actionSheet.test.ts`
  (18 tests). Verified to fail (6 of 18) against the pre-fix component.
- THE ASSERTION THAT EARNED ITS KEEP BY FAILING: "the 16px label has no token,
  which is why it is an A03 request". It went red, and the reason was that a
  second type scale exists in the same config — Apple's HIG block, `callout` at
  16px. The test now records BOTH scales and the reason the iOS one is right
  here. This is the argument for writing "no X exists" as an assertion at all:
  it is the claim an A03 request rests on and the one most likely to be wrong.
- Source-side guarantees (parsed from the artboards, so they fail if a source
  moves): both artboards draw a bottom sheet with a 38x4 grip; NEITHER contains
  a scrim overlay, and the receded-background opacities are 0.32 / 0.34; neither
  renders a Close control; the row geometry is a repeated RULE (four identical
  rows), not one specimen.
- Token-side guarantees, measured on both sides: the panel radius IS
  `--fw-radius-lg`; the panel border IS `--fw-color-border-subtle`; the row
  radius IS `--fw-radius-md` and its comment says "list rows"; the artboard's
  Delete red matches NEITHER `--fw-color-danger` nor `--fw-color-danger-ink`,
  and the token file's own "all three failed as text" measurement is why the
  token wins anyway.
- Render-side guarantees: the panel is the shared Sheet's; the grip is present;
  the rows are LABELLED (the whole of F17 — this is the assertion that fails if
  anyone reverts to the icon strip); the row geometry matches values parsed from
  the artboard rather than typed in; there is exactly ONE sheet for a
  two-message thread; and `onOpenChange(false)` clears the id, which is the one
  assertion covering every dismissal path the primitive owns including the two
  jsdom cannot simulate.
- One PRESERVATION assertion passes pre-fix on purpose: Delete's ink-not-chip
  treatment. `button.tsx` has two danger variants and the strip already used the
  right one; what this pins is that the rewrite did not drift to the other.
- RE-ANCHORED, NOT WEAKENED. The G-55 and G-42 suites addressed the old strip's
  DOM. Each keeps the property it owns and now reads the document rather than
  the render container, because the Sheet renders as a fixed panel outside it:
  * G-55's rule assertion got STRONGER — the sheet's rule is horizontal like the
    artboard's, so both `margin: 6px 12px` numbers are pinned instead of one.
  * G-55's row assertion no longer needs its Close filter, because Close is gone.
  * G-42's "no `lg:hidden`" became "does not gate the action surface on viewport
    width", asserted on the panel and on the whole responsive prefix, so a
    `lg:invisible` or `max-lg:flex` would fail too.
- Not covered: that the sheet is VISIBLE at any particular width (jsdom applies
  no Tailwind, so `sm:max-w-sm` is only a string to it), the grip-drag and
  scrim-tap dismissals themselves, and the rendered look of the capped desktop
  measure. All three belong to the W8 rendered-fidelity pass.

## 2026-09-07 — G-42 incoming actions and the desktop path

- SHA: fa83dbf42.
- Added `src/components/fairway/pages/messages/MessageThreadPane.incomingActions.test.ts`
  (15 tests). Verified to fail (10 of 15) against the pre-fix component; 11 of
  the two suites' 27 fail together, because one assertion in the G-55 suite was
  strengthened at the same time.
- ASSERTED BEHAVIOURALLY throughout — which handlers fire, what the timer does,
  which buttons exist, what the class list says. Every one of those is something
  jsdom models honestly; none of it needs layout.
- The guarantees that matter most, in the order they would regress:
  1. A long press on an INCOMING message opens the row (the spread is no longer
     own-only), and the row is Copy + Close with Edit/Delete withheld.
  2. The hold survives finger jitter. Four sub-slop moves and it still fires —
     the assertion that catches the zero-tolerance cancel, which is a silent
     failure mode: nothing errors, the menu simply never appears.
  3. The slop is a RADIUS. 8px on each axis exceeds it; a per-axis check would
     read that as two small moves and keep the timer alive.
  4. The full 500ms is required. Advancing to `LONG_PRESS_MS` alone pins
     nothing — it passes at 450 too — so the assertion is that the tick BEFORE
     the deadline is still silent. Verified red by reverting the constant.
  5. `select-none [-webkit-touch-callout:none]` is on BOTH bubble kinds. This is
     the assertion that would have caught the near-miss described in the change
     ledger, and it is the one with no visible symptom in jsdom.
  6. Escape closes the row, and the window listener is ABSENT while no row is
     open — otherwise it would swallow the key from the edit field.
- A scroll still cancels the hold. Kept and re-pointed at a 60px drag, since
  attaching long-press to every message doubles how often a scroll begins on a
  listening element.
- The G-55 suite's incoming case is now pinned by what the row HOLDS
  (Copy, Close) rather than only by two nulls, which were passing for two
  stacked reasons — the tap row could lose its separator, or the own-only hover
  row could stop rendering, and either would have read as success.
- Not covered: that the row is VISIBLE at >=1024px (jsdom applies no Tailwind,
  so `lg:hidden` is only a string to it — the class's absence is what is
  asserted), and the real-device feel of the 500ms/10px pair. Both belong to the
  W8 rendered-fidelity pass. `e2e/messages.spec.ts` was read and touches no
  action row, long press or context menu.

## 2026-09-07 — G-55 separator and action order

- SHA: 70844b57b.
- Added `src/components/fairway/pages/messages/MessageThreadPane.actionOrder.test.ts`
  (12 tests). Verified to fail (4 of 12) against the pre-fix component.
- The 8 that pass pre-fix are not filler: they assert the SOURCES, and they
  are what makes the correction to the finding auditable. Three parse both
  artboards' action lists and prove there are two orders rather than three —
  same set, same tail, one leading swap. Three compare the separator colour
  out of `Actions.dc.html` against `--fw-color-border-subtle` out of
  `design-tokens.css`, assert `Reactions.dc.html` differs (so the tie is
  visible), and check the Tailwind bridge maps `border-subtle` to that same
  token. One pins that an incoming message still draws no action row at all.
- The 4 that fail pre-fix are the fix: the separator's position on the mobile
  row, its position on the desktop hover row, its 6px inline margin derived
  from the artboard's own `margin: 6px 12px`, and that both rules are painted
  with the token class rather than an arbitrary value.
- ORDER IS ASSERTED BEHAVIOURALLY — rendered DOM, real children, real order —
  not by regex over a 1500-line component. Order is one of the few things
  jsdom models faithfully, so a source-reading test would have been the
  weaker choice here.
- ANCHORED AWAY FROM WHAT IT DOES NOT OWN: the mobile-row assertion filters
  `Close` out of the row description instead of pinning its index. Pinning it
  would mean a correct G-56 fix arrives as a failure in a suite that has no
  opinion about where Close belongs — and someone edits an assertion to let a
  fix through. Same re-anchoring the `keyboard-inset` suite needed under
  G-47.
- Found by the first run, not assumed: own-ness is
  `sender_id === userId || sender_id === currentUserId`
  (`MessageThreadPane.tsx:1007`), so BOTH identities must move for a message
  to be incoming. Changing only `currentUserId` left the row rendering.
- Not covered: the rule's rendered contrast against the row's background
  (jsdom computes no colour), and the `h-4`/`h-5` rule heights, which are
  matched to the two icon sizes rather than derived from a source. Both
  belong to the W8 rendered-fidelity pass.

## 2026-09-07 — G-08 partial-failure guarantees

- SHA: fabfae3e5.
- Added `src/app/golf/actions/__tests__/message-attachments-partial-failure.test.ts`
  (6 tests) covering `sendGolfMessageWithAttachments` when the
  `golf_message_attachments` insert fails.
- New guarantees:
  1. No text + failed attachments ⇒ `success: false` (was `true` — the defect).
  2. The empty message row is deleted rather than left as a blank bubble.
  3. Orphaned storage objects are removed.
  4. Text survives ⇒ `success: true` with `attachmentsFailed: true` and
     `has_attachments` cleared.
  5. The surviving text still reaches `notifyGolfMessageRecipients` and still
     bumps the conversation timestamp — an early return at the compensation
     point would deliver the message silently. This is the guarantee most
     likely to be regressed by a later refactor.
  6. The success path is unchanged when the attachments do insert.
- Not covered: the two-statement commit race itself (needs two live clients),
  and the rendered bubble state (jsdom computes no layout — see the audit's
  W8 rendered-fidelity item).

## 2026-09-07 — G-26 nesting and G-19 failed-send guarantees

- SHAs: 21e33781b (G-26), fef04dbb9 (G-19).
- `MessageThreadPane.metadataNesting.test.ts` (3) — the timestamp must be a
  DESCENDANT of the message column, and the column must be the row child that
  carries it. Verified to fail (2 of 3) against the pre-fix structure. It
  asserts nesting, not geometry, because jsdom computes no flex layout; the
  geometry check is W8's, in a real browser.
- `MessageThreadPane.failedSend.test.ts` (7) — a failed send still renders the
  text, is labelled "Not sent", is muted rather than removed, wires Retry and
  Discard to the message id, degrades to a labelled bubble with no handlers,
  and leaves a delivered message completely untouched.
- `MessageComposer.midFlightTyping.test.tsx` (4) — text typed during an
  in-flight send survives; only the sent portion is consumed; the payload is
  what was in the box at submit time; a failed send retains the whole draft.
  Verified to fail against the old blanket clear.
- `use-golf-messages.failed-send.test.ts` (6) — source-level, matching the
  sibling send-integrity suite's idiom and stated reason. Note: its first
  version searched the whole file and matched the fix's OWN docstring quoting
  the old expression; assertions now read a comment-stripped copy.

## 2026-09-07 — G-21 fail-closed and G-13 staleness guarantees

- SHA: f5744c0bc.
- `MessageComposer.attachmentFailClosed.test.tsx` (5) — with files pending and
  no handler: the text path is NOT called, the user is told nothing was sent,
  and the draft plus attachment survive. Plain text sends and the
  handler-supplied path are unaffected. Verified to fail 3-of-5 against the
  fail-open branch.
- `use-golf-messages.stale-fetch.test.ts` (8) — 4 source-level (the ref exists,
  is assigned during render, and guards all three awaited writes, with the
  messages setter and error branch checked specifically), plus 4 exercising the
  staleness comparison directly, including the shared-prefix case that a
  `startsWith` implementation would get wrong.

## 2026-09-07 — G-15 preview shape and G-18 equivalence

- `MessageConversationRail.lastMessagePreview.test.tsx` (4) — the rail renders
  text and time from a preview object with no `id` and no `read`, survives the
  nullable `created_at`/`sender_id` the RPC actually declares, keeps the honest
  "No messages yet" placeholder, and renders two conversations that no longer
  share one fabricated id. The discriminator for G-15 is `npm run typecheck`,
  not a source grep: narrowing the type is what proves no consumer read `.id` or
  `.read`, and a grep for the literal could not.
- `send-message-duplicate-key-equivalence.test.ts` (7) — the transport-retry
  case still reports success and is shown to have asked the database; a
  colliding row with another sender, another conversation, or different content
  does not; an invisible row and a failed lookup both fail closed; an ordinary
  successful send does no extra round trip. Verified to fail 6-of-7 against the
  unconditional short-circuit. The harness sequences INSERT and the later SELECT
  on the SAME table, which a table-keyed mock cannot.

## 2026-09-07 — IME composition (G-23)

- `MessageComposer.imeComposition.test.tsx` (8) — each of the three signals is
  pinned SEPARATELY, so an engine-specific fix cannot pass the suite: native
  `isComposing`, `keyCode === 229`, an open composition with neither, and the
  WebKit compositionend-then-keydown order. Plus: the guard is not sticky (the
  next Enter sends), it does not defaults the composing Enter (the IME still
  gets its commit key), an ordinary Enter is unchanged, and Shift+Enter stays a
  newline during composition.
- Verified to fail 5-of-8 against the unguarded handler. The pre-existing
  `MessageComposer.enterKey.test.tsx` passed green over this whole contract
  without exercising it — the shape `.claude/rules/quality-gates.md` warns about.

## 2026-09-07 — per-viewer group unread (G-40)

- `use-golf-messages.per-viewer-unread.test.ts` (15). Eleven exercise the two
  extracted pure functions directly: which conversations get recomputed (groups
  yes, DMs no, already-counted skipped, an absent `is_group` is not a group,
  null input safe) and what happens to the counts (overwrite, a genuine zero,
  KEEP the previous number when no count was produced, other fields untouched,
  no mutation).
- Four assert the wiring on the source, which is what distinguishes fixed from
  broken: both helpers called inside `fetchConversations`, the count is
  head-only `exact` and filtered on sender/is_deleted, the id list is chunked,
  and the supplemental path registers its conversations so they are not counted
  twice. Verified: those 4 fail when the wiring is removed.
- The "keeps the previous number" case is the one that matters most — a failed
  recompute degrading to 0 would render as "you are caught up".

## 2026-09-07 — AttachmentPreview token migration (G-46)

`src/components/golf/messages/AttachmentPreview.tokens.test.ts` — 10 tests,
8 failing against the pre-fix file.

Asserted on the source. The classes are strings in JSX with no runtime
behaviour to observe: rendering and reading `className` would assert the same
strings through three more layers, and would not reach the error, uploading,
audio and document branches without four fixtures built to prove a lint fact.

It exists because no gate could see this. ESLint does not catch a banned
palette name, and the Review Gate's blocking rules are about RLS, auth and
table names — which is why the finding stayed open as long as it did. The
suite also pins the two deliberate non-changes (the `bg-black/20` scrim and
the legacy `IconButton` import), so a future reader does not "fix" them.

## 2026-09-07 — bubble radius (G-48)

`src/components/fairway/pages/messages/MessageThreadPane.bubbleRadius.test.ts`
— 6 tests, 3 failing against the pre-fix file.

The measurement IS the test. Three of the six read `--fw-radius-card` out of
`design-tokens.css` and the dominant corner out of
`audit/reference/Bubbles.dc.html` and compare them here, rather than asserting
a hardcoded "20px" — so the suite fails if the ramp is retuned OR if a new
artboard lands with a different bubble. A literal would have kept passing
through both. Those three pass against the pre-fix file too, which is correct:
they assert a fact about the design, not about the code.

The remaining three pin the code, including the two deliberate non-changes (the
6px and 12px corners that belong to A03), so a later reader does not "finish"
the swap by inventing radius steps.

## 2026-09-07 — unread-row lift and page wash (G-32)

`src/components/fairway/pages/messages/MessageConversationRail.unreadLift.test.ts`
— 5 tests, 3 failing against the pre-fix files.

Measured on both sides, like the bubble-radius suite: the shadow is read out of
`design-tokens.css` and out of `Main.dc.html` and compared here, so a retuned
token or a new artboard fails the suite where a hardcoded shadow string would
not.

It also pins three things that are easy to undo by accident: that selection
still beats the unread face (both paint a background, and an unconditional
unread branch would make an open unread thread indistinguishable from a
selected one); that the gradient is layered OVER `bg-canvas` rather than
replacing it; and that `shadow-card` — a different, legacy value — is not used.

Both negative assertions needed comment-stripped sources: the rail's own
comment warns that `shadow-card` is a trap and the shell's docstring still
describes a `bg-canvas` page, so a whole-file search found each defect inside
the comment warning against it. It did, on the first run.

## 2026-09-07 — floating day chip (G-50a)

`MessageThreadPane.dayChip.test.ts` — 11 tests, **6 failing against the
pre-fix component**, verified by checking out HEAD's version and re-running.

Measured on both sides, the idiom this audit has settled on: each token
assertion reads the artboard's literal out of `audit/reference/Thread.dc.html`
AND the declaration out of `src/styles/design-tokens.css`, then compares them —
so the suite fails if either side moves. A hardcoded expected string would only
have pinned the component.

Beyond the token comparisons it pins the two things most likely to regress
silently: that the hairlines are gone and the row contributes no height (if
someone reinstates an in-flow row the chip is inline again and G-50a reverts
with nothing red), and that `role="separator"` survived the conversion. It also
pins that the glass licence stays bounded to this one element by counting
`backdrop-filter` sites in the file, and that the banned legacy `glass-*`
utilities are not what is being referenced. Source assertions read a
comment-stripped copy, so the fix's own docstring cannot satisfy a check.

## 2026-09-07 — bubble max-width (G-50b)

`MessageThreadPane.bubbleWidth.test.ts` — 7 tests, **3 failing against the
pre-fix component**, verified by checking out HEAD's version and re-running.

Measured on both sides. The 288 is not written into the test as a literal: it
is parsed out of `Bubbles.dc.html`'s `.bub` rule and compared with the
component's class, and the 40px gutter the derivation rests on is compared
against the artboard's own `width: 32px` avatar column and `gap: 8px` row. One
test guards the basis rather than the value — if `.bub`'s max-width ever stops
being a class rule, the decision's whole justification is gone and it fails
loudly instead of silently drifting.

It also pins the mechanism, not just the number: the avatar gutter must remain
a SIBLING of the capped column, since that adjacency is the entire reason
group-incoming derives without a second number. And it asserts that no specimen
width (296/268/292) is written anywhere in the file.

Its own comment stripper removes block comments WHOLE rather than by line
prefix — a JSX `{/* … */}` spans many lines whose interiors read as ordinary
prose. The suite caught that on its first run: the comment explaining why 268
is written nowhere contains "268".

### Collateral: the G-26 metadata test held a value it did not own

`MessageThreadPane.metadataNesting.test.ts`'s `findOwningColumn` walked the
ancestor chain looking for `max-w-[78%]`, so changing the cap to the artboard's
288px rule broke two tests about metadata NESTING — a structural property with
nothing to do with width. The walk now identifies the column by what makes it a
column (`min-w-0` + `flex-col`), which is the property under test.

Loosening a matcher is exactly how a test quietly stops being a gate, so this
was proved rather than assumed: checked out `21e33781b~1` (the commit before
the G-26 fix) and re-ran — both tests still fail against the original
sibling-metadata layout. The test still catches the defect it was written for.

## 2026-09-07 — bubble type size (G-29a)

`MessageThreadPane.bodyType.test.ts` — 6 tests, **4 failing against the pre-fix
component**, verified by checking out HEAD's version and re-running.

Measured on both sides, and on the TOKEN rather than the class name: the size is
parsed out of the `.bub` rule and compared against what `text-body` actually
resolves to in `tailwind.config.ts`. So the suite fails if the artboard moves,
if the token is redefined, or if the class is swapped — where asserting the
class alone would survive `body` being quietly redefined to 13px.

Two of the six are guards rather than assertions about the current code. One
pins that both artboards still state the SAME `.bub` font-size, since "it is a
rule, not a specimen" is the entire basis of the decision and would be silently
gone if they diverged. The other pins that the size is not `body-lg`, so nobody
"fixes" it back toward §8.3's 17px estimate without first noticing that the
artboards disagree with the prose.

## 2026-09-07 — photo framing (G-29b)

`MessageThreadPane.photoFraming.test.ts` — 9 tests, **6 failing against the
pre-fix component**, verified by checking out HEAD's version and re-running.

Three of the nine pin the SPECIMEN rather than the component, because the
specimen's location was itself a correction: they assert the 5px frame and the
inset caption are in `Bubbles.dc.html`, that `Thread.dc.html` (the artboard
M03B cited) contains no photo message, and that the artboard's own annotation
still reads "the image IS the bubble, caption below it". If a photo message is
ever added to `Thread.dc.html` with different numbers, that fails loudly instead
of quietly contradicting the ledger.

The rest pin STRUCTURE, not geometry — order, framing, and which element owns
the width cap — because that is what §8.6 actually asks for and what regresses
silently. Two are guards against numbers coming back: no `max-w-[250px]` or
`max-w-[260px]` anywhere, per the G-50b precedent that the column carries the
cap.

## 2026-09-07 — group header member stack (G-29c)

`MessageThreadPane.groupHeader.test.ts` — 11 tests, **8 failing against the
pre-fix code**, verified by checking out HEAD's versions of both the pane and
the avatar primitive and re-running.

Measured on both sides for the value that mattered: the artboard's rim colour is
compared against `--fw-color-surface` read out of the token file, AND asserted to
differ from `--fw-color-canvas` — so the test states WHY the primitive's default
was wrong here rather than just asserting the new class. It also counts the
artboard's circles (two members plus one overflow chip) and compares that shape
against the `max` the component passes.

Three tests cover the primitive rather than the caller, because the change to
`AvatarGroup` is the part with blast radius: that the `ring` prop exists, that it
still defaults to `ring-canvas` so no existing caller moved, and that it reaches
BOTH the avatar rims and the overflow chip — missing either leaves one visibly
mismatched circle in the stack.

## G-49a — MessageThreadPane.measureCap.test.ts
6 tests, 2 failing against the pre-fix component (`carries NO responsive width
override on that column`, `caps by no percentage anywhere in the thread`),
verified by restoring the file from HEAD and re-running.

Measures both sides: the cap is parsed out of `audit/reference/Bubbles.dc.html`'s
`.bub` rule, the pane width out of `FairwayMessages.tsx`'s `max-w-[Npx]`, and the
arithmetic that makes the override a defect is computed from the two — so the
suite fails if either side moves. The class list is extracted from the one
element that carries the cap rather than searched for across the file, so a
`sm:max-w-` reintroduced anywhere on that column fails even if some other
element legitimately has one.

`bubbleWidth.test.ts`'s last assertion is re-anchored: it asserted the override
was present, which encoded G-50b's decision rather than its derivation. It now
asserts the absence and cites G-49 in the test body.

## G-49b — MessageThreadPane.bubbleDepth.test.ts
11 tests, 3 failing against the pre-fix component (`the incoming branch applies
that token`, `ships shadow-soft as the interim`, `applies a shadow on each
branch of the same conditional`), verified by restoring the file from HEAD and
re-running.

The byte-identity claim is MEASURED, not asserted: `.lit` is parsed out of
`audit/reference/Bubbles.dc.html` and `--fw-shadow-card` out of
`design-tokens.css`, both whitespace-normalised, then compared. The same
machinery proves the A03 request is real — `.lit-accent` is compared against
every `--fw-shadow-*` token in the file and must match none.

Reading the light-theme token specifically matters: the file redefines each
`--fw-shadow-*` under the dark theme further down, so the parser takes the first
declaration and the collector de-dupes by name in file order.

Two patterns caught by their own failures before landing: `\bshadow-card\b`
matches inside `--fw-shadow-card` (word boundary before a hyphen — the same
false positive as `text-body` vs `text-body-sm` in G-29a), and a blanket
"no raw box-shadow" regex flagged G-50a's legitimate two-token composition.

## G-20a — MessageComposer.didNotSend.test.tsx
7 tests, 5 failing against the pre-fix component, verified by restoring the file
from HEAD and re-running.

Behavioural, not source-read: what distinguishes fixed from broken is what the
component DOES with a `false` return, and both branches are reachable simply by
rendering it with a handler that resolves false. Three of the seven exist to pin
the correction itself — that a failed TEXT send raises no banner (the thread has
it) and releases the draft (so it is not on screen twice), and that the
mid-flight edit survives that release.

The G-21 suite is untouched and still passes: its refusal keeps its exact text
and its `role="alert"`, and a new test asserts it shows no Retry, since retrying
a missing handler only refuses again.

## G-20b — use-golf-messages.send-outcome.test.ts
12 tests, 7 failing against the pre-fix files, verified by restoring all three
from HEAD and re-running.

Two layers, two idioms. The classifier's logic runs DIRECTLY against real engine
wording — WKWebView's "Load failed" (the failure two Shenandoah players hit
mid-send on 2026-09-01/02), Chrome's "Failed to fetch", Gecko's, WebKit's
mid-request loss, a `net::ERR_` — plus the cases that must NOT be unknown: a
server refusal however worded, and an `AbortError`, which is our own timeout
firing rather than their connection dropping. Its PLACEMENT (which branch marks
which outcome) is asserted on the source, matching the sibling send-integrity
suites: reaching `sendMessage` behaviourally needs a full supabase + auth +
realtime harness.

One test exists to stop the regression rather than the defect: no catch may
hardcode an outcome, since assuming in a catch is exactly what collapsed the
taxonomy.

`use-golf-messages.failed-send.test.ts` (G-19) is re-anchored: it pinned
`markSendFailed(optimisticId)` exactly, freezing a signature it does not own.
Now argument-agnostic past the property it does own. Verified against
`fef04dbb9~1` (pre-G-19): all six still fail there.

## G-09a — MessageComposer.uploadProgress.test.tsx

10 tests, 9 failing pre-fix. Behavioural through the real component tree — the
composer, the real `AttachmentPreview`, and a fake send standing in for the
transport, held open so mid-flight state can be observed. It measures what the
user sees: the rendered percentage and the bar's inline `width`, not the state
that feeds them.

Covered: the callback is passed at all (the defect, exactly); a reported
percentage reaches the screen; the bar starts at zero when the TRANSFER starts
and not at staging; a re-announced lower chunk cannot move it backwards; an
overshooting transport is clamped; two staged files track independently (one
shared counter would show the same number twice); and a failed send returns the
tiles to staged instead of freezing the bar.

The parent's forwarding is asserted on a comment-stripped read of
`FairwayMessages.tsx` — it runs against a real conversation id, the attachments
hook and a toast provider, and what distinguishes fixed from broken is whether
the callback is forwarded at all. One assertion is a regression guard rather
than a defect test: the parent must hold no progress state of its own.

The one test that passes pre-fix asserts that absence, and is honest about it.

## G-61 — attachments.mimeType.test.ts

8 tests, 2 failing pre-fix. Both sides measured, which is what this finding
needs: the behavioural half drives `uploadAttachment` against a stubbed
Supabase client and reads the mime off the body actually handed to the SDK —
not off the option passed beside it, which is the whole point — while the
source half reads the vendored `@supabase/storage-js` and asserts the premise:
the Blob branch of `uploadOrUpdate` never mentions `contentType`, and only the
raw-body branch sets the header from it.

If a future SDK version starts honouring the option for a Blob, that second
half fails. That is the correct alarm rather than a brittle one: the fix stays
correct, but the reasoning written above it would no longer be.

The other assertions guard what is easy to lose while rewriting this call: the
file name (so the extension still matches the bytes), the byte count, the
metadata agreeing with what was stored, `cacheControl: '3600'`, and the
identity pass-through that avoids copying a 10MB photo in the common case.

## G-09b — attachments.uploadTransport.test.ts

15 tests, 12 failing pre-fix. Driven through a fake `XMLHttpRequest` and a
stubbed Supabase client, so every branch that chooses between the two paths is
exercised rather than read: signed PUT, signing failure, transport failure,
5xx, 4xx, and no `XMLHttpRequest` at all.

The progress assertions measure the transfer, not the call: 50/200 bytes must
surface as 25 and 150/200 as 75, and 10 and 90 must NOT appear — the two
numbers the old path could produce. A non-computable length must produce no
report at all, and a fully-sent body must not read 100 until the response
lands.

Header assertions pin what a rewrite of this call would silently drop:
`content-type` (G-61's property, now enforced on the request itself),
`cache-control: max-age=3600`, and `x-upsert: false`.

Two source assertions, on a comment-stripped read, guard the regression rather
than the defect: no `onProgress(10)`/`onProgress(90)`/"simulate progress" may
return, and every reported number must derive from `event.loaded /
event.total` behind an `event.lengthComputable` guard.

## G-24 — attachments.cancelUpload.test.ts + MessageComposer.cancelUpload.test.tsx

15 tests across two files, 12 failing pre-fix. Split the way the change is: the
transport suite drives a fake `XMLHttpRequest` and asserts the request is
aborted, that a cancel does not fall through to the transport that cannot be
cancelled, that an already-aborted signal never opens a request, that the
result does not wear the `Upload failed:` wording every real fault carries, and
that the abort listener is gone after a normal completion — a later `abort()`
from a composer cleaning up must touch nothing.

The composer suite drives the real component tree with a fake send that hands
back the signal it was given. It asserts the label changes ("Remove range.jpg"
staged, "Cancel upload of range.jpg" mid-transfer — a screen-reader user has no
progress bar to infer that from), that the signal is actually aborted, that no
alert appears, that the draft survives, and that the files the user did NOT
cancel come back staged rather than stuck mid-bar.

Two of the eight are regression guards rather than defect tests: removing a
file BEFORE a send must abort nothing, and a genuine failure must still raise
the banner — including on the send immediately after a cancelled one, which is
what proves the suppression flag is per-send and not sticky.

Pre-fix, four transport tests fail by timing out rather than asserting: without
a signal the upload never settles. That is a real failure, not a hang.

## G-22 — MessageComposer.fiveLines.test.tsx

10 tests, 7 failing pre-fix. Both sides measured: the cap the component writes
is compared against the line-height parsed out of `tailwind.config.ts`'s
`'body'` entry and the padding parsed out of the component's own class list, so
the suite fails if the type scale moves, if `py-2` moves, or if the computation
stops tracking either.

jsdom applies no Tailwind, so the type the class list would produce is injected
as longhand CSS — jsdom resolves those reliably where shorthands can surprise.
That also makes the large-text case directly testable: at a 36px line-height
the cap must be five of THOSE, which is the failure mode §9.4 names.

Three assertions are regression guards rather than defect tests, and two of
them pass pre-fix for an accidental reason worth writing down: with the old
inline `maxHeight: '120px'` the value is a finite constant, so the "NaN cannot
poison the max" and "content-box adds no padding" checks read as satisfied.
They guard the new computation, not the old constant, and are honest about it.

## 2026-09-07 — G-47 MessageComposer.geometry.test.tsx

18 tests, 11 failing pre-fix. Four of them measure BOTH SOURCE FILES rather
than the component: the artboard's `.slab` declarations parsed out of
`Composer.dc.html` against the `--fw-*` values parsed out of
`design-tokens.css`. Those four pass before and after by design — they are the
EVIDENCE for the finding (the artboard was drawn from these tokens), and they
fail the moment either file moves, which is the only way to notice that the
dock has stopped being a token application.

Token lookup takes the FIRST occurrence in file order, because every name
repeats in the dark block — the same de-duping the G-49b bubble-depth suite
needed.

One assertion passes pre-fix for an accidental reason, recorded rather than
hidden: "bottom-aligns once the field has grown" is satisfied by the old
hardcoded `items-end`. Its partner, "centres its controls at rest", is the one
that fails, and the pair together is what pins the behaviour.

The footer assertion is scoped to the FORM's own class list, not the whole
file: `bg-surface-sunken` is still correct further down on the send button's
disabled fill, and a whole-file ban would have outlawed a token that has
nothing to do with this finding.

### G-47 — a neighbouring test re-anchored, not weakened

`keyboard-inset.test.ts`'s composer assertion pinned `[.keyboard-open_&]:pb-4`
byte-for-byte. That is a pixel step it does not own: G-47 moved the composer's
gutter from `pb-4` to `pb-3` to match the artboard's dock, and a test about the
iOS keyboard failed over a change that had nothing to do with the keyboard.

Re-anchored on the property it DOES own — the keyboard-open override replaces
the resting pad with a plain one, dropping the `env(safe-area-inset-bottom)`
term, because the keyboard already covers the home indicator and paying for it
twice is the "I can't see what I'm typing" bug (Shenandoah, 2026-09-01/02). It
now also asserts the resting pad still CARRIES that term, so the override is a
real drop rather than two classes that happen to agree.

Proven stronger, not weaker, against both defect shapes: with the override
deleted it fails, and with the override present but still paying the safe-area
term it also fails. The original assertion caught only the first.

## 2026-09-07 — G-45 MessageComposer.focusRing.test.tsx

10 tests, 5 failing pre-fix. Four of the five that pass before and after are
deliberate: they prove the CONFLICT rather than the fix. The artboard's
`.track-on` glow is parsed out of `Composer.dc.html` and compared against
`--fw-color-accent-500` parsed out of `design-tokens.css` (on the oklch
coordinates, since the artboard writes the alpha inside the parens); the focus
token is asserted to be accent-600 in light and accent-500 in dark; and the
frozen D-05 wording is asserted in `audit/DECISIONS.md`. If any of those move,
the premise under this fix is re-checked automatically instead of silently
outliving its reason.

Token lookup reads ALL occurrences and indexes by file order — first is light,
last is dark — because the theme split is the whole point here, not an
inconvenience to de-duplicate away.

The five that fail pre-fix cover what the component draws: no `accent-500`
literal in any focus utility, both layers resolving from
`var(--fw-color-border-focus)`, the artboard's 1px/30% + 4px/10% geometry, the
`color-mix(in oklab, …)` form the Tailwind bridge emits, and the removal of the
flat `ring-2`.
