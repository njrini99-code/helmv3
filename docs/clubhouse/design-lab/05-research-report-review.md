# Nick's research report, checked against the code

Nick added "Clubhouse Premium UI/UX and Native-Feel Research Report" to the
project on 27 Nov 2026. It was written without the repo ("This report has not
inspected Clubhouse's repository"), so each claim below was checked against
the code before it was adopted. Evidence tiers follow [README.md](README.md).

## Adopted

| Report point | What the code had | What changed | Evidence |
| --- | --- | --- | --- |
| Cards are compositions with semantic roles, not one rectangle with class strings | `ui/Surface.tsx` has a head, body and footer, but no figure, delta, visual or state slots; option F's title bar is redrawn per page (`roster.css` and `stats-redesign.css` in #2610 use negative margins and doubled selectors) | `ui/Card.tsx` and `styles/card.css`: kinds (metric, entity, chart, comparison, alert, list), parts (header with eyebrow, title, meta and icon; metric with unit and delta; visual; body; footer), option F's green bar and the feature card as attributes, a pressable mode, and loading, empty and failed states | V: `ui/__tests__/Card.test.tsx`; F: `/clubhouse-preview/card-lab` |
| Shadow-only edges vanish in forced colours | The card's ring is a box-shadow (`--ch-elevation-card`); keys already use a real outline (CC-6) | `card.css` draws a `CanvasText` border under `forced-colors: active`; the pressable card's focus ring is an outline | V: `card.css` |
| Contact plus ambient shadow, not one heavy drop | Already true: `--ch-elevation-card` is a ring, a 1 px contact and a soft ambient fall; three elevations only (DESIGN_LANGUAGE §4) | Nothing; the kernel reads the token | V: `tokens.css` |
| Chart interaction state keyed by datum id, not index | `useChartPin` pinned by index and only dropped a pin past the end, so a round arriving before a pinned one moved the pin to a different round | `useChartPin` takes `ids`; a pin follows its round and drops when that round leaves. `RoundTrend` and `ScoringFeatureChart` pass round ids | V: `lib/__tests__/use-chart-pin-ids.test.tsx` |
| Evidence levels kept apart, never "iPhone tested" from Chromium | `.claude/rules/browsers.md` already has W (WebKit lab), S (real Safari, Simulator), D (iPhone) and C (Chromium) | The design lab's tiers gain the report's two extra rows: the installed web app and the Capacitor shell (the only place native haptics exist) | V: README tier list |
| Extra blind spots | The gap register lists 16 | Added below as BS-17 to BS-26, each with its smallest test | Proposed |

## Rejected or changed, with the reason

| Report point | Why not as written |
| --- | --- |
| Pick Radix or Base UI as the overlay base | Clubhouse already has one overlay family of its own: native `<dialog>` with focus return, scroll lock and the shared sheet drag (`ui/Modal.tsx`, `lib/dialog-lifetime.ts`, `lib/sheet-drag.ts`). No Clubhouse screen imports Radix (inventory B). Adding a second family is the fragmentation the report warns about. The behaviours it lists (touch-open focus, frozen size while animating, collision) become tests on the existing family (BS-21). |
| Spring roles with bounce 0.08 to 0.10 for popups and sheets | Owner rule: nothing a tap opens overshoots; every spring is critically damped (`CH_SPRING`, bounce 0, MOTION-AND-VISUAL 3.x). Roles already exist as the twelve-token vocabulary and `CH_SPRINGS`. Kept the roles idea, not the bounce. |
| Adopt Motion everywhere at the primitive level | Motion (`motion/react`) is already the library for `Swap` and `ListPresence`; page motion runs on the Web Animations API by design (`lib/share-morph.ts`, no view transitions). No change. |
| A `navigator.vibrate` haptics engine is wrong for Safari | Agreed, and Clubhouse never had one: `lib/haptics.ts` calls the Capacitor bridge only inside the native shell and is silent on the web. No change. |
| shadcn MCP, 21st, Builder, Tremor or ECharts as sources | Clubhouse markup uses no Tailwind and its charts are hand-drawn SVG pinned recharts-free by a test. These stay reading material (research database), not installs. No paid tool. |
| Feature card at "most expressive material", glass on content | Owner locks: feature cards are flat deep green, once per view; the glass bar never sits behind data. The kernel enforces flat and gives `featureCount` for a once-per-view test. |
| Proposed font CLS budget of 0.02 | Plausible, unmeasured here. Logged as BS-17 for a Safari trace before it becomes a gate. |

## New blind spots (added to the register's 16)

| ID | Blind spot | Smallest test |
| --- | --- | --- |
| BS-17 | Font swap moves text above the fold | Cold-cache WebKit load with the font delayed; read LayoutShift entries |
| BS-18 | Back from a detail loses the list's scroll position | Rounds list: scroll, open a round, Back; assert the row is where it was |
| BS-19 | A press that turns into a scroll still fires | Pointer down on a card, move 12 px vertically, up; assert no open |
| BS-20 | Double submit and failed optimistic update | Two taps on Save within 100 ms; a failed save rolls the row back and says so |
| BS-21 | Overlay touch-open focus, resize while open, orientation change while open | Popup lab: open by touch (no keyboard), rotate, resize to 320 |
| BS-22 | A toast over a sheet or the keyboard | Open the composer sheet with the keyboard up, raise a toast; assert both readable |
| BS-23 | Skeleton geometry differs from the loaded card | Measure each card's loading and ready heights; equal within 4 px |
| BS-24 | Date boundaries across team time zones | A round at 23:30 team time lands on the team's day in every view |
| BS-25 | Hover-only affordances on touch | Every control revealed on hover has a touch path; fixture sweep with hover off |
| BS-26 | Browser zoom at 200 to 400 percent | Desktop sweep at 200 and 400 percent zoom; no lost action |

## Where it shows

The card kernel is pilot P1 (QUEUE `dsx-02`). The lab at
`/clubhouse-preview/card-lab` shows today's Roster leader cards beside the
same fixture players drawn with the kernel, then its kinds and states.
Fixture shots are layout evidence only; Roster's real cards move to the
kernel after #2610 merges, with staging shots from the Mac.
