# Build contract standard (every lane, 31 Oct)

Nick, 15:30: "all designed screens need an emphasis on matching designs and motion and animation details and subscreen details… I want more detail than just a 500 word Md."

Each lane's package is the build contract. The builder reads it instead of guessing from the design page. On top of the existing 01 to 04 files, every lane adds four files with these exact names and shapes, so the zip reads the same in every folder. Where a new file and 04-FIDELITY-SPEC disagree, the new file wins and 04 gets a one-line pointer.

Write the values as you read them off the design page (its CSS, its JS and its computed styles), never from memory. If the design page doesn't draw a state, say "not drawn" and give the build rule. Don't leave a row out.

## 05-SCREENS.md: the screen inventory

One table row for every screen, subscreen, pushed page, sheet, menu, popover, modal, toast and inline state. Nothing that can appear on screen is left out.

| Column | What goes in it |
|---|---|
| ID | Short and stable, used by 06, 07, 08 and capture.mjs: `S-ROSTER`, `S-ROSTER.profile`, `S-ROSTER.sort-menu` |
| Kind | screen, push, sheet (with its detent: 62%, 74%, 90%, full), menu, popover, modal, toast, inline state |
| How you get there | The exact tap from the parent ID |
| Design link | The artifact URL plus its anchor or state, e.g. `https://claude.ai/artifact/QnVN3x63a79TM8geunzccU#roster-phone-light-coach-profile`, plus the local file and anchor in `redesign/` |
| App route | Preview route and `?state=`; "add" where the fixture doesn't exist yet |
| Roles | coach, player or both, and what each sees differently |
| PR | The PR that builds it |

Under the table, one state matrix per screen ID. Rows: default, loading, empty, error/failed, long text (longest real name, 3-line note), lots of items (25 players or 40 rows), one item, offline or stale, XXL Text Size, dark, Reduce Motion, phone 390, large phone 430 (20px edge), desktop 1280. Columns: drawn? (anchor), capture state id, the rule in one line.

## 06-SCREEN-SPECS.md: per-screen specs

One section per screen ID, top to bottom in the order the eye meets it. For every element:

- Box: width or rule (fill, hug, fixed), height, padding T R B L, gap to the next element, radius, border.
- Type: role token, size/line-height/weight/tracking in pt, case, number style (tabular), max lines and the overflow rule.
- Colour: app token (never a raw hex where a token exists), with the hex in light and dark next to it.
- Contrast: every text/background and icon/background pair, measured in light and dark, written as ratios. Target 4.9:1, hard floor 4.5:1; large text (24pt or 19pt bold) and non-text glyphs 3:1. A pair under target is listed with its fix.
- Icon: name, size, stroke, colour token.
- Hit area: at least 44×44pt, with how it's met when the glyph is smaller.
- Data: the field each value comes from (pointing to 03-DATA-CHECKS), its format (decimals, units, "—" for missing), and what shows when it's missing.

Close each section with a measured redline: a short list of the 5 to 10 numbers a reviewer should check first on a screenshot (title baseline from the bar, card inset, row height, avatar size, chart height).

## 07-MOTION.md: one row per interaction

| Column | What goes in it |
|---|---|
| ID | `M-ROSTER-01`, tied to a screen ID |
| Trigger | The exact gesture or event, and its threshold (10px slop, 450ms hold, 56px scroll) |
| Element(s) | What moves, by selector or component name |
| Property | transform (translate/scale/rotate), opacity, clip, height, colour, blur |
| From → to | Real values: `translateY(102%) → 0`, `scale(1) → 0.97`, `opacity 0 → 1` |
| Duration | ms (a spring also gives its settle time) |
| Curve or spring | `cubic-bezier(…)` or spring stiffness, damping, mass (and the `linear()` string used on web), with its token name in `lib/motion.ts` or `tokens.css` |
| Delay / stagger | ms, and the order (index, top to bottom); "none" where none |
| Interruptible | What happens when the user taps, scrolls or reverses mid-flight: retargets from the current value, finishes first, or cancels |
| Reduce Motion | The exact replacement (usually a 120ms opacity crossfade, no travel) or "none, static" |
| Haptic / sound | iOS haptic style if any |
| Check | How 08 proves it: the Playwright clip name and the frame to compare |

Below the table: the list of things that must never animate on this lane (count-ups, entrance staggers, re-render motion, blur on scroll unless drawn) and every interrupt case worth a test.

## 08-ACCEPTANCE.md: testable acceptance

Two parts.

Per screen ID: numbered criteria a reviewer can mark pass or fail, each one checkable on a screenshot, in a DOM test or a clip. Write them as facts, not wishes: "Row height is 64pt at default Text Size and grows, never clips, at XXL", not "rows look right". Cover layout, every state in the 05 matrix, contrast pairs from 06, motion rows from 07, data fields and roles (players never see a teammate's own figures; coach-only items absent from the player DOM, not just hidden).

Per PR: which screen criteria the PR must pass, which tests it adds, and its done-when line.

Side by side: how to prove the build matches the design. For each screen ID: run `node capture/capture.mjs --id <ID> --state <state>` (design page and app preview at the same width, theme and Text Size), put the two images next to each other in the PR, and check the 06 redline numbers on both. For each motion row: record the design page and the app with Playwright `recordVideo` at 390 wide, put both clips in the PR, and compare duration, curve and what moves; repeat with `reducedMotion: 'reduce'`. A PR is done only when every listed screen matches within 2pt on the redline numbers and every motion row matches.

Shared criteria that apply to every lane (green bar unchanged, flat page, no accent left borders, 4.9:1 contrast, XXL unclipped, Reduce Motion crossfades only, 16/20 phone edge, draft PRs only, no deploy, flag or migration, shot tracking unchanged, players never see teammates' figures) live once in `ACCEPTANCE-SHARED.md` (source: `clubhouse-handoff/redesign-package-src/ACCEPTANCE-SHARED.md`; in the zip: `00-shared/`). Don't repeat them; reference them by number: SHARED-1 green bar, 2 flat page, 3 no accent left borders, 4 contrast and legibility, 5 XXL unclipped, 6 Reduce Motion and honest motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy, flag flip or migration, 10 shot tracking unchanged, 11 players never see teammates' figures, 12 side-by-side match.

## capture.mjs

Must accept `--id` and `--state` from 05 and write `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`, plus `--motion <M-ID>` for clips. Keep it to one browser and one dev server.
