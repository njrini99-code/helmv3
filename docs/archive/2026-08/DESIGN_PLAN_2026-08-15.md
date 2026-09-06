# Design plan — Ask, and the benchmark behind the numbers

Companion to `DESIGN_AUDIT_ASK_AND_CALENDAR_2026-08-15.md`. The audit said what
is wrong. This says what to build, in what order, and — where I checked the code
and found the obvious move blocked — what the constraint actually is.

Everything here is grounded in files read on 2026-08-15, with anchors. Two of my
own earlier claims are corrected below; they are marked.

---

## A. The Ask entry screen (audit §1.3)

### A0. The constraint I have to design around

`chat/page.tsx:96-99` passes **only** `generalOpeners` into `suggestions`, with
this comment:

> Only the GENERIC openers as pills. Each finding carries its own ask on its own
> row, so `suggestionsFromPulse` — which mixes both — would print half of them
> twice, once stripped of the evidence that makes them worth asking.

That comment is correct and it kills the obvious version of "replace the two
generic chips with data-bound prompts". Any prompt derived from `item.ask`
duplicates a row that is already on screen, and duplicates it *worse* — the row
carries its evidence, the chip would not.

**So the rule for this work:** new prompts must come from a source the pulse
does not already render. Concretely:

| Column | Source | Overlaps the pulse? |
|---|---|---|
| **Diagnose** | `item.ask` | **Yes — do not build.** The lead finding already is the diagnosis. |
| **Compare** | `ctx.roster` (`page.tsx:114`) | No. The pulse never emits a two-player comparison. |
| **Decide** | `golf_events` next-14-days, already fetched at `program-pulse.ts:116-127` | Only if an event is *also* a pulse item. Gate on `items.some(i => i.id === eventId)`. |

That is two columns, not three. A third column exists only if we add a source —
and inventing one to fill a grid is the "picking stuff to pick stuff" the user
explicitly warned against. Ship two.

### A1. Lead with the fact, not the prompt

Currently the page reads, top to bottom:

```
What do you want to know about Demo University Golf?   ← h2, AskSurface.tsx:224
Answers come from your recorded rounds, signals and schedule.
[ composer ]
WHERE YOUR PROGRAM STANDS                              ← eyebrow, ProgramOpening.tsx:114
● Putting is where the team is losing the most strokes ← LeadFinding, h3/h2
```

The largest, first thing on the page is a question the coach is being asked. The
thing the system actually *found* is below the fold of attention, in an eyebrow-
labelled section. That ordering is backwards for a product whose whole claim is
"it noticed something".

**Change:** swap the two. `LeadFinding` becomes the masthead; the greeting
demotes to the composer's supporting line or disappears entirely (the composer's
placeholder already says what it is for). `AskSurface` passes `greeting` and
`opening` as separate props to `CoachHelmChat` (`AskSurface.tsx:205-213`), so
this is an ordering change inside `CoachHelmChat`, not a rewrite.

**Cost:** low. **Risk:** the greeting is the only `<h1>` on the page
(`AskSurface.tsx:224`) — whatever becomes the masthead has to take the `h1`, or
the page ships with no top-level heading. The lead finding's headline is a
sentence, not a page title, so the honest fix is an `sr-only` `<h1>Ask
CoachHelm</h1>` plus the finding rendered at display size. Do not silently
delete the `h1`.

### A2. Use the width — the "What I can see" ledger

The conversation column runs ~594px inside a ~1150px stage. The right half is
empty on the entry screen and only earns its keep once an answer renders.

**Fill it with provenance**, which is the one thing that belongs beside a
question and not inside the answer: what the system is drawing on.

Good news from reading `program-pulse.ts`: **every number this needs is already
fetched.** `getCoachProgramPulse` reads `golf_rounds` (`:107-115`, limit 400)
and `golf_events` (`:116-128`, next 14 days) in the same `Promise.all` that
builds the findings. The ledger costs **two extra fields on the return object**,
not a query:

