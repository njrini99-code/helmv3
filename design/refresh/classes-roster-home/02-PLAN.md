# Classes, Roster, coach Home: file-by-file build plan
> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 8 plan rows, CP-02.1 to CP-02.8).

Values (sizes, colours, motion, states) come from `04-FIDELITY-SPEC.md` and `redesign/redesign.css`. This file says where they go. Where the two seem to disagree on a value, the spec wins; on a file or a line, this file wins.

Repo `njrini99-code/helmv3`, checked at `main` 75b4956 (Oct 31). All paths are under `src/clubhouse/` unless they start with `src/` or `.github/`. Line numbers are at 75b4956. Find code by name first, because lines drift.

Sources:
- `CLASSES_ROSTER_HOME_IMPLEMENTATION.md` (the "notes")
- `DESIGN_LANGUAGE.md`
- `BUILD_BRIEF.md` (PRs 1–12)
- the design page `redesign/clubhouse-phone-redesign.html` and its CSS, `redesign/redesign.css`

This plan covers files, selectors, components and tests only. Data formulas (leader picks, last-three average, bar colour thresholds, class mix counts, classYearLabel rules) belong to the data agent. Where a piece needs one, the plan names the function and its home, not the maths.

---

## 0. PR order (the notes' "Suggested PR split" mapped to BUILD_BRIEF)

| Notes PR | BUILD_BRIEF PR | Contents | Depends on |
|---|---|---|---|
| 1 Shared | PR 1 (tokens), PR 2 (flat page, Section/Surface into cards), PR 3 (large titles, sticky controls), PR 7 (year avatars and label) | tokens, `Avatar year/dim`, `classYearKey`, `Surface variant="card"` and group list, `FormBars`, large title order and scroll, label fix | none |
| 2 Classes | PR 9 | ClassesView, parts.tsx, classes.css | 1 |
| 3 Roster phone | PR 8 (phone half) | RosterPhone, TeamRosterPhone, RosterProfile, roster.css phone block | 1 |
| 4 Roster desktop | PR 8 (desktop half) | Roster.tsx table, RosterPeek, roster.css desktop | 1, 3 (shares the team card and leaders) |
| 5 Coach Home | PR 10 | HomePhone, DayCard, CoachQueue, TeamLegs, home.css | 1. Coordinate with BUILD_BRIEF PR 6 (player Home, Stats thread) |
| 6 Demo data | none | loader or seed: duplicate classes, missing `graduation_year` | independent |

Ship Shared (1) in four small commits or PRs in this order: tokens → Avatar and label → card surface → large title. Each one is safe on its own.

Every PR must:
- run `npm run clubhouse:catalog` (CI runs `npm run clubhouse:catalog -- --check` in `.github/workflows/clubhouse-quality.yml`)
- run `npm run clubhouse:css`
- keep `playwright.clubhouse.config.ts` green

---

## 1. Files that must NOT change

