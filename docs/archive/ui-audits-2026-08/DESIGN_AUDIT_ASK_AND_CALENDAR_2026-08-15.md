# Design audit — CoachHelm **Ask** and **Calendar**

2026-08-15 · coach persona · prod `helmv3-c9cor8par` (main @ `a5d03ddd8`, deployed
23:46 EDT — this build contains #1448, so the calendar notes below are current).

Scope: the AI chat (entry screen + answer rendering) and the calendar, judged
against "handcrafted and architectural", not "competent". Findings are ordered by
how much they cost the product. Nothing here is filed for the sake of filing —
where the app is already right, it says so.

---

## 0. The bug behind "you can only reach chat from the green button"

Confirmed in code, not inferred. `surface-registry.ts` — the single source of
truth — declares Ask as a **live, visible** CoachHelm tab:

```ts
{ id: 'ask', canonicalName: 'Ask', href: '/golf/dashboard/coachhelm/chat',
  role: 'coach', group: 'coachhelm-tab' },        // ← no `hidden: true`
```

The three tabs that *were* deliberately retired by the Spine & Stage collapse all
carry `legacy: true, hidden: true` — `signals`, `players-tab`, `effectiveness`.
**`ask` does not.** But `CoachHelmSubNav.tsx`'s `COACH_TABS` contains exactly one
entry, `brief`. So Ask was swept up in a collapse it was never marked for.

Two symptoms fall out of that one line:
- the only route into the flagship AI surface is the floating green FAB;
- the breadcrumb still reads `Dashboard / CoachHelm AI / **Ask**`, because the
  breadcrumb reads the registry and the tab strip doesn't — the app advertises a
  tab it declines to draw.

**Fix:** add the `ask` `TabDef` to `COACH_TABS` (label from `surfaceName('ask')`,
href `/golf/dashboard/coachhelm/chat`). The strip becomes `Brief · Ask`, which is
also what the registry has claimed all along. This is a two-line change, and it
is the highest value-per-line item in this document.

**Related:** the chat FAB renders *on the chat page itself* — a floating "open
chat" button on the screen it opens. It should hide on `/coachhelm/chat`.

---

## 1. The pre-ask screen — the real problem

**What it is today:** a centred search box on an empty page. A heading asks *"What
do you want to know about Demo University Golf?"*, two generic chips sit beneath
it, and below that a faded `WHERE YOUR PROGRAM STANDS` panel — which, on load,
renders at partial opacity with rows missing and roughly 220px of blank gap
before a stray footer (*"All 7 players have recorded rounds · 2 more in
Intelligence"*) floating below nothing. Roughly half the screen is empty cream,
and the content column uses about half the available width while the Brief —
same shell, one click away — runs a five-across grid edge to edge.

**Why it reads as cheap** is not the emptiness itself. It is that the screen
**asks the coach to do the work of knowing what to ask.** A blank prompt is only
inviting when the user already has a question. A coach opening this at 6am does
not; they want to be told what changed. And one of the two chips offered —
*"Brief me on Demo University Golf"* — duplicates the Brief page sitting one item
up the sidebar. The entry screen is simultaneously empty and redundant.

That is also why decorating it would fail. Gradient blobs behind a blank box
still leave a blank box.

### Direction

**1.1 — Open with a fact, not a question.** The system already knows, and already
computes, this sentence: *"Putting is where the team is losing the most strokes,
and it's not close — all seven players are in the red, about −3.0 strokes per
round."* Set that large, as the first thing on the screen, with the composer
beneath it. The screen stops being blank because it is carrying the single most
useful thing the product knows about this team today. The question prompt becomes
the *second* element, where it belongs.

**1.2 — Make the suggestions data-bound, and make them a capability tour.**
Replace two generic chips with three short columns of prompts drawn from live
values, so the coach learns the tool's range by reading its examples:

| Diagnose | Decide | Compare |
|---|---|---|
| Why is Owen Carter −3.83 on approach? | Who should travel to Tri-State? | Cole Bennett vs. the team on putting |
| What changed since the last tournament? | Is anyone ready to move up the lineup? | This season vs. last on scoring |

Every one of those is answerable from data already on the page. Generic chips
teach nothing; these teach the surface's shape *and* fill the stage with
substance rather than ornament.

**1.3 — Use the width, and use it to build trust.** Give the entry screen a
two-column architecture: composer and prompts on the left, and on the right a
compact **"What I can see"** ledger — *18 rounds · 7 players · 12 events · signals
current to today*. The answer screen already prints exactly this provenance
(*"✓ Read 18 rounds across 7 players · 15.4s"*), and it is the best detail in the
whole feature. Promoting it to the entry screen sets honest expectations before
the first question, and it is architectural content, not filler.

**1.4 — One motion, and give it a job.** The place for movement is the transition
from *asking* to *answering*: the composer rises from centre and docks; the
prompt grid dissolves; the provenance line writes itself in as the read actually
happens. A single `layoutId` on the composer does this — `framer-motion` is
already a dependency and already drives the sub-nav underline, and that component
already honours `prefers-reduced-motion`, so the pattern is established. One
choreographed move that reports real state will read as craft. Ambient looping
blobs will read as a template, which is the exact failure mode to avoid here.

---

## 2. The answer rendering

**2.1 — The conclusion is buried under its own evidence.** Asked *"where is the
team losing the most strokes?"*, the reply renders **five** strokes-gained tables
— Around the Green, Off the Tee, Putting, Approach, Total, 35 rows — and only
*then*, after ~1400px of scrolling, the sentence that answers the question. The
evidence is excellent and the sentence is excellent; the order is backwards. Lead
with the prose answer, then the numbers, ideally behind *"Show the numbers (5
tables)"*. A coach should be able to close the screen after one line.

**2.2 — `n=11` is unexplained notation, and the sign convention is unreadable.**
`n=11` means *sample size — the rounds behind that figure*. Write `11 rounds`.

More seriously: **the founder, a golf person, read the negative values as good**
("wouldn't − strokes gained be good? it's golf?"). He is inverted — strokes
gained already flips the sign, so positive beats the baseline and `−3.92` means
Cole Bennett bleeds 3.92 strokes per round with the putter — but *that he had to
ask is the whole finding*. The table prints a bare signed number with no
baseline, no unit, no direction cue, no colour. If the person who commissioned
the feature cannot tell which way is good at a glance, no coach can.

The Brief, one click away, solves this already: `↗ Improving` / `↘ Declining`
chips, green vs amber, labelled units (`64% FW`, `33.0 PPR`, `1 of 7 need work`).
The chat is the surface that most needs plain language and is the one being
tersest. Minimum fix: signed colour, an explicit `strokes/round vs <baseline>`
unit, and `11 rounds` instead of `n=11`.

---

## 2A. "Load the AI with real golf intelligence" — it already is; it just
## doesn't reach this screen

Worth stating plainly, because it changes the size of the job. The golf domain
model in this codebase is genuinely strong:

- `src/lib/golf/strokes-gained.ts` implements the **Broadie *Every Shot Counts* /
  PGA Tour ShotLink expected-strokes-to-hole benchmark (2004–2012)** — the
  canonical academic source — against a **scratch-golfer baseline**, split into
  the four standard categories.
- `src/lib/golf/sg-benchmarks.ts` exposes `getBenchmarkData(level)` with a
  `BenchmarkLevel` type — so more than one comparison level already exists.
- `src/app/golf/actions/stats-leak-maps.ts` carries per-band **tour reference
  values** (`pga_tour_value`), is **gender-correct** (women's teams get LPGA rows
  with PGA fallback; men's get PGA), nulls out bands with no tour standard (0–3ft
  putts), and handles the feet-vs-yards unit trap explicitly.

That is more golf rigour than most shipped golf software. And it surfaces
elsewhere — the What's New card reads *"you're making 6% of putts from 15–25 ft
(103 attempts) (PGA Tour ~15%)"*, which is exactly the right shape: **value,
sample, benchmark.**

The Ask tables render none of it. They print `−3.92  n=18` where the same data
supports `−3.92 strokes/round vs scratch · 18 rounds · college avg −1.8`.

So the work is **not** "build golf intelligence" — it is **plumb the benchmark
that already exists into the chat renderer**, and pick the right
`BenchmarkLevel`. Note that *scratch* is the wrong peer for a college roster:
every player reading `−3.0` against a scratch baseline looks broken, when the
question a coach actually has is "bad *for a D1 golfer*?". Choosing the college
benchmark level would change the emotional read of the entire surface without a
single new number being computed.

**2.3 — Five tables, no hierarchy.** Putting *is* the answer and is styled
identically to Around the Green, which is the one dimension the team is fine at.
The dimension that carries the answer should dominate — full width, larger
numerals, the negative values doing visible work — and the other four should
demote to a compact strip. Right now the design has no opinion about which table
matters, which is the "AI slop" quality: everything rendered at equal weight
because the renderer never decided.

**2.4 — Staleness is inconsistent and hidden.** The five tables read *computed 25
days ago*, *23 days ago*, and *12 days ago*, in ~10px grey, while the prose calls
the windows "recent". If a third of the evidence behind a recommendation is 25
days old, that belongs in the answer sentence, not a footnote. This is a
trust-surface, and the product is otherwise unusually honest (see §4).

**2.5 — There is no conversation.** The question renders as a small grey pill at
top right; the answer is unbounded content on the page background. No turn
separation, no attribution, no rule between exchanges. It reads as a report that
materialised, not a dialogue — which is a large part of why the screen feels
unfinished. Give turns real structure and the width problem in §1.3 partly
solves itself.

---

## 3. Calendar

Current build, so these are live observations.

**Fixed since run 1** — the calendar no longer loads pre-scrolled with its
toolbar clipped (run 1, P1 #11). The header card, week strip, and view switcher
all paint intact.

**3.1 — The player filter is still unlabelled initials** (run 1, P1 #12, not
fixed): `ALL · C · NR · CB · OC · EP · MR · JH · DB · TH` with no names, no
tooltips, no legend — and `NR` is the coach, sitting inside a player filter. Nine
two-letter tokens is a memory test. Avatars with names on hover, or a labelled
dropdown, and the coach removed.

**3.2 — A stray green dot floats outside the `Agenda` pill**, unattached to any
control — it reads as a rendering artefact rather than a badge.

**3.3 — `Show 9 earlier events` is a full-width bar of plain text** with no
button affordance — the same pattern as `Show 4 more`, `Open team intelligence`,
`View active` (run 1, P1 #8). This one is the most prominent instance in the app:
it spans the entire content column and still looks like a caption.

**3.4 — The create-event form is a generic form, and it is the wrong shape for
the job.** Everything in it works; nothing in it is *coaching*. Specifically:

- The primary **`Create event` is enabled with an empty required name**
  (`nameRequired: true`, `disabled: false`, `cursor: pointer`) — so the form
  either submits a nameless event or fails on click. Settings gets this right
  (its primary stays `disabled` until dirty); the calendar contradicts it.
- **`Coach (.`** appears in the invite grid — a truncated, mangled string, and
  the coach should not be invitable to their own practice at all. The count says
  `0 of 8` because it counts them.
- The same eight people are rendered **three different ways** across the
  product: `Cole Bennett` (agenda/roster), `Cole B.` (invite grid, in a 155px
  chip with room for the full name), `CB` (calendar filter).
- **Four different section treatments in one form**: label-above-input
  (Location, Notes), tinted panel with no header (Require RSVP), header with a
  right-aligned count (Invite players), tinted panel with an inner header
  (Repeat). There is no rule for what earns a tint, so the form has no rhythm —
  which is precisely the "boring subscreen" feeling.
- It is a **540px single column that scrolls** on a 1372×888 desktop. Repeat and
  half the roster are below the fold of a modal.

### 3.5 — What it should be: schedule *against* the roster, not into a void

The genuinely creative move here is available today, and it needs **no new data
collection**. `golf_player_classes` already stores `player_id · days[] ·
start_time · end_time · semester` — a per-player recurring busy calendar — and
`golf_events` holds team commitments (class meetings included, typed
`event_type 'class'` and tagged `[class:<id>]`). Together that is a full
roster-availability model the scheduler currently ignores.

**Turn the time fields into a conflict-aware picker.** Today the coach guesses
9:00 AM and finds out later that four players have Organic Chem. Instead:

> **Tue 15th · 9:00 AM → 11:00 AM**
> ⚠ 3 conflicts — Ethan P. (class until 9:50), Owen C. (class), Mason R. (class)
> **Free for all 8:** Tue 2:00 PM · Wed 3:30 PM · Thu 2:00 PM

Three concrete pieces, in increasing order of ambition:

1. **Live conflict count under the time row.** The span line already renders
   there (`Sat, Aug 15 · 9:00 AM → 11:00 AM · 2 hr · EDT`) — extend that one
   line with the conflicts for the currently-invited set. Cheapest possible
   version, and it converts the form's best existing detail into a decision
   tool.
2. **"Find a time" suggestions.** Three ranked windows in the next 7 days where
   the invited roster is free, as pressable chips that set the date and time.
   This is a scan over class rows and events — ordinary query work.
3. **Per-player conflict marks in the invite grid.** A player who is in class at
   the chosen time renders with a muted conflict marker rather than looking
   identical to everyone else, so "select all" stops being a trap.

**And make the layout carry the meaning.** Two columns on ≥`md`: *when + where*
on the left, *who + repeat* on the right, with the conflict readout spanning the
seam between them — because the whole point is that time and roster are one
decision, not two stacked sections. That also gets the form onto one screen.

None of this is decoration; it is the difference between a form that records a
decision and a tool that helps make it — and it is the single highest-leverage
creative move available in the calendar.

**Genuinely good — do not regress:** the header card is the strongest page header
in the product — eyebrow, month, *"3 upcoming · 12 in view"*, prev/Today/next and
a real primary CTA in one calm row. The agenda rows (time block, title, type
chip, location) are clean and scannable. This is the architectural quality the
rest of the app should be measured against.

---

## 4. What is already excellent — protect it

Being critical is only useful if it is calibrated, so: three things here are
better than most shipped SaaS.

- **The provenance line.** *"✓ Read 18 rounds across 7 players · 15.4s"* — the
  feature tells you what it read and how long it took, unprompted. Almost nobody
  does this. Promote it (§1.3), never remove it.
- **The prose answer itself.** *"Putting is where the team is losing the most
  strokes, and it's not close"* — specific, quantified, committed to a view. The
  writing is not the problem; its position on the page is.
- **The honest empty states.** *"Completed: no rounds were recorded — 7 players
  entered, but no rounds were posted before this qualifier closed"* says what
  happened *and* why. Classes' lock screen explains the reasoning and exits
  somewhere useful. That voice is the product's real differentiator.

---

## Priority

1. Add `ask` to `COACH_TABS` — §0. Two lines; unblocks the whole feature.
2. Invert answer/evidence order; make the sign legible and pipe the existing
   tour benchmark into the chat tables — §2.1, §2.2, §2A. Cheap, high impact,
   and no new golf maths required.
3. Rebuild the pre-ask screen around a live fact + data-bound prompts + corpus
   ledger — §1.1–1.3. The substantive design work.
4. One choreographed entry→answer motion — §1.4. Do this *after* 3, not instead.
5. Calendar filter labels and the `Show N` affordance — §3.1, §3.3.
