<!-- BaseballHelm "Living Annual" — component architecture + full surface coverage map.
     Companion to design-system-living-annual.md. Every UI/UX wave builds toward THIS.
     Rule: a surface is "done" only when it (a) composes from the kit, (b) deletes the
     legacy component it replaces, (c) updates its features-doc entry. 2026-07-01. -->

# BaseballHelm — UI Kit Architecture & Surface Coverage Map

**Goal:** *every* baseball surface (coach + player, hero + utilitarian) composes from ONE
kit so the product reads as a single publication. No surface keeps a bespoke card, header,
empty state, or stat display once the kit covers it. Consistency is the deliverable.

Delivery mechanism = the existing **Fairway redesign layer** (`.fairway-ds` scope,
`--fw-*` tokens — unconditional, no flag). The Living-Annual kit is the
**baseball-native vocabulary layered on top of the Fairway tokens** — not a second
design system.

> **Update (2026-07-09, golf Wave W1):** `NEXT_PUBLIC_REDESIGN` no longer gates
> anything — `isRedesignEnabled()`/`useRedesign()` in `src/lib/redesign/flag.ts`
> are hardcoded `true` (the legacy `GolfDashboardShell`/`GolfSidebar` fork they
> used to gate was deleted). Setting the env var has zero effect. Baseball's
> `BaseballFairwayShell` renders unconditionally and was never flag-gated the
> way golf's dual tree was; `src/components/layout/header.tsx` still calls
> `isRedesignEnabled()` (always `true`) to suppress its own legacy chrome, but
> that is a hardcoded return, not env-driven behavior.

---

## Component layers

### L0 — Tokens (`src/styles/baseball-living-annual.css` + tailwind.config.ts)
Two inks (`--team-ink` green, `--pursuit-ink` clay) · grade ramp (`--grade-low/avg/plus`) ·
`--clay`/`--chalk` viz canvas · `--sodium` PR accent · serif hero sizes (`ink-hero`, `ink`) ·
reuses Fairway `--fw-*` surfaces/shadows/motion.

### L1 — Atoms (`src/components/baseball/living-annual/`)
| Atom | Role |
|---|---|
| `Masthead` | Two-line editorial name block (given serif + SURNAME small-caps + registration tick) |
| `Eyebrow` | Small-caps dateline label (`POSITION · CLASS · STATE`) |
| `SectionMasthead` | **Page header for every route** (editorial title + eyebrow + actions) — replaces generic ViewHeader on baseball |
| `HairlineRule` | The draw-on `scaleX` baseline rule (the signature transition) |
| `RuledStatLine` | THE atom: label + serif numeral on a hairline rule; `verified`/`ghost`/`ink` variants |
| `StatReadout` | Any changeable number: mono tabular odometer, `flashOnChange`, `pr` |
| `GradeStamp` | 20-80 evaluation token (debossed, ramp color, present/future) |
| `ToolRail` | 20-80 horizontal scale w/ MLB-AVG tick + compare |
| `PositionChip` | Small-caps position/role chip |
| `InkBadge` | Status stamp (ink-tinted, NOT a colored pill) |
| `AgingBar` | Clay days-since-contact bar that darkens toward a deadline |
| `LiveDot` | 2s breathing dot for genuinely-live state |
| `PaperCard` | Paper surface (grain + hairline + letterpress inset + registration tick) |
| `ClayCanvas` | The ONE dark viz frame (chalk graticule). Quarantined to viz only. |
| `Trace` | Viz stroke primitive (`stroke-dashoffset` draw-on) for L2 viz |
| `EditorsLetter` | Composed empty/error state (serif letter + rule + STANDING BY). **Kills yellow boxes.** |
| `CommitSeal`/`PacketSeal` | Ceremony seals (oxblood emboss, stamp-press, ink-bleed) |

### L2 — Molecules (composed, reused across surfaces)
`SlashLine`/`StatLineStack` · `KPIContentsStrip` (command-center hero KPIs on rules) ·
`PlayerRowPlate` (record-book roster/stats row) · `RecruitCard` (mini-box-score pipeline chip:
GradeStamps + AgingBar) · `ToolRailStack`/`GradeStampGrid` (evaluation block) ·
`BreakPlot`/`SprayChart`/`ClimbArc` (Trace+ClayCanvas viz) · `TearSheet` (scout packet) ·
`CoverHero` (opponent cover line) · `EmptyIssue` (per-surface EditorsLetter presets).