```ts
// program-pulse.ts — ProgramPulse (currently :49-57)
rounds_counted: number;      // rounds.length
events_next_14d: number;     // events.length
```

`active_roster`, `players_without_rounds`, `latest_round_at` and `as_of` are
already on the interface (`:49-57`) and already rendered as prose by
`coverageLine` (`:403`). The ledger is the same facts as a scannable column:

```
WHAT I CAN SEE
18 rounds          since Mar 4
7 of 8 players     recorded
12 events          next 14 days
                   as of 11:42 AM
```

**Why this and not a decorative panel:** it sets the answer's expectations
*before* the question is asked, and it is the same provenance the answer screen
already prints — so it teaches the coach to read the answer's footer rather than
introducing a new idea.

**Honest limit:** at `md` and below there is no second column. The ledger
collapses to the existing `coverage` line, which is what it already does today.
This is a desktop-only gain and should be described as one.

### A3. Sequencing

1. **A1** (reorder + `sr-only` h1) — no data change, immediately visible.
2. **A2** (ledger) — two fields on `ProgramPulse`, one new component. Needs
   `program-pulse.test.ts` updated for the new fields.
3. **A0/Compare + Decide chips** — largest, and the one most likely to be judged
   "AI slop" if done carelessly, because a badly-chosen comparison is worse than
   no chip. Do it last, when the two above have proven the hierarchy reads.

---

## B. The benchmark behind the numbers (audit §2A)

### B1. What is actually true — correcting myself twice

**Correction 1.** I previously described the v3 generators as anchoring college
players to men's-PGA approximations. That is not what the code does.
`cohort-baselines.ts` is a deliberate per-gender table with cited sources
(`:15-25`), written specifically to fix that defect (audit DC-GENDER-1), and it
documents that the men's values were *verified live against `golf_pga_standards`
on 2026-06-06*. The synthetic app-population cohort was evaluated and rejected
with a reason (sand-save `level_avg` 14.8% on the prod snapshot). This is a
considered decision, not a shortcut, and it should not be "fixed".

**Correction 2 — the real gap, which is narrower and sharper.** That file's own
header calls it a *"per-gender / **per-level** cohort anchor table"* (`:1-2`),
but the only dimension it implements is `CohortGender = 'mens' | 'womens'`
(`:32`). There is no level axis. Meanwhile `CohortTier = 'pga' | 'korn_ferry' |
'd1' | 'd2' | 'd3' | 'hs'` already exists — in `pga-standards.ts:34`, the module
that nothing imports.

So: **the level half of the design was specified, typed, and never built.** The
women's numbers are hand-derived college targets precisely *because* there was
no level dimension to express "D2 women" with. That is the thing worth fixing,
and it is a much smaller job than "wire up tour benchmarks".

### B2. What the chat screen needs regardless

A bare `−3.92` in an answer table is unreadable without its baseline, and that
is true whichever anchor wins. The chat payload should carry, per metric row:
the value, the anchor it was compared against, and the anchor's *name*
("D2 women", "PGA Tour") — so the table can render `−3.92 vs D2 women` instead
of a number floating free.

This is plumbing through `EvidenceVisuals.tsx` (841 lines — the largest file in
the chat directory, and where any table change lands). It does **not** depend on
B1: today the name is `"PGA Tour"` or `"women's college"`, and printing that
honestly is already better than printing nothing.

**Do B2 first.** It is independent, it makes the current numbers legible, and it
makes B1's eventual effect visible instead of silent.

### B3. The open decision — not mine to make

Whether a D2 women's program should be measured against a women's-college anchor
(current), a D2-specific anchor (unbuilt), or the PGA Tour (what a bare number
implies today) is a product judgement about what a coach should feel when they
open the screen. Every option is defensible; they produce visibly different
products. Flagging, not deciding.

---

## C. What I have not verified

Everything above is read from source. **No part of §A has been rendered.** The
dev server is up but four fix agents are compiling against the same worktree, so
webpack is thrashing and a screenshot right now measures contention, not design.
The renders are the next step once those land, and any claim here about how
something *looks* is a prediction until then.
