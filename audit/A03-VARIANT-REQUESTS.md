# A03 — variant requests from the messages artboards (G-32)

Every value here was measured out of `audit/reference/*.dc.html` and compared
against `src/styles/design-tokens.css`, not read off a lane summary. §19.3 is
the reason this file exists rather than a patch: *messaging proposes changes to
shared primitives and tests consumers; it does not fork them.* Nobody hardcodes
an `oklch()` literal from an artboard into a messaging component.

## What G-32 got right, and what it undercounted

G-32's finding is that the token file already holds nearly everything the
design needs — the gap is application, not vocabulary. Measuring both sides
confirms it, and sharpens two counts.

**Applied in this PR** (existing tokens, previously unused on this page):

| Artboard value | Token | Where |
|---|---|---|
| `inset 0 1px 0 oklch(1 0 0 / 0.55), 0 1px 2px …/0.05, 0 4px 10px …/0.06` | `--fw-shadow-card`, byte-identical | unread conversation row — **measurement kept, application WITHDRAWN**, see below |
| `border-radius: 0.875rem` | `--fw-radius-md` → `rounded-fw-md` | conversation rows — **withdrawn with it**; the rows carry no radius now |
| `border-radius: 0.625rem` | `--fw-radius-sm` → `rounded-fw-sm` | search well — already correct |
| the page wash | `--fw-gradient-canvas` → `bg-canvas-gradient` | 4 page-shell sites (M03A F11) |
| `1.25rem` bubble corner | `--fw-radius-card` → `rounded-card` | thread bubbles (G-48) |

A trap worth recording: **`shadow-card` is not `--fw-shadow-card`.** That
utility name resolves to a legacy cool-grey value in `tailwind.config.ts`
(`0 1px 3px rgba(0,0,0,0.04), …`). The Fairway token has no utility at all, so
the repo's idiom is the arbitrary-property escape
`[box-shadow:var(--fw-shadow-card)]`, used at roughly eight sites. Bridging it
as `shadow-fw-card` would be a reasonable A03 request in its own right.

## WITHDRAWN — the unread conversation row no longer has a card face

The conversation row's card is gone, so the two requests attached to it are
withdrawn: the unread row's `--fw-shadow-card` application, its
`rounded-fw-md`, and the conversation-row share of unmapped value #1. The rows
are a `divide-y divide-border-subtle` list now — uniform padding, no radius, no
per-row shadow, unread carried by a `bg-surface` fill plus weight and badge.

The reason is measured, not aesthetic, and it is recorded in full in
`memory/ledgers/changes/team_communications.md` (2026-09-07). In short: the
artboard is a specimen that never stacks two flat rows, so it cannot show that
a card on unread rows only makes the list's PERCEIVED rhythm uniform when the
unread rows happen to alternate with read ones. With six real conversations at
390×844 the box gap was a constant 6px while the eye read 6px between two
carded rows and 30px between two flat ones, on rows that were themselves 80px
against 72px. `DECISIONS.md` G-50b governs — take the rule, not the specimens.

What is NOT withdrawn is the measurement in the table above. The artboard's
unread-row shadow really is byte-identical to `--fw-shadow-card`, and that
remains the reason `shadow-card` (a legacy cool-grey, no relation) must never
be substituted for the token anywhere on this surface. The `shadow-fw-card`
bridging request stands on its own and is unaffected.

## The unmapped values: five at W3, eight after W4

The manifest counts six because two lanes reported the same value
independently. `.send-on` in `Composer.dc.html:26` and the pinned-rail pill in
`Main.dc.html:49` carry the identical declaration —
`linear-gradient(165deg, oklch(0.567 0.142 149.6) 0%, oklch(0.526 0.128 149.8) 100%)`
— so M03A's "solid green gradient's second stop" and M03C's "send-on gradient's
second stop" are one request, not two.

