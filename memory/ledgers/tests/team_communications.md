# Test ledger — team_communications

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