### L3 — Shell / IA (`src/components/baseball/living-annual/shell/` + nav-registry.ts)
`LaneShell` (ink context: green Pressbox/Passport, clay War Room; coach-type→lane map; JUCO
ink toggle) · `MastheadBar` (team wordmark · season dateline · ⌘K) · `LaneSwitcher` (3 tabs).
Remap `nav-registry.ts` to the 3-lane IA; retire the flat 14-item sidebar arrays.

### L4 — Surface templates
Every route composes L2/L3. Coverage matrix below.

---

## Surface coverage matrix (every route → kit + legacy to delete)

### Lane 1 · THE PRESSBOX (coach team-ops · green ink)
| Route | Kit composition | Delete on migrate |
|---|---|---|
| `command-center` | `CoverHero` + `KPIContentsStrip` + `EditorsLetter` brief | legacy `CommandCenterClient` |
| `roster` | `PlayerRowPlate` spread + `SectionMasthead` | ad-hoc roster cards |
| `stats-center` | `PlayerRowPlate` wall (`StatReadout`,`PositionChip`) | `StatsOverviewCards` where replaced |
| `my-stats` (player-personal) | `RuledStatLine` stack + `StatReadout` | ad-hoc stat cards |
| `practice` | `SectionMasthead` + `PaperCard` + `EditorsLetter` | bespoke header/empty |
| `practice-effectiveness` | `SectionMasthead` + `ClimbArc`/`Trace` | bespoke chart chrome |
| `postgame` | `SectionMasthead` + `RuledStatLine` box lines | ad-hoc box tables |
| `calendar` | `SectionMasthead` + `PaperCard` events | duplicate `<Header>` mount |
| `performance` (lift) | `SectionMasthead` + `StatReadout` + `ClimbArc` | dup ProgramEditorClient |
| `import` | `SectionMasthead` + `EditorsLetter` | bespoke header/empty |
| `analytics` | `SectionMasthead` + `StatReadout` + viz | — |
| `announcements`,`tasks`,`documents`,`travel`,`messages/[id]` | `SectionMasthead` + `PaperCard` + `EditorsLetter` (consistency pass) | duplicate `<Header>` mounts, yellow empties |
| `settings/staff`,`settings/program` | `SectionMasthead` + `PaperCard` | bespoke header |

### Lane 2 · THE WAR ROOM (coach recruiting · clay ink)
| Route | Kit composition | Delete on migrate |
|---|---|---|
| `pipeline` | `RecruitCard` board (`GradeStamp`,`AgingBar`,`CommitSeal`) | redirect stub / placeholder |
| `discover`,`watchlist` | `RecruitCard` grid | ad-hoc lists |
| scout packets | `TearSheet` | bespoke packet view chrome |
| `decision-room` | `ToolRailStack` compare | bespoke compare UI |
| `signals` | clay ticker + `InkBadge` + `LiveDot` | yellow alert boxes |

### Lane 3 · THE PASSPORT (player development · green ink)
| Route | Kit composition | Delete on migrate |
|---|---|---|
| `today` | signed assignment (`PaperCard`+`RuledStatLine`+`EditorsLetter`) | bespoke today cards |
| `passport` | `Masthead` + `RuledStatLine` stack + `ToolRail` + `GradeStamp` + Development Story | legacy `PlayerPassportCard` internals |
| `development`/`dev-plan` | `ClimbArc` | "No development plan yet" bespoke empty |
| `timeline`,`profile`,`college-interest`,`activate` | `SectionMasthead` + `PaperCard` + editorial | bespoke chrome |
| recruiting Go-Live gate | ceremony (seal) | bespoke activate flow chrome |

---

## Per-wave definition of done
1. Surface composes from the kit (no bespoke card/header/empty/stat display remaining).
2. The legacy component it replaces is **deleted** (grep for orphaned imports; `knip` + `tsc` clean).
3. Its entry in `memory/context/baseballhelm-features.md` is added/updated; this map is checked off.
4. tsc + lint clean; folds into `batch/baseball-fixes`. One surface per change.

## Docs to keep current (root-cause prevention)
- `memory/context/baseballhelm-features.md` (BUILD — currently missing; the reason surfaces drifted)
- `memory/registry.yml` (add baseball code-paths)
- `docs/baseball/design-system-living-annual.md` (mark components/surfaces implemented)
- `CLAUDE.md` routing line ("Baseball features | No deep reference yet…")
- `src/components/baseball/living-annual/README.md` (kit usage)
