# The Living Annual — FOUNDATION kit

The reusable component + motion + token kit for BaseballHelm's **"Living Annual"**
redesign. North-star spec: [`docs/baseball/design-system-living-annual.md`](../../../../docs/baseball/design-system-living-annual.md)
(§4 language, §7 kit, §8 motion contract).

Every redesigned baseball surface composes from these atoms — build nothing
bespoke that one of these already does. Components render inside the
`.fairway-ds` redesign scope and consume the Fairway `--fw-*` tokens plus the
baseball-native tokens in `src/styles/baseball-living-annual.css`.

```tsx
import { RuledStatLine, GradeStamp, EditorsLetter } from '@/components/baseball/living-annual';
```

---

## The two-ink rule (memorize this)

The active lane's ink **is** the wayfinding — never mix inks within a lane's chrome.

| Ink | Token | Means | Where |
|---|---|---|---|
| **green** | `--grade-plus` / Fairway accent | team + **development** | Pressbox, Passport |
| **clay** | `--pursuit-ink` (`text-pursuit`) | recruiting + **pursuit** | War Room |
| **oxblood** | `--pursuit-deep` | seals & stamps **only** | `CommitSeal` |
| **sodium** | `--sodium` | one PR / live flash, then rest | `StatReadout pr` |

Pass `ink="team"` (green) or `ink="pursuit"` (clay) to lane-aware components
(`RuledStatLine`, `Masthead`, `Eyebrow`, `ToolRail`, `EditorsLetter`).

## The empty-state doctrine (product-wide)

**No yellow warning boxes. Anywhere.** Every zero / empty / soft-error renders
through either:

- **`<EditorsLetter>`** — a signed editor's-letter voice on Paper stock, or
- **a ghosted `<RuledStatLine ghost>`** — the measurable at 40%, waiting to fill.

Day-one always looks like *an unreleased first issue*, never a broken CRM.

## The clay-canvas quarantine rule

`--clay` (and `<ClayCanvas>`) is the **one** dark surface. It appears **only**
inside a `<ClayCanvas>` viz frame — **never** a page, sidebar, or card
background. A PR reviewer should reject `--clay` used as generic chrome.

## Motion contract (§8)

One signature move per view: **rules draw → ink settles → (if present) a trace
draws.** Numbers are sacred — always `<StatReadout>`, `tabular-nums`, odometer
on change, never a spring. `prefers-reduced-motion` is first-class: rules render
drawn, numbers set, stamps/pulses show without motion. Shared variants live in
`motion.ts` (`rulesDraw`, `inkSettles`, `inkColumn`, `stampPress`, `inkBleed`,
`traceDraw`, `useSettleStagger`).

---

## Components

### `<RuledStatLine>` — THE signature atom
Small-caps hung-left label + serif ink numeral sitting ON a hairline baseline
rule that draws on mount. Value rolls via `<StatReadout>`.

```tsx
<RuledStatLine label="EXIT VELO" value={94} unit="MPH" size="hero" verified ink="team" />
<RuledStatLine label="POP TIME" value={1.94} decimals={2} size="row" />
<RuledStatLine label="60-YARD" value="" ghost />           {/* unfilled measurable */}
```
Props: `label, value, unit?, size?='row'|'hero', verified?, ink?='team'|'pursuit', ghost?, decimals?, className?`

### `<StatReadout>` — any number that can change
`font-fw-mono tabular-nums`, wraps the Number Flow odometer. `flashOnChange`
pulses a green rule on change; `pr` fires a single sodium flash. Reduced motion
sets instantly.

```tsx
<StatReadout value={liveVelo} decimals={1} suffix=" mph" flashOnChange />
<StatReadout value={seasonBest} pr />
```
Props: `value: number|string, decimals?, prefix?, suffix?, flashOnChange?, pr?, ariaLabel?, className?`

### `<Eyebrow>` — small-caps dateline
`POSITION · CLASS · STATE` grammar, `tracking-[0.14em]`, middot-joined.