| File | Why |
|---|---|
| `shell/TopBar.tsx` (118 lines) | The green bar stays as it is (notes §2, BUILD_BRIEF PR 3). |
| `shell/phone-chrome.tsx`, including `PhoneTop` (344–365), `usePhoneHero` (129), `PhoneScreen` | Same. Pages pass their own `action` only. |
| `ui/PhoneBar.tsx` (`PhoneBarParts`, `PhoneBar`, `PhoneIconAction`) | The pushed profile bar ("‹ Roster", centred name, more) is already right. |
| The section switch and strip (`.ch-sw`, `docs/clubhouse/phone/section-strip.md`) | Open call 1: keep the strip. No tab bar. |
| `shell/ClubhouseFrame.tsx` (`data-phone-hero` at 260) | Hero mode is wired already. |
| `shell.css` bar rules: `.ch-topbar`, `.ch-pbar`, lip `::after` (2466–2480), phone hero bar (1305–1380) | The bar's look. See risk R3 for the one exception to raise with Nick. |
| `ui/Segmented.tsx` and `controls.css` `.ch-seg` (about 4–90), tokens `--ch-seg-on-*` (tokens.css 625–628, dark 987, 1029–1030) | Notes §4 say to use it exactly as drawn. Only the screen-level overrides go. |
| `screens/roster/sort.ts` (`useRosterSort`), `writes.ts`, `class-status-writes.ts`, `useJoinRequests.ts` | Behaviour stays the same. (fixed 4 Nov wiring: `writes.ts` and `class-status-writes.ts` are in `screens/classes/`, not `screens/roster/`; Roster's writes are server actions in `src/app/golf/actions/` (teams.ts, roster.ts, team-management.ts, v3/intent.ts). `useJoinRequests.ts` takes one change: 06 Wiring W.3 "requests.elsewhere".) |
| Routes `src/app/golf/(dashboard)/dashboard/{classes,roster,…}/page.tsx`, `routes/classes.tsx`, `routes/roster.tsx` | Gating only. |
| `ui/Section.tsx` behaviour on desktop | Desktop keeps the flush Ledger headings (BUILD_BRIEF PR 2). |
| `screens/home/PlayerHomePhone.tsx`, `.ch-ph-leg` (home.css 2032, 2411–2452) | Owned by the Stats thread (BUILD_BRIEF PR 6). Coach Home copies its shape. |

---

## 2. Shared (notes PR 1)

### 2.1 Tokens: `styles/tokens.css`

Today:
- light root `[data-ui='clubhouse']` 10–781
- dark `html[data-fw-theme='dark'] [data-ui='clubhouse']` 792–1050
- phone overrides 1054–1079
- Reduce Motion / `[data-motion='off']` about 1092–1109
- `@media (min-width:414px)` sets `--ch-page-x-phone: var(--ch-space-5)` at 1231–1235. The 16/20px edge already exists, so there is nothing to do there.
- `--ch-frame` at 72 (dark 843), `--ch-green-800` at 53 (dark 837), `--ch-on-green-ink` at 204
- `--ch-type-k` at 269, type steps 272–352, `--ch-type-large-title` at 346
- avatar neutrals at 692–694 (dark 1036–1038), `--ch-well-bg` at 697 (dark 1039)

Add to the light block after the avatar neutrals (about 694), and mirror each one in the dark block (about 1038):
- `--ch-yr-sr:#1F6B45; --ch-yr-jr:#3D6787; --ch-yr-so:#86672C; --ch-yr-fr:#9A4A35; --ch-yr-ink:#fff`
  - dark: `#2A7A51 #46739A #8F6E31 #A3533E`, ink `#fff`
- From BUILD_BRIEF PR 1, if that PR has not landed:
  - `--ch-grouped-bg`, `--ch-card-bg`, `--ch-card-ring`, `--ch-card-shadow`, `--ch-separator`, `--ch-well-bg-flat`
  - `--ch-gain`, `--ch-loss`, `--ch-flag`
  - `--ch-chart-gain-fill`, `--ch-chart-loss-fill`, `--ch-chart-flat`, `--ch-chart-track`, `--ch-chart-zero`
  - `--ch-feature-ink`, `-ink-2`, `-gain`, `-loss`, `-flag`
  - `--ch-type-row`, `--ch-type-meta`, `--ch-type-figure-hero`, `--ch-type-figure`, each as `calc(… * var(--ch-type-k))` like the existing steps
- Home colours that are hard-coded today get tokens:
  - `--ch-chart-line` for the `#3F7556` in home.css 2959 and 2963
  - `--ch-score-under` for the `#9E3B2E` in home.css 2883–2885
  - give both a dark value
- Reduce Motion block: `--ch-dur-crossfade-rm` set to the `CH_FADE_MS` value (180ms today; START_HERE shared values).

Tests:
- `styles/__tests__/contrast-tokens.test.ts`: use its `token()` helper to add white on each `--ch-yr-*` (≥ 4.5 in light and dark; Sophomore dark is the lowest at 4.73), and `--ch-score-under` on `--ch-card-bg`.
- `elevation-tokens.test.ts`: add `--ch-card-shadow` if that test lists shadows.

### 2.2 Year key helper (new): `lib/class-year.ts`

- `export type ChYearKey = 'sr' | 'jr' | 'so' | 'fr'`
- `export function classYearKey(label: string | null | undefined): ChYearKey | null`
  - maps `'Senior' → 'sr'`, `'Junior' → 'jr'`, `'Sophomore' → 'so'`, `'Freshman' → 'fr'`
  - anything else (null, or a "Class of N" fallback) → `null`
- Map the label rather than recomputing from `graduation_year`. Every screen already carries `classYear` from `data/season.ts classYearLabel`, so no new data is needed.
- Test: `lib/__tests__/class-year.test.ts`.

### 2.3 Avatar: `ui/Avatar.tsx` and `styles/ui.css`

Today:
- `AVATAR_TONES` at 4, `avatarTone` at 11–15 (B19)
- `Avatar({name,id,size='md',ring=false})` at 36–48 always sets `data-tone`
- ui.css: `.ch-avatar` 189–207, tones 213–238
- **phone flattening: `@media (max-width:820px){.ch-avatar[data-tone]{neutral}}` at 239–245** (D-43)
- dark tones 1128–1157, with **dark phone flattening at 1154** (`html[data-fw-theme='dark'] .ch-avatar[data-tone]`)

Change:
- Add props `year?: ChYearKey | null` and `dim?: boolean`.
- When `year` is set, render `data-year={year}` and **leave `data-tone` off**. Both phone neutral rules match `[data-tone]` only, so they no longer apply, and no specificity fight is needed.
- When `year` is null, keep `data-tone` as today (coaches, invites, unknown years).
- `dim` sets `data-dim=""`.
- Rewrite the comment block (lines 7–10) to record the new rule: "Players with a known class year take the year colour. Everyone else keeps the B19 id tone. Owner, Oct 31."
- ui.css, after 245 (and after the dark block at 1157):
  ```css
  .ch-avatar[data-year]{background:var(--ch-av-year);color:var(--ch-yr-ink);box-shadow:inset 0 0 0 1px rgb(0 0 0/.10),inset 0 1px 0 rgb(255 255 255/.16)}
  .ch-avatar[data-year='sr']{--ch-av-year:var(--ch-yr-sr)} /* jr, so, fr the same */
  .ch-avatar[data-dim]{filter:saturate(.35);opacity:.8}
  .ch-avatar--ring[data-year]{…keep the green ring on top of the year fill…}
  ```
  Dark needs no extra rule because the tokens switch.

Tests:
- `ui/__tests__/Avatar.test.tsx`: add that `year` sets `data-year` and omits `data-tone`, and that `dim` sets `data-dim`. Line 49 (each tone has light and dark CSS) stays.
- Add a CSS test that the `.ch-avatar[data-year]` rule exists for all four years.
- `avatar-ids.test.ts` and `avatar-sizes.test.ts`: unchanged, and keep them green.

BUILD_BRIEF PR 7 says "every avatar in the app picks up the colour". The notes say opt-in per call site. **Follow the notes**: the prop is opt-in, passed where the year is known (see §3–§6). Messages can opt in later in BUILD_BRIEF PR 11.

### 2.4 Class-year label repeat

Fix it where the text is joined, not only in `classYearLabel`. The formula itself belongs to the data agent. Call sites that join `classYear` and `Class of ${gradYear}`:
- `screens/roster/RosterPhone.tsx` 520 (`RequestsSheet`)
- `screens/roster/RosterProfile.tsx` 44–51 (identity line)
- `screens/roster/RosterPeek.tsx` 155–156 (`.ch-rs-peek__sub`) and facts "Class of" at 120
- `screens/roster/format.ts` `rosterPeek` (sub = classYear at 97)

New helper `classYearLine(classYear, gradYear)` in `lib/class-year.ts`. It returns:
- `"Junior · Class of 2028"` when the label is a year name
- `"Class of 2031"` once when the label already is the fallback
- null when both are missing

Use it at all four sites.

If the data agent changes `classYearLabel` (data/season.ts 238–243) to return null for out-of-range years:
- update `data/__tests__/logic.test.ts` 37–54 (line 41 expects `'Class of 2032'`) and `data/__tests__/season.test.ts`
- check callers: home.ts 429, coachhelm-player.ts 116, roster.ts 230/270, roster-player.ts 81, stats-player.ts 564, messages.ts 91 (`?? 'Player'`), qualifiers.ts 214/636/683, calendar.ts

Tests:
- `lib/__tests__/class-year.test.ts` covers `classYearLine`: normal, the repeat case, missing.
- `roster.test.tsx` 816, 838, 985, 994, 1098 assert identity strings such as `'Junior · Class of 2028 · Inactive'`. Recheck them, and add a case where a "Class of 2031" label is not repeated.

### 2.5 Card surface: `ui/Surface.tsx`, `styles/ui.css`

Today `Surface({id,title,subtitle,actions,rule,footer,footerNote,padded,variant:'default'|'flat',level})`, with CSS at ui.css 507–545. It is used by 12 screens.

Change:
- Add `variant: 'card'`, class `.ch-surface--card`:
  - `--ch-card-bg` fill, 16px radius, `--ch-card-ring` 1px plus `--ch-card-shadow`
  - head = title 17/600 (`--ch-type-row` strong) with `actions` or meta on the right of the same row
  - `footerNote` = note band inside the card under a hairline (`--ch-separator`), 15/400 secondary
- Do not restyle `default`, so the other screens don't ripple. Desktop can use it too.
- New `ui/GroupList.tsx` exports `GroupList` and `GroupRow`, the grouped-rows pattern:
  - `ul.ch-group` inside a card
  - rows 52pt minimum (64pt with a sub-line)
  - separator inset past the leading coin: `--ch-group-inset`, default `calc(16px + var(--ch-av-size) + 12px)`
  - press wash instead of scale
- Both screens use it, so share it rather than hand-roll it in roster.css and classes.css.
- Mock references: `.panel`, `.row`, `.card__h`, `.card__note` (redesign.css).

Tests:
- `ui/__tests__/Surface.test.tsx`: add that `variant="card"` renders the title in the card head and `footerNote` inside the card.
- New `ui/__tests__/GroupList.test.tsx`: renders a `ul`, rows are `li`, and the `inset` prop sets the variable.

If BUILD_BRIEF PR 2 lands first with Section-into-card CSS, use its card class instead and drop `variant="card"`. Either way there is **one** card class.

### 2.6 Form bars (new): `ui/FormLine.tsx`

Today `FormRangeContext`, `formDomain`, `FormRange({trends,earlyBelow})`, `FormLine({data,width,height,label,earlyBelow,bare})`, plus `ui/form-range.ts formRangeWords`.

Add `export function FormBars({ data, label, mean, n = 5 })`:
- reads the same `FormRangeContext` so bars share one range down the list (B5)
- takes `data.slice(-n)`
- bar height inverted (lower score = taller)
- `data-tone="gain|loss|flat"` per bar
  - the gain/loss rule is a data-agent function. Put it as `formBarTone(score, mean)` in `ui/form-range.ts`.
- SVG or spans 44×24 with a 3px gap (mock `.form5`)
- `role="img"` with `aria-label` from `formRangeWords`
- CSS in `controls.css` or `ui.css`:
  - `.ch-formbars i{background:color-mix(in srgb,var(--ch-text-primary) 20%,transparent)}`
  - `.ch-formbars i[data-tone=gain]{background:var(--ch-gain)}`
  - `.ch-formbars i[data-tone=loss]{background:var(--ch-loss);opacity:.85}`

Tests: `ui/__tests__/FormLine-range.test.tsx` adds `FormBars` sharing the range and the label. Add a `formBarTone` unit test.

### 2.7 Large title order and scroll: `ui/LargeTitle.tsx`, `shell/large-title.tsx`, `styles/shell.css`

Today:
- `LargeTitle({as,id,hidden,className})`. **`hidden` only sets `aria-hidden`. Nothing hides it visually.**
- On Classes and Roster the large title already renders, but **under** a kicker or term line, and on Classes it sits over a double rule.
- The "hidden" the notes describe is really (a) the order and (b) the phone flattening around it.
- shell.css "Phone large titles" 3064–3130:
  - the bar title is hidden only for pushed titles without `.ch-sw`, so section titles ("Classes ⌄") already stay
  - `.ch-topbar::before` is the 14px shade
- `large-title.tsx watchLargeTitle` sets `data-scrolled` at `scrollY > 0`, and `watchCanvasScroll` at `scrollTop > 0`.

Change:
- `LargeTitle`: add `context?: ReactNode`, which renders a `p.ch-large-title__k` (15pt, `--ch-text-secondary`) **after** the title in a wrapper `div.ch-lt`. Keep `hidden`.
- `LargeTitleSkeleton` gets the same `context` line so skeletons match (CONS-13).
- Scroll shrink and fade: CSS only, inside the shell.css 3077 block:
  ```css
  @supports (animation-timeline: scroll()) {
    .ch-lt{animation:ch-lt-tuck linear both;animation-timeline:scroll(nearest);animation-range:0 56px}
  }
  @keyframes ch-lt-tuck{to{scale:.86;opacity:0}}
  ```
  - Use `transform-origin:left bottom`.
  - Under `prefers-reduced-motion` and `[data-motion='off']`, the keyframes set opacity only.
  - Without `@supports` it stays static, as today.
- The shade appears after 8px: change the two `> 0` checks in `large-title.tsx` (84, 114) to `> 8`. This file is not on the do-not-touch list. Update `shell/__tests__/large-title.test.tsx` to match.

Tests:
- `large-title.test.tsx`: line 55 uses a `.ch-rsm-head` fixture, and 215–251 are the `data-phone-hero` guards. Keep both. Add one for the 8px threshold.
- `large-title-skeletons.test.tsx`: the context line.
- `page-titles.test.ts`: unchanged.
- A new DOM test (BUILD_BRIEF PR 3) that the switcher and the bell or page action render on Classes and Roster with the large title in view.

### 2.8 Sticky controls

Add a utility `.ch-stickybar` to shell.css near 3077:
```css
position: sticky;
top: calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top));
z-index: 2;
background: var(--ch-grouped-bg);
padding-block: 8px;
```
Classes already uses this `top` for `.ch-cl-tthead` (classes.css 2150–2183). Roster uses the utility in §4.

---

## 3. Classes (notes PR 2, BUILD_BRIEF PR 9)

### 3.1 `screens/classes/ClassesView.tsx` (564 lines)

Today:
- `PhoneTop` 353–355 (`title="Classes" start`, + labelled "Add class" → `startAdd`)
- header `.ch-cl-h` 356–388: `.ch-cl-k` term line 358–360, then `<LargeTitle as="p" hidden className="ch-cl-title">` 363–366, then actions `SyncStatus` / Import schedule / Add class 374–387
- `ClassStatusPanel` 416–432 (only when `statusWrites`, flag `class_awareness_v1`)
- `TermBar compact={phone}` 433–444
- `TodayClasses` (phone) 445–449
- `.ch-cl-grid` with `<Section id="ch-cl-deck" title="Your classes" className="ch-cl-sec">` 450–457
- `.ch-cl-side#ch-cl-overlaps` with `OverlapsCard` and `CoachNote` 458–463
- deck built at 307–347 (`TimetableHead`, `ClassCard`, `AddTile`, Delete all)
- sheets 468–561

Change, phone branch only (desktop untouched):
- `PhoneTop` action: + now opens a `MenuSheet` (from `ui/ContextMenu.tsx`, as `CalendarPhone.tsx` 144 does) with "Add class" → `startAdd` and "Import schedule" → `startImport`. Label the action "Add or import". Keep the same visibility condition.
- Header on phone:
  ```tsx
  <LargeTitle as="p" hidden className="ch-cl-title" context={`${term.label} · ${shortDay(term.start)} – ${shortDay(term.end)}`}>Classes</LargeTitle>
  ```
  - Delete the `.ch-cl-k` span on phone.
  - On phone, `.ch-cl-h__a` keeps only `SyncStatus`, because Import moves to the + sheet.
- Order on phone:
  1. `TermCard`
  2. `TodayClasses`
  3. `OverlapsCard`
  4. class binders (no `Section` heading: render `{deck}` directly in `div.ch-cl-deck`)
  5. merged `ClassStatusCard`
- Desktop keeps `Section` and `.ch-cl-side`.
- Pass `week.events` and `week.dates` into `TodayClasses` for the team-event ribbon. They are already loaded; see `conflicts` at 263–272.

### 3.2 `screens/classes/parts.tsx` (499 lines)

- **`TermBar`** (108–219), with `termFigures` at 100:
  - Delete the compact branch (133–150, `.ch-cl-tb.is-compact`, `.ch-cl-tb__one`) and the `compact` prop.
  - Add a new exported `TermCard` (phone), built on `termFigures`, deep green `--ch-green-800` flat fill:
    - `.ch-cl-term__wk` week well "11 of 17"
    - `h2` "Week 11" and "6 weeks left · finals start Dec 9"
    - overlap chip button `.ch-cl-term__over` → `onOverlaps` (existing prop)
    - credits bar `.ch-cl-term__credits`, one segment per class tone, with "6 classes / 15 credits"
    - term line `.ch-cl-term__line` with a Today marker and finals and term-end ticks
    - "Soon" list `.ch-cl-term__soon` in two columns
  - The full desktop `TermBar` stays as is.
- **`TodayClasses`** (465–499):
  - becomes a `Surface variant="card"` with title "Today" and the weekday on the right
  - Rows use `GroupRow`, each with:
    - `span.ch-cl-today__t` as a fixed 58pt column, the number over AM/PM, `ch-num`, `white-space:nowrap`
    - tone dot `i.ch-cl-dot.ch-cl-t-{tone}`
    - name and room
    - chevron
  - On a day with no classes:
    - title "No classes today"
    - "Next: Monday, Nov 2" line (keep `data-ch-code="CH-12308"`)
    - a new `DayRibbon` (7 AM–5 PM) for the next class day: classes in their tone, plus `week.events` that fall on that day in green
    - `DayRibbon` is a new small component in parts.tsx. `TodayStrip.tsx` is the multi-lane coach strip, so it is a reference only.
  - Dedupe:
    - `meeting()` keys by `${c.id}|${c.start}`
    - **also** by `${(c.code||c.name).toLowerCase()}|${c.start}`, because demo duplicates are separate rows with separate ids (notes PR 6)
- **`OverlapsCard`** (350–410, `.ch-cl-over`):
  - `Surface variant="card"` titled "Overlaps", with an amber `Badge` "1 this week" in the title row
  - bus icon chip, the travel line, affected classes with start times
  - `footerNote` "Your coach sees this overlap too."
  - warning tokens only, and drop any tinted fill
- **`ClassCard`** (227–334): JSX unchanged. Its look comes back by deleting the phone flattening in CSS (§3.3). Add the amber travel flag in the dashed footer if it is not already there, and check `.ch-cl-card__foot`.
- **`CoachNote`** (413–433, `.ch-cl-card2 .ch-cl-note`) and **`ClassStatusPanel.tsx`** (Switch at 193, `.ch-ca-panel` in `class-awareness.css`):
  - New `ClassStatusCard` in parts.tsx, one card:
    - row 1 is the existing `ClassStatusPanel` content rendered `bare` (add a `bare` prop that drops its own panel chrome)
    - then "What your coach sees" (CoachNote body)
  - Copy unchanged.
  - When `statusWrites` is off, it renders CoachNote only.
- **`ClassDetail.tsx`**: already a `Modal`, which is a phone bottom sheet with `.ch-grab` and `useSheetDrag` swipe. Only CSS is needed:
  - 20px radius
  - tone header
  - `.ch-cl-facts` two columns on phone (today it is one column at classes.css 1350–1361)

### 3.3 `styles/classes.css` (2729 lines)

Delete or replace:
- `.ch-cl.is-phone{padding:16px 16px 110px}` at 42 → padding `0 var(--ch-page-x-phone) 110px`. page-spacing requires `var(--ch-page-x-phone)` (ROOTS line 52).
- **Three stacked phone layers.** Collapse them into one block, `/* Classes · phone (Oct 31 redesign) */`:
  - (a) `@container chcl (max-width:640px)` 1275–1347: keep only the grid-to-one-column rules that desktop narrow widths need. Move phone looks out.
  - (b) unconditioned "iPhone brief" 1363–1455 (`.ch-cl-tb.is-compact`, `.ch-cl-tb__one`, `.ch-cl-today*`, container 1440–1455): **delete**.
  - (c) `@media (max-width:820px)` "Mobile clubhouse pass" 1472–1859: **delete** 1477 (`.ch-cl-h` double rule), 1501–1532 (tb compact), 1534–1569 (today), 1578–1625 (over/card2 flattening), 1627–1703 (`.ch-cl-sec`, deck, **card flattening**), 1704–1750 (add tile). Keep 1570–1577 (grid and side stack) and 1752–1858 (no-team and skeleton), restyled for cards.
- Keep 2150–2183 (sticky timetable head), 2217–2237 (text floor), 2720–2729 (hit areas).
- New: `.ch-cl-term*`, `.ch-cl-today*` (card version), `.ch-cl-ribbon*`, `.ch-cl-statuscard`.
- Class binders on phone: tone fill, 16px radius, `--ch-card-ring` and `--ch-card-shadow`. The ring is not a left border (no accent border).
- Dark tones at 1861–1912 (today mist `#232c2e / #b9cacd / #3b494c` etc. at 1864–1888) become the mock's values:
  - mist t `#1E2A2D`, f `#B9CCD1`, b `#2F3E42`
  - clay `#2C221D / #E0C2B0 / #41322A`
  - sand `#2B2619 / #DFCB9F / #423928`
  - stone `#25231F / #D3CDC0 / #39362F`
  - sage `#1E271F / #B8CEBB / #2E3B30`
  - The remaining tones (if more than five) follow the same recipe: deep tinted fill, light tone ink.
- `class-awareness.css` `.ch-ca-panel`: add the `.is-bare` variant.

### 3.4 Skeleton: `screens/classes/ClassesSkeleton.tsx`

`LargeTitleSkeleton` at 65 gets a `context` bar. The term card block and the today card block replace the compact bar and the `Section` head.

### 3.5 Classes tests

- `screens/classes/__tests__/classes.test.tsx`:
  - 583–585 (skeleton `.ch-cl-sec > .ch-sec__head`): on phone, assert the card head instead. Desktop keeps it.
  - 1020 `.ch-cl-over .ch-cl-key` and 1125: recheck against the card version.
  - 1206–1295 (phone):
    - **1270–1280** assert `.ch-cl-tb.is-compact .ch-cl-tb__one` and no `.ch-cl-tb__line`: invert to assert `.ch-cl-term` with `.ch-cl-term__line` and no `.is-compact`
    - **1288** "No classes today · next": update to "No classes today" plus a "Next: …" line
  - Add:
    - the + opens a sheet with Add class and Import schedule
    - TodayClasses dedupes two rows with the same code and start
    - the time column is one `ch-num` node
    - the "Your classes" heading is absent on phone
    - the context line text under the title
- `class-awareness-player.test.tsx` 146, 292: `ClassStatusPanel` inside `ClassStatusCard`, and the switch label is unchanged.
- `classes-parity.test.ts`: phone and desktop show the same facts.
- `styles/__tests__/contrast-tokens.test.ts` 425 (`classes.css .ch-cl-card__week em`): rerun with the new dark tones.
- `look-feel-pass-css.test.ts` asserts `'.ch-cl-h h1 {'` (desktop): keep it.
- `page-spacing.test.ts` ROOTS 52 `.ch-cl.is-phone`: must still pass.

---

## 4. Roster, phone (notes PR 3, half of BUILD_BRIEF PR 8)

### 4.1 `screens/roster/RosterPhone.tsx` (608 lines)

Today:
- props 52–88
- counts 113–116 (active, injured, away)
- sort `useChSessionState('phoneSort','avg')`, `chooseSort` in `startTransition` (FLIP)
- `PhoneTop` with UserPlus "Invite players" 134–149
- `.ch-rsm-head` / `.ch-rsm-kicker` ("Varsity · 7 active · 1 injured · 1 away") with `<LargeTitle as="p" hidden>` 151–180
- `RequestsBanner` 184–194
- `.ch-rsm-sort` with a "Sort by" span and `Segmented` size sm (avg/sg/name) 236–253
- `RosterPhoneList` 254–256
- profile `PhoneScreen` and `PhoneBar` 261–286
- `RosterPhoneList` 312–361 (`FormRange`, `ul.ch-rsm-panel.ch-rsm-list` "Active players", `h2.ch-rsm-sec#ch-rsm-inactive`)
- `RosterPhoneRow` 370–442 (Avatar md, `ClassStatusLine`, `.ch-rsm-row__spark` `FormLine bare 48×20`, `.ch-rsm-row__v`, `.ch-rsm-row__chev`, `PlayerPeek`, `ViewTransition`)
- `RequestsBanner` 452–480 (`.ch-rsm-banner`), `RequestsSheet` 487–560, `PlayerActions` 566–608

Change:
- **Head:** replace 151–180 with:
  ```tsx
  <LargeTitle as="p" hidden context={data.team.name}>Roster</LargeTitle>
  ```
  The kicker's counts move into the team card. Keep `PhoneTop` 134–149 exactly.
- **New `RosterTeamCard`** in a new file `screens/roster/RosterTeamCard.tsx`. It is shared with desktop (§5) and the player view.
  - Props: `{ team, season, players, waiting?: number, role: 'coach'|'player' }`
  - Deep green feature card `.ch-rs-team`:
    - "Varsity · Fall 2026"
    - "n active · n injured · n waiting" (`waiting` for the coach only, from `jr.reqs.length`)
    - total count large on the right
    - class-mix bar `.ch-rs-mix` with one `i` per year (`--y: var(--ch-yr-…)`, `flex-grow` by count) and legend `.ch-rs-mix__lg`
    - footer: top five coins (`Avatar year size="sm"`) and a mint chip "76.2 avg"
  - Counting and top-five are data-agent functions. Put them in `screens/roster/format.ts` as `teamCardFigures(players)`.
- **New `RosterLeaders`** in `screens/roster/RosterLeaders.tsx`, coach only:
  - `div.ch-rs-ldrs` scroll-snap row, full bleed (`margin-inline: calc(-1 * var(--ch-page-x-phone))`, `padding-inline: var(--ch-page-x-phone)`)
  - three `button.ch-rs-ldr` cards:
    - `width:min(62%,220px)`
    - `background:color-mix(in srgb,var(--y) 11%,var(--ch-card-bg))`
    - ring `color-mix(… var(--y) 24% …)`
  - Each card: label and icon, figure large, coin and name. Tap → `onOpen(id)`.
  - Picks come from `leaderPicks(players)` in format.ts (data agent).
  - "Needs a look" uses the existing `attention` field (`attentionFor`, data/roster.ts 143), and the card is hidden when nobody has it.
- **Requests:** `RequestsBanner` (452–480) becomes a `GroupList` with a single row inside a card:
  - stacked coins (with `year` from `classYearKey(r.classYear)`), names, green count badge, chevron
  - Keep the component name and the `onOpen` behaviour.
  - `RequestsSheet` (487–560):
    - use `classYearLine` at 520
    - Avatar size 44 → `'lg'`, plus `id={r.playerId}` and `year`
    - keep Decline/Approve, `.ch-rsm-code` team code, Approve all
- **Sort:** 236–253 becomes `div.ch-rsm-sortbar.ch-stickybar` holding `Segmented` alone (no "Sort by" span, keep `label="Sort by"` for assistive tech). Do not restyle `.ch-seg` here: roster.css 1250 only adds the hit area, so keep that.
- **List:** `RosterPhoneList` 312–361:
  - `ul.ch-rsm-panel.ch-rsm-list` becomes `<Surface variant="card" footerNote="Bars are the last five rounds. Green beats the team average."><GroupList …>`
  - Keep `FormRange` around it. Pass the team mean to rows.
  - Inactive: replace `h2.ch-rsm-sec#ch-rsm-inactive` with a second `Surface variant="card" title="Inactive"`. Keep the id on the card head for the anchor.
- **Row:** `RosterPhoneRow` 370–442:
  - `Avatar size="md" id={p.id} year={classYearKey(p.classYear)} dim={p.status!=='active'}`
  - name, plus a Captain tag (see risk R1: **no data**, so omit it)
  - note line: `ClassStatusLine` gets the tone dot. Keep the amber or green note from `rowNote`/`attention`.
  - replace `.ch-rsm-row__spark` `FormLine` with `FormBars data={p.trend} mean={teamMean}`
  - figure `.ch-rsm-row__v`, with HCP or "SG / rd" under it
  - chevron
  - Keep `ViewTransition` and `PlayerPeek`.
  - Inactive rows get an amber chip: "Injured" / "Away" from `availability`. "· back Nov 16" has no field, see R2.

### 4.2 `screens/roster/TeamRosterPhone.tsx` (144 lines), player view

Today: `PhoneTop` 30; head, kicker and LargeTitle 32–49; `.ch-rsm-sort` "Sort by" with `Segmented` name/class/hcp (`redraws`) 64–79; `TeamCoachesPhone` 102–127 (`h2.ch-rsm-sec`, `.ch-rsm-row--static`); `TeammateRow` 130–144; team.ts `teammateLine` gives "You · Junior".

Change:
- head → `LargeTitle context={team}`
- `RosterTeamCard role="player"` (no waiting)
- sort → `.ch-stickybar` without the caption
- `TeamCoachesPhone` → `Surface variant="card" title="Coaches"` with `GroupList` (coach coins keep `data-tone`)
- players card: `TeammateRow` gets
  - `Avatar year`
  - sub-line `classYearLine(...)` ("Senior · Class of 2027"), so `teammateLine` changes or a new `teammateSub`
  - a "You" chip (`.ch-rsm-you`) instead of the "You ·" prefix
  - HCP on the right
  - not tappable (`--static` stays)
- `ChTeammate` has `gradYear` and `isYou` (roster-player.ts 19–29). Check it carries the `classYear` label. If it doesn't, derive the key from `classYearLabel(gradYear)` client side, which is existing data.

### 4.3 `screens/roster/RosterProfile.tsx` (191 lines)

Today: identity line 44–51 (repeat source); `.ch-rsm-hero` with Avatar xl 64–83; `.ch-rsm-figs` 85–98; `LegsCaption` 99; trend panel `.ch-rsm-panel__h` from 108; recent rounds `.ch-rsm-rd`; about `.ch-rsm-facts`.

Change:
- Hero centred:
  - `Avatar size="xl" id year dim`
  - name
  - hometown line (Captain omitted, R1)
  - `span.ch-rs-ychip` year chip (`--y` at 14% background, 62% ink mix; mock `.ychip`) with `classYearLine`
- Message / Plan 1:1 unchanged.
- `.ch-rsm-figs` → `Surface variant="card"` with three figures.
- Trend → card. Recent rounds → card with score wells. About → card.
- No left accents.
- The push uses the existing `PhoneScreen` (the UIKit push is already there).

### 4.4 `styles/roster.css` (2818 lines)

The phone block is 1196–1969 (one `@media`):
- root `.ch-rsm` 1215: keep `var(--ch-page-x-phone)` (page-spacing ROOTS 48)
- head and kicker 1227–1238 → `.ch-lt` placement only
- `.ch-rsm-sort` 1239–1254 → rename to `.ch-rsm-sortbar`. Keep the 1250 hit area.
- `.ch-rsm-panel` "No card" 1256 → delete
- list seams 1260–1272 → delete (GroupList draws the separators)
- `.ch-rsm-sec` double rule 1275–1284 → delete
- rows 1286–1400 → rewrite for the card row: `__spark` becomes `__bars`
- profile 1402–1684 → cards
- banner 1685–1788 → one card row
- requests 1789–1907 → keep, update the coin
- actions 1908–1969 → keep
- player static rows 1971–2010 → card rows
- text floor 2015–2023 → keep
- dark 2383–2440 → add the team card, leaders and chips
- **reorder VT 2444–2457** (`ch-rsm-reorder`, `--ch-dur-vt-push`): set to 360ms `cubic-bezier(.22,1,.36,1)` (notes §4). Reduced motion → crossfade.
- **print block about 2614–2780** references `.ch-rsm-sort`, `.ch-rsm-banner`, `.ch-rsm .ch-avatar`, `.ch-rsm-head`, `.ch-rsm-list`, `.ch-rsm-row`. Update it for the renames, and hide `.ch-rs-ldrs` and `.ch-stickybar` in print.
- New: `.ch-rs-team*`, `.ch-rs-mix*`, `.ch-rs-ldrs`, `.ch-rs-ldr`, `.ch-rs-ychip`, `.ch-rs-capt` (reserved), `.ch-rs-inj` (amber chip).

### 4.5 Skeleton: `screens/roster/RosterSkeleton.tsx`

`LargeTitleSkeleton` at 56 gets `context`. Add a team-card block, a leaders row (coach), a sticky-bar block and a card of rows.

### 4.6 Roster phone tests

- `screens/roster/__tests__/roster.test.tsx`:
  - **776, 972** assert `.ch-rsm-kicker` text 'Varsity · 7 active · 1 injured · 1 away': move them to `.ch-rs-team` counts, and the kicker is gone.
  - **785–803**: sort, and the `.ch-rsm-row__spark` row label become `.ch-rsm-row__bars` with the same label words.
  - **816, 838, 985, 994, 1098**: identity strings (see §2.4).
  - Add:
    - leaders render three cards, and "Needs a look" is hidden when no row has attention
    - the team card counts (with "waiting" for the coach, not the player)
    - year coins (`data-year`) on rows, `data-dim` on inactive
    - no "Sort by" text node
    - the sticky bar class
- `roster-player.test.tsx` 418, 464 (kicker): the team card, the "You" chip, and "Senior · Class of 2027".
- `roster-sort.test.tsx`: unchanged logic.
- `roster-premium.test.ts`, `wiring-p003-roster.test.tsx`: selectors.
- `screens/roster/__tests__/` (class-line, context-menu, peek-reads, requests-link, requests-stale-hint, spread-axis): rerun. `requests-link` checks `?tab=requests` opens the sheet, so it must still pass.
- `native-nav.test.tsx` (`.ch-rsm-row__v`): keep the class name.
- `page-spacing.test.ts`: add `.ch-rs-ldrs` to PHONE_BLEEDS with `calc(-1 * var(--ch-page-x-phone))`.
- `large-title.test.tsx` 55 uses a `.ch-rsm-head` fixture: update it if the head class changes, or keep `.ch-rsm-head` as the wrapper.

---

## 5. Roster, desktop (notes PR 4, half of BUILD_BRIEF PR 8)

### 5.1 `screens/roster/Roster.tsx` (1081 lines)

Today:
- phone branch → `RosterPhone` 444–462
- `main.ch-rs` from 470
- `.ch-rs-head` 471–515
- `RosterRequests` 519–521
- `.ch-rs-attn` "Needs a look" 535–548
- `RosterSpread` 580
- `.ch-rs-bar` (search, `PillGroup`, layout toggle, `Segmented` avg/hcp/rounds/name) 581–632
- `.ch-rs-body`, `RosterList` and `RosterPeek` 634–668
- `RosterList` 682–869:
  - faces view 734–785 (Avatar 76, `FormLine` 150×30)
  - table `SideScroll.ch-rs-list role=table` 789–865: header "Last 7 rounds · range" at 797, row Avatar lg at 833, `FormLine` 120×30 at 847
- `RowMeta` 1053

Change:
- Under the head, a top row `div.ch-rs-top` (grid `1.2fr repeat(3,1fr)`, mock `.dldrs`) with `RosterTeamCard role="coach"` and `RosterLeaders layout="grid"`.
- `.ch-rs-attn` (535–548) duplicates "Needs a look". ~~Ask Nick whether to keep both. Default: keep `.ch-rs-attn`.~~ (fixed 4 Nov: DECISIONS settles this. The desktop "Needs a look" strip is removed under the lane flag. Delete the `.ch-rs-attn` render and its CSS under `[data-ch-crh='on']`; flag off keeps it as main.)
- Table: wrap it in `Surface variant="card"`, with the header row `position:sticky;top:0`. SideScroll keeps the horizontal scroll.
- Header at 797 → "Last 5". Cell at 847 → `FormBars data={p.trend}` (`slice(-5)` in the component).
- Avatars at 833 and the faces view → `year={classYearKey(p.classYear)}`, `dim` for inactive.
- Faces view `FormLine` at 150×30: leave it, or ask. The notes only mention the table.

### 5.2 `screens/roster/RosterPeek.tsx` (541 lines)

Today: `RosterPeek` 37; `PeekBody` 93; facts "Class of" at 120; Avatar 96 at 152; `h2` 154; `.ch-rs-peek__sub` 155–156 (repeat bug); `LegsCaption` 272; HelmPanel 326; `CoachNote` 356 (a different component from the Classes one); AvailabilityPanel 455.

Change:
- Avatar 152 gets `year` and `dim`.
- Under the `h2`, the `.ch-rs-ychip` year chip with `classYearLine`. Replace the sub at 155–156.
- Drop the "Class of" fact at 120 if the chip carries it, so it isn't said twice.

### 5.3 `styles/roster.css` desktop (Ledger from 2038)

Add `.ch-rs-top`, the card table (sticky `thead`) and `.ch-rs-list .ch-formbars` sizing.

### 5.4 Roster desktop tests

- `roster.test.tsx` desktop cases: the "Last 5" header, `FormBars` in cells, `data-year` on table avatars, the peek chip text with no repeat.
- `peek-reads.test` and `spread-axis.test`: rerun.
- `screens/roster/format.ts rosterPeek` (sub = classYear at 97) uses `classYearLine`. Update its test.

---

## 6. Coach Home (notes PR 5, BUILD_BRIEF PR 10)

Before building, check `stats-and-home-phone.html` (handoff folder) and the Stats thread's PR 6, so the cards under the hero match player Home.

### 6.1 `screens/home/HomePhone.tsx` (623 lines)

Today:
- `HomePhone` 57–138: `usePhoneHero(true)`
- `header.ch-hm-hero` 74–94: date, `h1` greeting, `.ch-hm-hero__brief`, `CoachQueue phone`, `PageRefreshNotice`, `Day`/`DayCard`
- `.ch-hm-body` 96–132: `ClassHomeLine`, `LiveNowCard`, `Later`/`Today`, `Form`, `TeamLegsPhone`, `WeekStrip`, `Rounds`
- `Day` 143, `Later` 152, `UpNext` (exported, used by the player) 170, `NoEvents` 222
- **`Today`** (exported, shared with `PlayerHomePhone`) 263–337: `.ch-hm-tl`, `.ch-hm-now` "Now/Next", `.ch-hm-tl__w` conflict icon
- `Form` 357–409: `.ch-hm-form`, `__top`, `__svg` 320×64, `__figs` Rounds/GIR/Putts
- `WeekStrip` (exported, shared) 411–440
- `FailedSec` 449
- `Rounds` 460–523: `FormRange`, `.ch-hm-list`, Avatar 38 with id, `.ch-hm-rd`, spark `FormLine` 64×18, `.ch-hm-score`
- `roundPeek` 535, `RoundSheet` 542

**The "Home ⌄" header row with crest, dot and bell is the shell TopBar in `data-phone-hero` mode, not page markup.** Keep it as it is (shell.css 1305–1380).

Change:
- Hero JSX stays (date, `h1`, brief with its sparkle icon). Add the sparkle `Icon` if it is missing. The fill is CSS (§6.6).
- **`Today`** (263–337): it is shared, so add a `variant?: 'card'` prop that the coach passes, or coordinate with PR 6 so both use the card.
  - `Surface variant="card"` with a fixed time column
  - a clash shows an amber `Badge` "Clash" instead of the `.ch-hm-tl__w` icon only
  - the next item gets a "Next" chip; remove the `.ch-hm-now` mint row highlight
- **`Form`** (357–409):
  - `Surface variant="card" title="Team scoring"`
  - the average large with a real text label in the DOM, "Team scoring average · last 10 rounds" (from the `::after`)
  - the delta
  - the line chart with stroke `var(--ch-chart-line)`
  - Rounds / GIR / Putts under a hairline
  - The colour rule (standard error) stays as is.
- **`WeekStrip`** (411–440, shared): today ringed in green, dots for events. CSS only if possible.
- **`Rounds`** (460–523):
  - card with 64pt `GroupRow`s
  - `Avatar size="lg" id year={classYearKey(row?.classYear)}`, where `row` is the leaderboard row found by `r.playerId` (`trends`, already passed). A missing row → tone fallback.
  - spark `FormLine` stays (the notes keep "spark" here)
  - score well `.ch-hm-score`
  - red for under par only, via `--ch-score-under`

### 6.2 `screens/home/DayCard.tsx` (420 lines)

Today: `dayPhase` 45; `DayCard` 63; `EventCard` 67–138 (`section.ch-hm-next.ch-hm-day`, kicker plus `.ch-hm-next__when` countdown, `h2` link, place, `.ch-hm-stack` Avatars `name={n}` with **no id or year**, "x of n going", actions); `Recap` 141; `LaterToday` 184–260; `SinceYouLooked` 376.

Change: `EventCard` on the coach phone becomes the glass card on the hero `.ch-hm-day.is-glass`:
- type and countdown chip
- `h2` at 22pt
- time · place
- coin stack and "4 of 6 going"
- chevron
- For year coins, pass `e.inviteeIds[i]` as `id` and the year from a `Map<playerId, classYear>` built from `data.leaderboard.rows` (new prop `years?: ReadonlyMap<string, ChYearKey>` on `DayCard` and `EventCard`).
- Invitees without a match (coaches) keep the tone.
- Keep `invitees` and `inviteeIds` index-aligned. Check the loader guarantees this; if not, fall back to name-only coins. (fixed 4 Nov wiring: the loader does not guarantee it. `data/home.ts:757` drops ids with no known name from `invitees` while `inviteeIds` keeps every id (781). Pass years only when `invitees.length === inviteeIds.length`, the same test `going` uses at 779; otherwise name-only coins. The year map is a new `yearById` on `ChCoachHome` built from the roster read at 331, not `data.leaderboard.rows`, which only holds players with season rounds.)

### 6.3 `screens/home/CoachQueue.tsx`

Today `queueParts`; `CoachQueue({queue,covered,phone})` renders `.ch-hm-queue`, `__k`, `__v`, `__a`.

Change (phone): capsules on the green, `a.ch-hm-cap`, 34pt drawn inside a 44pt hit area (`::before` inset −5px), with a bold count. Same links. Desktop untouched.

### 6.4 `screens/home/TeamLegs.tsx` (244 lines)

Today: `TeamLegs` (desktop) 95; `PeopleLine` 184; `TeamLegsPhone` 204–244 (`.ch-hm-sec.ch-hm-legs`, `ul.ch-hm-legs__list`, rows `__l`, `__sg`, `__s`, `__c`, `__who`).

Change: `TeamLegsPhone` becomes `Surface variant="card" title="The team's game" footerNote="Approach and putting cost the most."` with a 2×2 grid `.ch-hm-legs__grid` split by hairlines. Each cell has:
- SG large
- `i.ch-hm-legs__bar` diverging from a centre zero, gain or loss, growing once on first paint via `@starting-style` or a class set once (never on re-render; static under reduced motion)
- the stat
- the trend
- `PeopleLine` with names as links to the player's Stats (existing hrefs)

Match the player's `.ch-ph-leg` markup from PR 6. If PR 6 ships first, extract a shared `LegCell`.

The caption text is a data-agent output if it is computed. Otherwise it is static copy per the notes.

### 6.5 Skeletons: `HomeSkeleton.tsx`, `SkeletonPhoneHero.tsx`

The hero block takes the green fill and bottom radius. The cards below are card-shaped.

### 6.6 `styles/home.css` (4506 lines)

Collapse into **one** coach-phone block. Phone blocks today:
- 851–864
- 878–976 (skeleton, `.ch-hm-skel__hero` 889)
- **982–1656 "Phone v2"**: `.ch-hm-hero` green gradient plus radial glows 993–1003, serif greeting 1011
- 1820–1825, 2457–2478
- **2706–3182 "Mobile clubhouse pass"**:
  - `.ch-hm-hero` parchment gradient 2707–2713 with the `::before` lip
  - `.ch-hm-next` ivory with a 2px green top rule
  - `.ch-hm-score.is-under em{color:#9E3B2E}` 2883–2885
  - `.ch-hm-sec__h` hairline 2917–2922
  - Form `#3F7556` 2959, 2963
  - `.ch-hm-form` double rule 3109–3112
  - **`::after` label 3134–3139** (dark 3674)
- **3185–3212 "in-app chassis"**: `.ch-hm-hero{background:none}`, greeting `--ch-type-34-strong` in ledger ink. **This is the rule that removed the green.**
- 3221–3377 (both roles: `.ch-hm-sec__h h2`, `a.ch-hm-next` press)
- 3385–3520 (player)
- 3537–3542, 3620–3677 (dark phone), 3682–3883 (day card), 3886–3897, 3901–3905, 4129–4138
- 4352–4484 (queue and legs)

Plan:
1. New block `/* Coach Home · phone (Oct 31 redesign). The one phone block: do not add another. */`. Scope it `.ch-hm:not(.is-player-home)` or `.ch-hm-hero:not(.is-player)` so player Home (PR 6) is untouched.
2. Hero:
   ```css
   .ch-hm-hero:not(.is-player){
     background:var(--ch-frame);
     border-radius:0 0 22px 22px;
     margin-inline:calc(-1 * var(--ch-page-x-phone));
     padding:8px var(--ch-page-x-phone) 20px;
     color:var(--ch-on-green-ink)
   }
   ```
   - greeting 28–34pt (`--ch-type-large-title`), ivory
   - date and brief at ≥ 72% (`color-mix(in srgb, var(--ch-on-green-ink) 72%, transparent)`)
   - no `::before` lip, no radial glow, no text-shadow
3. Delete from 982–1656, 2706–3182 and 3185–3212 every coach hero, next, sec__h, form, score and legs rule that the new block replaces. Move the `::after` label (3134–3139, dark 3674) into JSX (§6.1).
4. Replace `#3F7556` → `var(--ch-chart-line)` and `#9E3B2E` → `var(--ch-score-under)`.
5. Delete `.ch-hm-sec__h` double rules on coach phone, and `--ch-ledger-rule-double` uses.
6. Dark: one sub-block inside it.

### 6.7 Coach Home tests

- `screens/home/__tests__/home.test.tsx`:
  - 402 hero, 415 Today, 426 form: the form label is now a text node, so assert the text
  - 499–559, 1114–1196, 1269
  - 1394 phone legs: the 2×2 grid, 4 cells, names as links
- `home-consumer-truthfulness` (`TeamLegsPhone`): figures unchanged.
- `home-change-marks`: rerun.
- `player-home-phone.test.tsx`: **must pass unchanged**, which proves player Home did not ripple.
- `home-phone-figs-css.test.ts`: selectors.
- `page-spacing.test.ts` PHONE_EDGES 104–105 (`.ch-hm-hero`, `.ch-hm-body`): the hero now bleeds, so add `.ch-hm-hero:not(.is-player)` to PHONE_BLEEDS and keep the inner padding on `var(--ch-page-x-phone)`.
- `shell-reach-css.test.ts` 42–129 (`[data-phone-hero]` bell and title): unchanged.
- Add:
  - the hero has no `background:none` on coach phone (CSS test)
  - no hex colours in the coach phone block
  - the Up next coin stack carries `data-year` for invitees found in the leaderboard
  - `CoachQueue` capsule hit area ≥ 44

---

## 7. Demo data (notes PR 6)

Not designed here. The data agent owns the formulas. Files to look at:
- `data/classes.ts` / `classes-shape` loader and the import (`screens/classes/import-read.ts`, `writes.ts`) for 14 rows for 7 classes
- the demo seed script under `scripts/` or `supabase/seed*`
- missing `graduation_year` in the demo seed

The UI dedupe in §3.2 is a guard, not the fix.

---

## 8. Phone flattening blocks to remove (index)

| File | Lines | What it flattens |
|---|---|---|
| `styles/ui.css` | 239–245, dark 1154 | every `[data-tone]` avatar to neutral. Year coins avoid it by not setting `data-tone`. |
| `styles/classes.css` | 1363–1455 | iPhone brief: compact term one-liner and today rows |
| `styles/classes.css` | 1472–1859 | Mobile clubhouse pass: `.ch-cl-h` double rule, cards, deck, over, card2, add tile |
| `styles/roster.css` | 1256–1284 | `.ch-rsm-panel` "No card", list seams, `.ch-rsm-sec` double rule |
| `styles/home.css` | 2706–3182 | Mobile clubhouse pass: parchment hero, sec__h, form double rule, `::after` label |
| `styles/home.css` | 3185–3212 | in-app chassis `background:none` on the hero |
| `styles/home.css` | 982–1656 | old Phone v2 hero gradient and glows (replaced, not restored) |

---

## 9. Risks and surprises

- **R1. No captain data.** `ChRosterPlayer` (data/roster.ts 35–71) and `golf_team_members` (src/lib/types/database.ts 18115) have no role or captain column. The notes forbid new queries. **Omit the Captain tag and profile line**, and reserve `.ch-rs-capt`. ~~Ask Nick, or open a data ticket.~~ (fixed 4 Nov: settled by DECISIONS, no Captain tag. Do not reserve a visible slot; `.ch-rs-capt` stays unused.)
- **R2. No return date.** "Injured · back Nov 16" has no field. Only `availability` and the free-text `availabilityCoachNote` exist. Show "Injured" / "Away" alone, or the coach note if Nick accepts free text. (fixed 4 Nov: settled by DECISIONS, the plain "Injured" chip with no date, and injured players count as active. The coach note stays in its own profile card, not in the chip.)
- **R3. The hero bar and hero fill don't match.**
  - In `data-phone-hero` mode the shell bar paints `var(--ch-light-bar), var(--ch-green-800)` (shell.css 1305–1310, a radial light over `#0b3a25`).
  - The lip corners under it paint `--ch-frame` (`#0a331f`, 2466–2480).
  - A hero filled with `--ch-frame` would show a seam against the bar, and the lip corners vanish into it.
  - Options:
    - (a) change only the hero-mode bar background at shell.css 1306 to `var(--ch-frame)`. This is CSS, not TopBar.tsx or phone-chrome.tsx, but it changes the bar's look on both Homes, so Nick must say yes.
    - (b) fill the hero with the same stack as the bar, but `--ch-light-bar` is a radial light behind text, which breaks "no glow".
  - Recommend (a) with a Stats-screenshot comparison. Coordinate with PR 6, which has the same bar.
  - (fixed 4 Nov: settled by DECISIONS, option (a). The hero-mode bar becomes `--ch-frame` on coach Home under the lane flag. On player Home it changes only when player Home's hero also paints `--ch-frame` (stats-home PR 6), so scope the rule as CP-02.3 says.)
- **R4. The notes' "`.mh-hero`" does not exist.** It is `.ch-hm-hero`; `.mh-hero` is only in a comment naming the old board file (`m-home.css`).
- **R5. "LargeTitle is hidden" is not literal.** `hidden` is `aria-hidden` only. The title renders today under a kicker or term line. The work is reordering it, adding a context line and removing the flattening around it.
- **R6. B19 vs year colours.** On phone every avatar is neutral today (D-43). Year coins will be the first coloured coins on phone. BUILD_BRIEF PR 7's "every avatar" conflicts with the notes' opt-in prop; follow the notes.
- **R7. Shared Home exports.** `Today`, `UpNext`, `WeekStrip` and the `.ch-hm-hero` class are used by `PlayerHomePhone.tsx` (header `.ch-hm-hero.is-player` at 54). Scope every change with `:not(.is-player)` or a `variant` prop, or land with PR 6.
- **R8. Surface is used by 12 screens.** Add `variant="card"`; don't restyle the default.
- **R9. Duplicate classes are separate rows.** A dedupe by id plus start won't catch them; use code or name plus start (§3.2). The real fix is PR 6.
- **R10. "Last 7" vs "Last 5".** The desktop header says "Last 7 rounds · range" and `trend` holds up to 7 (`TREND_LENGTH`). Bars use `slice(-5)`. The range domain must be computed on the same five, or bars won't fill the height.
- **R11. Up next coins have names only.** `invitees: string[]`. A year needs `inviteeIds` plus the leaderboard `classYear`. Coaches and unmatched invitees fall back to the tone.
- **R12. The `classYearLabel` change ripples.** About 9 callers outside these screens (messages, qualifiers, coachhelm, stats, calendar), plus logic.test.ts 41. Keep the display fix (`classYearLine`) separate from the data agent's label change.
- **R13. CI and catalog.** `preview/component-catalog.json` lists `ch-rsm-banner`, `ch-cl-tb__one` and others, so regenerate it, or `clubhouse:catalog -- --check` fails.
- **R14. The roster print block** (roster.css about 2614–2780) uses selectors this plan renames.
- **R15. The leaders row is full bleed**, so add it to the page-spacing PHONE_BLEEDS list, and the coach hero too.
- **R16. Scroll-driven animation support.** `animation-timeline` is Safari 18+ and Chrome. Older iOS falls back to a static title, which is acceptable. The scrolled threshold moves from >0 to >8 in `large-title.tsx`.
- **R17. `.ch-rs-attn` "Needs a look"** already exists on desktop and overlaps the new leader card. Decide whether to keep both. (fixed 4 Nov: settled by DECISIONS, the strip is removed. See §5.1.)
- **R18. ClassDetail is already a bottom sheet** (`Modal` with `.ch-grab` and `useSheetDrag`). The notes read as if it needs converting; only CSS is needed.

---

## 10. Acceptance per PR (from the notes)

For each screen, in light and dark:
- 390pt with a 16px edge and 430pt with a 20px edge, no horizontal scroll, time columns one line
- Text Size at Default and at the largest standard size
- Reduce Motion and `[data-motion='off']`
- AA contrast
- no left accent borders, no gradients behind text (except the `Segmented` chip), no mint rows, no count-ups
- Playwright screenshots against the design page
- compare the bar against a Stats screenshot

---

## Completeness pass, 4 Nov 2026

Rows added in the shape of §9 (bold id, then the rule). Ids CP-02.1 to CP-02.8. The 05, 06, 07 and 08 sections of the same name hold the screens, specs, motion and checks these rows point to.

- **CP-02.1. Lane flag `clubhouse_classes_roster_home_v1` (PR 7).** The lane had none, and SHARED-8 needs one. Add it to `config/feature-flags.yml` in PR 7, copying the `coachhelm_track_record_v1` entry's shape (release, default false, all environments false; purpose "the refreshed Classes, Roster and coach Home; flag off renders today's screens"; cleanup plan: remove once the old phone flattening blocks are deleted), then run `npm run flags:generate` and commit the generated file. Read it once on the server in `routes/classes.tsx`, `routes/roster.tsx` and the Home route (05 CP.1; fixed 4 Nov wiring: the Home route is `src/app/golf/(dashboard)/dashboard/page.tsx`, and the shell reads it in `data/shell.ts` beside `classAwareness` at 266 so `ClubhouseFrame` can set `data-ch-crh` on `.ch-root` for the bar rule; `isFlagEnabled` is server only), and pass it down as a `crh` boolean prop to the screen roots (`ClassesView`, `RosterPhone`, `Roster`, `TeamRosterPhone`, `HomePhone` and the coach desktop Home). Each root sets `data-ch-crh="on"` on its frame root when it is on. All new CSS in `tokens.css`, `ui.css`, `classes.css`, `roster.css` and `home.css` is scoped under `[data-ch-crh='on']`, so flag off renders main exactly. New shared props (`Avatar` year tone, `Surface variant="card"`, `FormLine`) default to today's look and are only passed when `crh` is true. The preview route reads `&crh=0|1` to force either side. No migration is held for this lane.
- **CP-02.2. Coach Home desktop (PR 10).** 05 lists S-HOME.desktop under PR 10 and 06 §11.4 gives its values (hero card r16 with the `1fr 380` grid, then This week agenda, Team scoring, legs, Latest rounds and Leaderboard top 5), but §6 above plans phone files only. PR 10 also restyles the coach desktop Home body to 06 §11.4 and 06 CP-6.15. This plan did not record the desktop Home file names at 75b4956, so find the Home route's desktop branch by name before PR 10 starts and list its files in the PR description. (fixed 4 Nov wiring: at 03d9087 the Home route is `src/app/golf/(dashboard)/dashboard/page.tsx` 206 to 213, rendering `screens/home/CoachHome.tsx`; its desktop branch (47 to 100) uses `HomeActions.tsx`, `CoachQueue.tsx`, `LiveNowCard.tsx`, `Week.tsx`, `TeamForm.tsx`, `TeamLegs.tsx` (`TeamLegs` at 95), `LatestRound.tsx`, `Leaderboard.tsx`, skeleton `SkeletonDeskHead.tsx`.) The data is already loaded by the Home loader, so no new query. Gate it with the same `crh` prop. Tests: a desktop Playwright shot at 1280 (`home-desktop`, light and dark) and the 1024 and 768 widths from 06 CP-6.15, added to §6.7.
- **CP-02.3. Player Home bar scoping (PR 10, with stats-home PR 6).** The shell.css 1306 change to `var(--ch-frame)` applies on coach Home when `data-ch-crh="on"`. On player Home it follows (BUILD_BRIEF PR 10: "player Home's bar follows") only when player Home's hero also paints `--ch-frame`, which is stats-home PR 6's hero. Mechanism: player Home's root sets `data-ch-hero-flat` when PR 6's flat hero renders, and the player rule keys on that attribute plus this lane's flag. So a `--ch-frame` bar never sits over a `--ch-green-800` hero, whichever lane is on or off (05 S-HOME.player-boundary). The attribute is one line in `PlayerHomePhone.tsx`, which stats-home owns; it is listed in the lane report for that lane to add. `Today`, `UpNext` and `WeekStrip` change only through the coach's `variant='card'`; player Home's "Your game" belongs to stats-home and this lane draws nothing in it.
- **CP-02.4. Deep links and Back (PR 8, 9, 10).** `roster?tab=requests`, `roster?player=<id>`, `roster?invite=1` and `classes?new=1` open their sheet or profile at rest on arrival (`AnimatePresence initial={false}`). On read, `replaceState` to the bare URL, then `pushState` the param back, so Back closes the sheet or pops the profile before it leaves the screen. An unknown or removed player id opens the list with the toast in 06 CP-6.8. Files: `RosterPhone.tsx`, `Roster.tsx`, `ClassesView.tsx`, a shared `useDeepLinkSheet` hook in `shell/`. Flag off keeps today's handling.
- **CP-02.5. Notifications that land here (PR 8, 9).** No new notification types. Join request, availability change and class schedule rows already carry `action_url`; the bell opens them through `isSafeInternalPath`, `armRelink` and `router.push` as today. This lane only makes sure each target URL (CP-02.4) handles cold start, flag off and a stale target, as 05 CP.3 lists.
- **CP-02.6. Home "Waiting on you" rows (PR 10).** The queue (`data/home-queue.ts`) holds only `joinRequests`, `replies.missing`, `overdueTasks` and `unackedPosts`. Join requests go to `roster?tab=requests` (CP-02.4). Missing replies go to the Calendar event, overdue tasks to Team Hub tasks and unacknowledged posts to Team Hub announcements, through today's hrefs. Do not add Ask, Practice plans, Messages or Team Board capsules; the queue has no data for them and 05 CP.4 records that. Back from each target returns to Home at its scroll position.
- **CP-02.7. Busy and rollback (PR 8, 9).** Approve, Approve all, availability, note save and class save show the busy button in 06 CP-6.11 and ignore a second tap. On failure, roll back the optimistic change and show the toast; motion rows M-CRH-47 and M-CRH-48.
- **CP-02.8. Day and season rollover (PR 9, 10).** Home and Classes recompute "today" from the team zone (`todayIso`, `homeClock`) on focus and at midnight, and the year label follows the 1 Aug turnover through `lib/class-year.ts`. No timers beyond one midnight timeout per mounted screen.

Fixed in place this pass: §5.1 `.ch-rs-attn` (removed per DECISIONS), R1 (no Captain tag), R2 (plain "Injured"), R3 (option (a), scoped as CP-02.3), R17 (strip removed).