| # | Value | Nearest existing token | Why it cannot be mapped | Seen |
|---|---|---|---|---|
| 1 | `linear-gradient(180deg, oklch(0.989 0.013 87) 0%, oklch(0.980 0.017 86) 100%)` | `--fw-color-surface` (`oklch(0.984 0.016 86)`) sits *between* the two stops | a flat colour cannot express a two-stop face | 7 places — 5 in `Main`, 2 in `Composer` (the manifest says four; measured, it is seven). **PARTLY WITHDRAWN**: the 3 conversation-row occurrences no longer have a surface to land on, see below. The composer's 2 and the remaining `Main` uses still want it |
| 8 | `.lit-accent`'s hued ambient `0 8px 20px oklch(0.488 0.124 150 / 0.22)` | no `--fw-shadow-*` token is hued; every one is a neutral warm grey at 0.05–0.16 | the SHADOW ramp has no hue — but the COLOUR ramp does: this green is `--fw-color-accent-700` EXACTLY (`design-tokens.css:99`, and `:96`'s accent-750 is the same value), so the variant can be minted off the existing ramp rather than a new colour. Still open; the own bubble ships neutral `--fw-shadow-raise` as the interim, because a hand-typed colour in the component would drift silently from the palette | own message bubbles |
| 2 | `oklch(0.526 0.128 149.8)` — the green gradient's second stop | `--fw-color-accent-650` = `oklch(0.540 0.132 149.7)`; near, not equal | first stop IS `--fw-color-accent-600` exactly, so only the second needs a name | composer send button + pinned-rail pill |
| 3 | `oklch(0.505 0.19 27)` — failure-banner red | between `--fw-color-danger` (`0.586 0.222 27`) and `--fw-color-danger-ink` (`0.44 0.16 25`) | genuinely a third step on that ramp | composer failure state |
| 4 | `0.375rem` (6px) — bubble tail | below `--fw-radius-sm` (10px) | the fw ramp has no step under 10px | every bubble tail |
| 5 | `0.75rem` (12px) — grouped inner corner | below `--fw-radius-sm` (10px) | same | grouped bubbles |

**One value thought unmapped that is not.** The composer's upload progress bar
uses `linear-gradient(90deg, oklch(0.567 0.142 149.6), oklch(0.648 0.149 149.6))`
— both stops are exact token matches (`--fw-color-accent-600` →
`--fw-color-accent-500`). It needs no request.

## A sixth request, added in W4 (G-29)

| # | Value | Nearest existing token | Why it cannot be mapped | Seen |
|---|---|---|---|---|
| 6 | `line-height: 22px` on 15px message text | `--text-body` carries `24px` in its own tuple | the size matches exactly and the leading does not; a 2px delta **per line** compounds down a multi-line bubble, unlike a 1px specular rim | the `.bub` class rule in `Bubbles.dc.html:17` and `Thread.dc.html:16` — a rule, not a specimen |

Deliberately a request rather than an absorption, and the distinction is the
point of this document. The G-50a alpha delta was absorbed because
`rgb(…/0.6)` against `/0.5` on a 1px rim over glass is invisible once
rendered. This one is not the same shape: 22px against 24px is 2px on every
line, so a six-line message is 12px taller than the artboard draws it. That is
a design value, not render noise.

Until the variant exists the token's 24px ships. The alternative — writing
`leading-[22px]` next to `text-body` — would be a magic number stacked on a
token that already specifies its own leading, which is how a type scale stops
meaning anything.

## A seventh, from the photo specimen (G-29b)

| # | Value | Nearest existing token | Why it cannot be mapped | Seen |
|---|---|---|---|---|
| 7 | `border-radius: 1rem 1rem 0.5rem 0.25rem` on the image inside a photo bubble | `--fw-radius-md` (14px) is the closest single step to the 16px top corners | it is not one radius, it is an asymmetric per-corner echo of the bubble's own tail, and 8px and 4px are both below `--fw-radius-sm` (10px) — the same floor that already blocks A03 entries 4 and 5 | `Bubbles.dc.html:78` |