```tsx
<Eyebrow items={['SS · 2B', "CLASS OF '26", 'RALEIGH, NC']} />
```
Props: `items?, children?, ink?='muted'|'team'|'pursuit', as?, className?`

### `<Masthead>` — two-line editorial name block
`given` (serif regular) over `SURNAME` (serif small-caps), settles on mount.
Optional dateline eyebrow, registration tick, and `scrollShrink` shrink-to-byline.

```tsx
<Masthead given="Marcus" surname="Rodriguez"
  dateline={<Eyebrow items={['SS · 2B', "CLASS OF '26"]} />}
  registrationTick scrollShrink />
```
Props: `given, surname, dateline?, ink?, registrationTick?, scrollShrink?, className?`

### `<GradeStamp>` — 20-80 evaluation atom
Debossed rounded-square, mono numeral + tool ring label, ramp-colored by value
(`grades.ts`), ±1.5° tilt, stamp-press reveal + ink-bleed. `present` solid vs.
future ghost outline.

```tsx
<GradeStamp value={60} tool="POWER" present />
<GradeStamp value={70} tool="RUN" present={false} size="sm" />   {/* projected */}
```
Props: `value, tool, present?=true, rotate?, size?='md'|'sm', className?`

### `<ToolRail>` — 20-80 horizontal scale
Ticks 20–80 (50 = `MLB AVG`) on a rule that draws; filled present pip + hollow
future pip + ink connector. `compare` stacks a second athlete.

```tsx
<ToolRail label="POWER" value={55} future={65} ink="team"
  compare={{ value: 50, future: 55, ink: 'pursuit' }} />
```
Props: `value, future?, ink?, label?, compare?: {value, future?, ink?}, className?`

### `<PaperCard>` — Paper surface
Flat `--paper`, hairline border, newsprint grain, letterpress inset shadow (not
a drop shadow), optional die-cut registration tick.

```tsx
<PaperCard registrationTick className="p-8"> … </PaperCard>
```
Props: `children, registrationTick?, grain?=true, as?, className?`

### `<ClayCanvas>` — the ONE dark viz frame
`--clay` bg + `--chalk` graticule + scan-line vignette. **Frame only** — children
are the viz (the `<Trace>` stroke primitive lands in a later wave). See the
quarantine rule above.

```tsx
<ClayCanvas label="THE BREAK ROOM" aspect="aspect-[4/3]"> {/* viz children */} </ClayCanvas>
```
Props: `children?, label?, grid?=true, aspect?, className?`

### `<EditorsLetter>` — composed empty / error state
Serif letter voice on Paper + an ink rule that draws + optional `STANDING BY`
live breathing dot. **Replaces yellow warning boxes.**

```tsx
<EditorsLetter
  title="Standing by — awaiting first pitch"
  body="Post your first game and the cover fills itself in."
  signoff="— From the desk of CoachHelm"
  live ink="team" />
```
Props: `title, body?, ink?='team'|'pursuit', live?, liveLabel?, signoff?, action?, className?`

### `<CommitSeal>` / `<PacketSeal>` — ceremony
Oxblood embossed seal, stamp-press ease, ink-bleed. `label` is the ceremony word.
`PacketSeal` is the wax-style Helm monogram seal for minted tear-sheets.

```tsx
<CommitSeal label="COMMITTED" size="lg" />
<CommitSeal label="OFFER" variant="commit" />
<PacketSeal label="ISSUED" size="md" />
```
Props: `label?, variant?='commit'|'packet', size?='md'|'sm'|'lg', rotate?, className?`

---

## Helpers

- **`grades.ts`** — `gradeColor(v) → 'low'|'avg'|'plus'`, `gradeLabel(v)` (scouting
  band), `isPlus(v)` (≥60), plus `GRADE_TEXT_CLASS` / `GRADE_BG_CLASS` / `GRADE_VAR`
  static maps. Pure, tested in `grades.test.ts`.
- **`motion.ts`** — the shared framer-motion variants + `useSettleStagger`. Every
  factory takes a `reduced` flag and returns the final state instantly when true.