`rounded-fw-md` ships in the meantime, and it is a defensible interim rather
than a wrong one: with the bubble now a 4px frame around a 20px `rounded-card`
outer, a 14px inner radius reads as concentric.

**The artboard shows ONE state.** The specimen is an incoming bubble with a
bottom-left tail. The component's radius matrix has four
(`isFirstInGroup` x `isLastInGroup` x `isOwn`), and a grouped middle photo has
no tail at all. The other three are not invented here; whoever grants this
request needs to say what the echo does when there is nothing to echo.

## Absorbed in G-29b, not requested

Three deltas taken rather than requested, all on the 4px spacing scale and all
1px:

- frame `5px` → `p-1` (4px). One pixel on a photo frame.
- caption inset `8px 11px 0 11px` → `px-2.5 pt-2` (10px/8px). The vertical is
  exact; the horizontal is 1px.
- caption type `14px/20px` → `text-body-sm` is `13px/20px`. **Not taken** — see
  below.

The caption type is the one that did NOT get absorbed. `text-body-sm` matches
the artboard's line-height exactly and its size by 1px, which by the rule above
would be noise. But the caption currently renders at `text-body` (15px) along
with every other message body, and splitting a photo caption into its own type
role is a design decision, not a measurement. Recorded here as an open question
for A03 rather than settled by an implementer: **is a photo caption a distinct
type role from a message body, or the same one?** The artboard says 14 vs 15;
that 1px is either a deliberate role or a hand-tune, and only the design owner
knows which.

## An eighth, from the bubble depth system (G-49b)

| # | Value | Nearest existing token | Why it cannot be mapped | Seen |
|---|---|---|---|---|
| 8 | `.lit-accent` — `inset 0 1px 0 oklch(1 0 0 / 0.14), 0 1px 2px oklch(0.18 0.01 60 / 0.07), 0 8px 20px oklch(0.488 0.124 150 / 0.22)` | none. Compared against every `--fw-shadow-*` in `design-tokens.css` and matched by none, which the suite asserts rather than my claiming it | the ambient layer is **hued** — a green cast under a green bubble. Every fw shadow token is a neutral warm grey (`oklch(0.18 0.01 60)` at 0.05-0.16). A hued shadow is not a step on that ramp; it is a different kind of value | `Bubbles.dc.html:19`, on every outgoing bubble |

**The incoming half needed no request at all, and that is the finding.**
`Bubbles.dc.html:18`'s `.lit` is byte-identical to `--fw-shadow-card` — inset
`0 1px 0 oklch(1 0 0 / 0.55)`, then `0 1px 2px /0.05` and `0 4px 10px /0.06`.
Exactly the same free win G-32 found on the rail's unread rows, which is why
the manifest calls F14 and G-03 "one systemic issue across two lanes, not two".
The test parses both declarations and compares them, so if either side ever
moves the token stops being the answer and the suite says so.

**Why `--fw-shadow-card` cannot simply be reused on the outgoing bubble.** Its
inset is a `0.55`-alpha white top edge, designed for a light matte cream card.
The artboard dims the same edge to `0.14` on the green bubble because the
surface underneath is dark. Painting the card inset there would be a bright
specular rim on a dark green fill — a visible defect, not the 1-2px class of
delta this document absorbs elsewhere.

`shadow-soft` ships until the variant exists: it is a real Tailwind bridge to
`--fw-shadow-soft`, it carries the same two-layer ambient structure, and it has
no inset at all — so it is quiet where the artboard is quiet rather than wrong
where the artboard is dim.

**One state deliberately left alone.** `Bubbles.dc.html:132` draws the
failed-send bubble as `.bub green` WITHOUT `.lit-accent` — the ambient comes off
when a message did not send, replaced by a danger ring. The component reaches
approximately the same place from the other direction: G-19's `opacity-60`
fades the shadow along with the fill. Whether the artboard's explicit removal
should be reproduced exactly belongs to whoever revisits the failed-send
treatment; it is not a variant request.

## The specimen widths, deliberately not reproduced

`Bubbles.dc.html:77` caps the photo bubble at `250px` and the shipped code
capped the image at `260px` and the file chip at `260px`. All three are gone.
G-50b settled that the column takes the stated 288px RULE and not a scene
specimen, and a 260px cap inside a 288px column never bound anyway — a dead
number that looked like a constraint. The file bubble at `Bubbles.dc.html:88`
is drawn at the same 288px the `.bub` rule states, which is the column's cap
already.

## Absorbed in G-29c: the member stack's geometry

`Group.dc.html:28-30` draws the header stack as three 34px circles at
`margin-left: -12px`. `AvatarGroup size="sm"` gives 32px at `-space-x-2` (8px).
Both deltas are taken rather than requested, and the reasoning differs:

- **34px → 32px.** 2px on an avatar, consistent with every other 1-2px
  absorption in this audit.
- **-12px → -8px.** 4px, and the larger of the two. Taken anyway because the
  overlap is a property of the shared `AvatarGroup` primitive's `ringPad` scale,
  not of messaging: changing it would restack every avatar group in the app, and
  a messaging-only overlap would be a fork of a primitive to gain 4px. If a
  future variant request is granted it belongs on `ringPad`, not here.

**What did NOT get absorbed** is the rim colour, and it is the reason this entry
exists at all. The artboard's rim is `2px solid oklch(0.984 0.016 86)` —
`--fw-color-surface`, byte-identical — because the rim reads as a *cutout in
whatever the stack sits on*. `AvatarGroup` hardcoded `ring-canvas`, and this
header sits on the InstrumentPanel's surface. That is not a variant request; it
is a primitive missing a knob, so the primitive gained one (`ring`, defaulting
to `ring-canvas`, every existing caller unchanged).

## Two more that belong to A03 rather than to messaging

- **Avatar fallback.** The artboard's person avatar is
  `background: oklch(0.939 0.045 150)` / `color: oklch(0.488 0.124 150)` —
  byte-identical to `--fw-color-accent-100` and `--fw-color-accent-700`. Both
  tokens exist, so this is a pure application question, but the fallback lives
  on the shared `src/components/fairway/controls/avatar.tsx` primitive
  (`bg-surface-sunken text-text-secondary`), and changing it there repaints
  every avatar in the app. A messaging variant is the ask.
- **Pinned-rail colours.** Measured and mapped above, but there is no pinned
  rail in the code to apply them to: G-01 (pinned conversations) is deferred,
  needing both a migration and the D-03 product call. Recorded so the values do
  not have to be re-measured when G-01 lands.

## Absorbed rather than requested (G-50a)

The day chip's inset specular is `rgb(255 248 233 / 0.6)`. `--fw-glass-border`
is `rgb(255 248 233 / 0.5)` — the same channels, one tenth of alpha apart on a
1px rim over glass. That is below the threshold at which the difference is a
design value rather than render noise, and it is the same call this audit made
for the 4px width spread. **The token is used; the 0.6 literal is not
requested and is not hardcoded.** Recorded here so the choice is findable
rather than invisible, which is the whole point of this document.

Everything else in the chip mapped exactly: `--fw-glass-bg` is byte-identical
to the artboard's `.glass` background, `--fw-blur-glass` to its `22px`,
`--fw-glass-saturate` to its `190%`, `--fw-shadow-pop` to the two layers under
the specular, and `--fw-color-text-secondary` to its ink. Four tokens that
existed and had never been used in messaging.

## Not requested

The presence dot in `Main.dc.html` (`oklch(0.648 0.149 149.6)` on a
`--fw-color-surface` ring — both exact matches) is deliberately NOT requested.
D-03a says member rows carry no presence dot, and G-51 is a standing referral
to remove the dead roster one. Mapping a value the design has decided against
would be tidy and wrong.
