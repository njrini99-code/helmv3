# Inventory B: Clubhouse components, cards, headers, overlays, forms

Read-only forensic pass over `/home/user/helmv3/src/clubhouse` (current tree, no git metadata available in this checkout, so branch/PR state could not be read). Dates: 2026-11-27.
Convention: **[V]** = read in source or counted with `rg`/`node` in this session; **[I]** = inferred, not observed. Counts exclude `__tests__` unless said. "Import sites" = distinct non-test files that import the module (`rg` on `from '…/Name'`).
All paths are relative to `src/clubhouse/` unless prefixed.

## 0. Scale and the one-paragraph picture

- `ui/` 74 files, 8,625 lines; `shell/` incl. `shell/command` ~10,216 lines; `screens/` 18 areas, 482 non-test `.tsx` files, 116,440 lines; `styles/` 71 CSS files, 105,516 lines [V].
- Styling is plain CSS with `.ch-<page-prefix>-*` ownership; **no Radix, no vaul, no Tailwind** in Clubhouse. Radix packages are in `package.json:230-237` for Fairway, and the only `vaul` hit in Clubhouse is a comment in `shell/edge-swipe.ts` [V]. Libraries actually used: `motion/react` in 16 files [V], `cmdk` in `shell/command/Palette.tsx:3` [V], `lucide-react` icons (700 `<Icon` sites in 258 files [V]).
- Behavioural plumbing is hand-built and good: native `<dialog>.showModal()` via `lib/dialog-lifetime.ts:173`, sheet drag `lib/sheet-drag.ts` (408 lines), scroll lock `lib/overlay-scroll.ts`, roving rows `lib/roving.ts`/`ui/use-roving.ts`, haptics `lib/haptics.ts`, press `lib/press.ts`.
- The *shared primitive layer is thin relative to the feature layer*: `Button` has 220 import sites, but `Surface` (the card) has 14, `Field` 0, `Truncate` 0, `GroupList` 5, `ListPresence` 10, `Segmented` 70. Feature screens re-implement cards (35 `.ch-*-card` classes), rows (41 `.ch-*-row` CSS families, 36 used in TSX), toggles, sheets (16 sheet prefixes, ~50 `*Sheet` components), menus (12 hand-rolled `role="menu"` files), skeletons (70 `-skel*` classes) and headers (140 `*-head|hero|bar|top` class names).
- Design law is documented tightly (`design/refresh/DESIGN_LANGUAGE.md` §2, §4, §9) and mostly enforced by tests and ratchets, but the enforcement is on *tokens* (radius px literals: 1 vs 1,608 token uses [V]) not on *which component draws the container*.

---

## 1. Component inventory

### 1.1 `ui/` primitives (import sites from `rg`; lines from `wc -l`)

Legend for Library: none = no third-party UI lib; motion = `motion/react`. "Compound" = multiple exports forming parts. No component in `ui/` or `shell/` offers `asChild`/`Slot`; none forwards a `ref` except `Button` (menu trigger ref only, `ui/Button.tsx:119` [V]).

| Component | File:lines | Imports | API shape | Lib | States evidenced | Keyboard / touch / a11y |
|---|---|---|---|---|---|---|
| Button, IconButton | ui/Button.tsx:229 | 220 | One component, `variant` (primary/secondary/ghost/danger…), `size` sm/md/lg, discriminated union `href` (renders next/Link) vs `onClick`; `busy`, `done`+`doneLabel`, `menu` trigger props, `aria{}` bag, `kbd`, `feel` haptic, `data-ctl`. No asChild, no polymorphic `as` [V] | none (next/link) | default, hover/press via `.ch-btn__layer` opacity layer, focus-visible (global `base.css:123`), disabled, busy (aria-busy + Spinner, label keeps width), done flash, link variant. Not implemented: error, readonly; disabled-reason only via `aria.describedby` (1 use in screens [V]) | native button/anchor, `aria-keyshortcuts`, press scale 0.97 via `lib/press.ts` (width cap 240px), primary haptic |
| Segmented, PillGroup | ui/Segmented.tsx:180 | 71 | Generic `Segmented<V>`, `options[{value,label,aria,disabled,className,data}]`, `size sm/md/lg`, `redraws`, `block`, `hook`; `PillGroup` a second API (`aria-pressed`) in same file (3 sites) [V] | none (`lib/slide-plate.ts`) | default, selected thumb, disabled option, pending (`useTransition` chip-follows-tap), hover | `role=radiogroup`/`radio`, roving tabindex, Arrow keys skip disabled (Segmented.tsx:104-117), pointer-drag across options with selection haptic (:86-103). No tablist semantics: tabs use a different family (6 files use `role="tablist"`) |
| Surface, Inset | ui/Surface.tsx:80 | 14 (41 `<Surface`) | Slots as props: `title, subtitle, actions, rule, footer, footerNote, padded, variant default/flat/card/feature, level 2/3`. Dev-only nested-card warning via context (Surface.tsx:47). Inset is separate export [V] | none | static only. No hover/pressed/selected/loading/empty/error. Not interactive | `<section aria-labelledby>`; heading level prop |
| Section, BackLink | ui/Section.tsx:67 | 25 | `title, meta, actions`; renders a *ledger head*, not a card (docs say "flush"), but `shell.css` auto-paints `main .ch-sec` as a card on phone (see §3.4) | none | static | `<section>`/`h2` |
| Ledger family: LedgerList, LedgerRow, FigureRow, **FeatureCard**, **PageIntro** | ui/Ledger.tsx:242 | 8 files | Separate kit with own `KitProps` (`code`, `className`). FeatureCard = `.ch-feat`, link/button/group polymorphism by prop (Ledger.tsx:149-200) | none | press wash, never scales; "soon" chip | link/button/group |
| GroupList, GroupRow | ui/GroupList.tsx:22 | 5 | `inset`, `twoLine` | none | static; press wash from CSS | `<ul>/<li>` |
| LargeTitle, LargeTitleContext, LargeTitleSkeleton | ui/LargeTitle.tsx:50 | 45 | `as h1|p`, `hidden` | none | static | `data-ch-large-title` is the contract the shell watches (shell/large-title.tsx) |
| PageHero + HeroToneProvider | ui/PageHero.tsx:83 | 3 files, 1 `<PageHero` site | `eyebrow,title,actions,figures,tight`, tone via context | none | static; 6 tones in `app/clubhouse-preview/header-lab/page.tsx:3-9` | h1 |
| PhoneBar, PhoneIconAction, PhoneTextAction | ui/PhoneBar.tsx:194 | 25 | `back{label,onBack,chevron}`, `title`, `lead`, `start`, `action`, `titleId`, `heading` | none | back label truncation by width (`phone-bar-back-label.test`) | back is button; title h1 unless `heading=false` |
| Modal | ui/Modal.tsx:148 | 99 (144 `<Modal`) | Props not slots: `open,onClose,title,description,icon,width,footer,action,detent,bare,variant,role,pop,id,fallbackFocus,initialFocus,atRest,code,className` [V] | none (native `<dialog>`) | open/close with retained exit content, drag, `alertdialog`, no busy/disabled/loading API, no dirty guard (FormSheet has it) | `showModal()` focus trap, Esc via `onCancel`, backdrop click, focus return `lib/dialog-lifetime.ts:125-134`, heading focused on open, scroll lock, phone drag-to-close (25% or 80px or flick 0.4px/ms, `lib/sheet-drag.ts:16-20`) |
| FormSheet, ListSheet, ActionSheet, useSheetDraft, HeldSheetsContext | ui/FormSheet.tsx:288 | 8 | `FormSheetProps {open,onClose,title,actionLabel,onAction,actionDisabled,danger,busy,dirty,full,code,note,children}` (FormSheet.tsx:64) | none (native dialog) | busy blocks close and springs back (:44-51), dirty asks first, disabled Save | submit button so Enter sends; Esc/backdrop/Back/edge-swipe all route to `requestClose` |
| Menu, MenuItems, menuKeyDown, typeAhead | ui/Menu.tsx:338 | 35 (37 `<Menu`) | `items: MenuItem[]` (data-driven, no compound), `trigger(props)` render prop, `label` | motion | open/close, item disabled/danger/checked (`menuitemradio`), type-ahead | `role=menu/menuitem/menuitemradio`, Arrow/Home/End/Esc/Tab, focus returns to trigger (Menu.tsx:126,165), portal fixed-positioned, no Popover API |
| ContextMenu, MenuSheet | ui/ContextMenu.tsx:316 | 7 | right-click/long-press; sheet form on phone | motion | open/close | same menu keys; Esc/press-away/scroll/resize/blur close (ContextMenu.tsx:56) |
| Peek, PeekTarget | ui/Peek.tsx:508 | 6 | hover-card on desk, long-press peek on phone; `PeekAction[]` | motion | hover 400ms/focus 600ms/hold 450ms timers (Peek.tsx:40-42) | role dialog/menu; Esc; portaled; `inert` when hidden |
| PlayerPeek | ui/PlayerPeek.tsx:126 | 12 | wraps Peek for people | none | | |
| PickerHost / PickerField | ui/PickerHost.tsx:386 | 2 (DateField, TimeField) | `PickerFieldProps`, panel API | motion | combobox popover, invalid | `role=combobox`, Esc closes only picker, not host sheet (PickerHost.tsx:211) |
| DateField, TimeField | ui/DateField.tsx:244, TimeField.tsx:166 | 17, 10 | field props + `invalid`, `describedby` | none | invalid, selected, today (`aria-current`) | grid/gridcell, `listbox/option`, `aria-live` |
| Toast / ToastProvider / useToast / useDelayedToast | ui/Toast.tsx:488 | 67 (57 `useToast(`) | imperative `useToast()(input)`, tones, action w/ 10s lifetime (:99) | motion | info/success/error/action; slow-feedback delay | `role=alert` for error else `status`; `aria-live=polite`; Esc closes toast only, not dialog (:333); renders **inside** the open dialog (top layer) via portal (:145-155) |
| Tooltip | ui/Tooltip.tsx:184 | 30 (46 `<Tooltip`) | wraps one child, `label`, `shortcut[]`; global tip clock (`shell/command/tooltip-clock.ts`) | none | mouse/pen hover-rest, keyboard focus-visible only; never touch (:21) | `aria-keyshortcuts`, `aria-label`; no `role=tooltip` (inferred from grep: no roles in file) |
| Switch | ui/Switch.tsx:110 | 18 | `checked,onChange,busy,label…` | none | on/off, busy (`aria-busy`), disabled, pointer drag (`switch-drag.test`) | `role=switch` |
| Checkbox | ui/Checkbox.tsx:64 | 9 | native input + styled box | none | checked, invalid, disabled | native |
| ChoiceGroup | ui/ChoiceGroup.tsx:50 | **0** | legend, options | none | | **no production importer** (only `ui/__tests__/form-primitives.test.tsx`, `preview/component-catalog.json`) [V] |
| Field | ui/Field.tsx:79 | **0** | render-prop children get `{id, aria-describedby, aria-invalid}`; label, help, error, count/max | none | invalid, over-count | **no production importer**; 6 feature-local `Field` components exist instead (§6) [V] |
| Stepper | ui/Stepper.tsx:71 | **0** | `role=spinbutton` | none | | unused; `screens/practice/builder/Sheets.tsx:28` defines its own local `Stepper` [V] |
| SpanSwitch | ui/SpanSwitch.tsx:28 | **0** | | | | unused; `screens/home/HomeSpanSwitch.tsx:27` is a second one [V] |
| ConfirmAction | ui/ConfirmAction.tsx:54 | **0** | `alertdialog` | | | unused [V] |
| Truncate | ui/Truncate.tsx:29 | **0** (test only) | `lines 1|2|3`, auto `title` when cut | none | | "The one wrap-and-truncate policy (ST-1)" has no consumer, while `text-overflow: ellipsis` appears 186 times and `line-clamp` 84 times in CSS [V] |
| DeltaChip | ui/DeltaChip.tsx:91 | 0 prod (1 in tests) | | | | unused [V] |
| Select | ui/Select.tsx:39 | 27 | native `<select>` dressed | none | disabled, empty/placeholder | native |
| Slider | ui/Slider.tsx:86 | 4 | | none | | `aria-valuetext` |
| SearchField | ui/SearchField.tsx:59 | 17 (16 screens) | | none | | 7 more feature-local search inputs (§6) |
| Avatar | ui/Avatar.tsx:76 | 88 | | none | | |
| Badge | ui/Badge.tsx:16 | 32 (58 `<Badge` sites) | `tone neutral/accent/positive/warning/info`, `dot`, `decorative` | none | static | 29 other `*-badge|tag|pill|chip|label|status|dot` CSS families (40 total) |
| Icon | ui/Icon.tsx:17 | 258 | lucide wrapper, `size` | none | | |
| States: EmptyState, Skeleton, SkelLine, SkelRows, SkelRule | ui/States.tsx:289 | 144 (EmptyState/NoData-class uses: 297 sites in 113 files) | `EmptyKind first-run|filtered|restricted`, `danger`; `Skeleton width/height/radius` | none | empty (3 kinds), error (danger role=alert), filtered (`role=status`) | |
| NoData, NoTeam, CrhStateBlock, EmptyShape, StateSignal, CrhSkelCard | ui/*.tsx 15-35 lines each | 49 / 18 / 4 / 1 / 1 / 1 | | | | five parallel small "state" primitives beside `States.tsx` |
| Notices: InlineNotice, PageNotice, RouteErrorView | ui/Notices.tsx:329 | 89 | tone/place (`noticePlace` card vs edge) | none | error (`role=alert`), busy | |
| RefreshNotice, Retry, SectionBoundary/SectionGroup | ui/*.tsx | 39 / 5 / 55 | error-boundary + Suspense wrapper | none | loading (skeleton), error+retry | |
| Spinner | ui/Spinner.tsx:13 | 10 | | none | busy | |
| DataTable | ui/DataTable.tsx:141 | **1** (`screens/roster/Roster.tsx`) | `columns[{id,header,sortKey,align,cell}]`, `rows`, `sort`, `selected`, `rowProps`, `classNames` | none | sorted (`aria-sort`), selected (`aria-current`), sticky header | one tab stop, Up/Down/J/K/Home/End (DataTable.tsx:34-38). 23 raw `<table>` in 21 files elsewhere [V] |
| SwipeRow | ui/SwipeRow.tsx:234 | 1 (Messages ConvRow) | | none | reveal/commit | `aria-hidden` actions |
| ListPresence | ui/ListPresence.tsx:138 | 12 | enter/exit rows | motion | insert 8px rise / remove shrink | |
| WeekStrip, ScrollPager, ScrollRegion, SideScroll | ui/*.tsx | 3 / 2 / 9 / 8 | | none | | |
| Charts: Line, ChartTable, ChartText | ui/charts/Line.tsx:426 +29+15 | | `drawIn` opt-in | none | | only 3 chart files in the shared layer; chart code otherwise in `screens/stats/charts.tsx`, `MiniCharts.tsx`, `LegBars.tsx`, `ScoreMixBar.tsx`… |
| Domain atoms: ScoreMark, Nine, FormLine, StatTerm, CrhLine, WasValue, TrustChip, ClassStatusLine/Row, Zone, Abbr, SerifText, HelmMark, ExportButton | ui/ | 13 / 5 / 6 / 5 / 1 / 4 / 3 / 7+2 / 6 / 6 / 6 / 14 / 4 | | none | | domain-specific, still in `ui/` |
| Hooks/helpers: use-roving, use-hscroll, sheet-keyboard, date-time, form-range, hero-tone, point-span | ui/ | | | | | |

### 1.2 `shell/` components

| Component | File:lines | Imports | What it is | Lib | A11y / keyboard / touch |
|---|---|---|---|---|---|
| ClubhouseFrame | shell/ClubhouseFrame.tsx:385 | 5 | page frame, providers | motion | |
| ClubhouseShell | :107 | 1 | server entry | | |
| RouteFrame | :286 | 1 | route transition owner (desktop crossfade, back/forward scroll restore) | none | |
| TopBar | :133 | 1 | sticky glass bar: breadcrumb trail (desk), title/section switcher (phone), SearchPill, HelmKey, Bell, Settings; `inert` while immersive (TopBar.tsx:86); `data-phone` = start/page/root | none | `<header>`, `<nav aria-label="Breadcrumb">`, `aria-current=page` |
| crumbs (CrumbProvider, usePageCrumbs) | :36 | 7 | trail is `string[]`; links resolved by label via `crumbHref` (TopBar.tsx:74) | | **stringly typed** [V] |
| large-title (hook) | :255 | 1 | watches first `.ch-large-title` outside `.ch-sr-only, .ch-pscreen, dialog, .ch-topbar` (large-title.tsx:34) and fades bar title in at 36-52px scroll | none | |
| Sidebar, NavPlate, RailToggle, RailTip | :198/93/61/53 | 1 each | desk rail, folds to icons; `aside` + `nav aria-label=Main`, `aria-current` | none | tooltip on hover/focus when folded |
| SectionStrip, section-switch | :206/491 | 1 / 6 | phone nav: no tab bar; pull the bar down or tap the title to reveal a pill row (Sections), current on a sliding plate | motion | `aria-label=Sections`, account pill `aria-haspopup=dialog`; gestures `useSectionGestures` |
| Dock (ThumbDock, ResumeRoundCard, DockProvider) | :213 | 2 | NOT a bottom nav. "Thumb dock": page-mounted primary controls on phone + Resume Round accessory. `ThumbDock` has **0 screen consumers** (only `Dock.tsx`, test, css) [V] | none | `role=region aria-label=Actions` |
| PhoneScreen, phone-chrome | :229/475 | 11 / 56 | pushed phone screen (520ms iOS curve push, underlay shift 30%, edge-swipe back, inert cover, scroll lock) and chrome context (`PhoneTop`, `usePhoneHero`, `DeskTop`) | motion | focus to title; covered screens inert |
| AccountSheet | :121 | 1 | uses shared `Modal` (AccountSheet.tsx:84) | none | |
| Bell, BellStacks, BellHeldRow | :705/471/63 | 2/1/1 | notification popover/sheet: **own** portal + `role=dialog aria-modal` + own scroll lock (Bell.tsx:591-680) | motion | |
| TeamSwitch | :200 | 2 | own portal menu (TeamSwitch.tsx:124) | motion | |
| AskSheet, PushAsk | :34/104 | 4/2 | PushAsk uses `Modal` | | |
| quick-chat/* | 1,171 lines total | | CoachHelm quick-chat panel: own `role=dialog aria-modal` section (QuickChatSession.tsx:295) | none | |
| command: Palette, CommandLayer, SearchPill, ShortcutsSheet, Keys, commands, rank, recent, shortcuts | shell/command | 1 each | ⌘K palette = `Modal` + `cmdk` list (Palette.tsx:3; doc comment :40-45); desktop SearchPill opens it | cmdk | cmdk does arrows/Home/End/Enter; focus return via Modal |
| OfflineBanner, OfflineSync, PullToRefresh (314), ShellSkeleton, BootSkeleton, NotFound, NotRebuilt, ClubhouseRouteError, LinkPending, BrandWord, DeepLinks, light | shell/ | 1-12 | | OfflineBanner: motion | |

### 1.3 Library summary [V]
- Radix: 0 imports. vaul: 0. floating-ui: 0 (positioning is `lib/use-popover-fit.ts`, 46 lines, plus per-component maths in Menu/Peek/Tooltip). cmdk: 1 component. motion: 16 files. `<dialog>` native: Modal, FormSheet (7 refs), Peek, plus 5 screens drawing their own `<dialog>` (§5).
- `data-ctl` ids (the Bridge's control counter) are written in 1,831 places; a generated control inventory exists but it is not a design-system artifact.

---

## 2. Duplicate and parallel implementations

Method: unique class names matching `\.ch-<prefix>-<family>` in `styles/*.css`, plus TSX usage counts.

| Family | Shared primitive | Primitive adoption | Parallel implementations found [V] |
|---|---|---|---|
| Card | `Surface` (+ `Ledger.FeatureCard`, `Inset`) | 41 `<Surface` in 14 files; variant `card` 21 sites, `flat` 1 (gallery), **`feature` 0** | 35 unique `.ch-*-card` classes, top: qf 52 CSS mentions, setm 28, rv 22, shs 18, bst 16, rt 15 (§3). 62 TSX files use a `ch-*-card` class |
| Feature (green) card | `Surface variant="feature"` / `Ledger.FeatureCard` (`.ch-feat`) | Surface feature: 0; FeatureCard: 7 files | `background: var(--ch-feature-bg)` in 47 declarations across 18 CSS files (§3.5) |
| List row | `GroupList/GroupRow` (spec: DESIGN_LANGUAGE §7, 52/64pt), `LedgerRow` | GroupList 9 sites/5 files; LedgerRow 2 sites | 41 `.ch-*-row` CSS families; 36 distinct `-row` classes in TSX (110 uses) |
| Toggle / segmented | `Segmented` (owner "one toggle") | 70 files / 91 sites | QUEUE look-07 names 9 families. Status now: `.ch-hb-tabs` (17 CSS rules; TeamHub.tsx), `.ch-qf-pill` (QualifiersList.tsx:154, `aria-pressed` buttons), `.ch-tour-desk-pill` + `-tabs` (EventDesk.tsx:397-406), `.ch-rt-seg` (rounds/track/parts.tsx:35, own `role=radiogroup`, 20 rules), `.ch-th-toggle` (coachhelm-thread.css:308-323, **CSS only, dead**). Two of the nine are *not toggles at all* (`.ch-hb-chip` = remove-chip, sheets.tsx:201; `.ch-sv-mix-seg` = bar segment, ScoreMixBar.tsx:63), so look-07's list is partly misnamed. Also `PillGroup` (second API in Segmented.tsx:150, 3 sites), 49 files with `aria-pressed`, 16 files with `role="radio"`, 6 with `role="tablist"` |
| Tabs | none (no Tabs primitive) | | `role=tablist` hand-built in EventDesk, Compare, TeamHub, StatsTeamPhone, StatsPlayer, Calendar; 8 `-tab(s)` CSS families; `--ch-tab-*` tokens exist (tokens.css:959-965) but no component |
| Sheets / modals | `Modal`, `FormSheet/ListSheet/ActionSheet` | 99 files use Modal | Wrapper layers: `screens/settings/phone/sheets.tsx:18` re-exports/wraps FormSheet+PickerSheet; `screens/recruiting/RecSheet.tsx:13/40/63` (RecFormSheet/PickSheet/ActionSheet); `screens/practice/PracticeSheet.tsx:13`; `screens/messages/overlays/MsSheet.tsx:13`. 16 `-sheet|-sh` CSS prefixes. ~50 `export function *Sheet`. 5 screens open `<dialog>` themselves (History.tsx, round-sheets.tsx, CourseView.tsx, PlanCard.tsx, HomeActions.tsx) |
| Popover/menu | `Menu`, `ContextMenu`, `Peek` | Menu 27 files | hand-rolled `role="menu"` in 12 files: calendar/drag-popovers, Calendar, messages ComposerPlusV2, hold-lift, GlassMenu, bubble-actions, details-v2, quick-chat session, stats DeskPane, coachhelm ReadPage, SaveCard, PlanCard. `role="dialog"` hand-rolled in 16 files; `createPortal` in 24 files (6 in ui) |
| Empty state | `EmptyState` (3 kinds) | 297 sites/113 files (incl. NoData) | 26 `-empty|none|blank|nodata` CSS families; 5 sibling primitives (NoData, NoTeam, CrhStateBlock, EmptyShape, StateSignal) |
| Skeleton | `Skeleton/SkelRows` | `<Skeleton` 604 sites/61 files | 70 `.ch-*-skel*|-sk*` classes; 23 `*Skeleton*.tsx` files in screens (87 files mention Skeleton). Per-page skeleton layouts are intentional (shape matches content) but the card/row chrome inside is re-drawn each time (e.g. `.ch-rv-sk-card`, `.ch-shs-skel-card`) |
| Buttons | `Button` | 719 `<Button` in 194 files | 533 raw `<button` in 209 files; only 12 carry `ch-btn`. Raw ones are mostly rows/chips/tabs (legit) but there is no `RowButton`/`Chip`/`ToggleButton` primitive to absorb them |
| Form field | `Field` | 0 | local `Field`: onboard/Steps.tsx:1177, calendar/hours/sheets.tsx:48, settings/parts.tsx:150, recruiting/ProspectForm.tsx:241, hub/sheets.tsx:35, coachhelm/chat/cards/edit.tsx:41 (+tournaments LiveRound `Field` is something else) |
| Inputs | `.ch-input` | 37 `className="ch-input"` of 152 raw `<input` in 66 files | `.ch-rsu-in` 5, `.ch-setm-field__i`, `.ch-prb-title`… ; 36 `<textarea` in 32 files; `base.css:144` lists 7 input classes by hand for the focus ring |
| Search | `SearchField` | 16 files | `.ch-prc-find` 4, `.ch-tour-desk-find` 2, `.ch-rs-search` 2, `.ch-rsu-search`, `.ch-recm-search`, `.ch-rec-search`, `.ch-qf-search`, `.ch-msv-search` |
| Headers | `LargeTitle`, `PhoneBar`, `PageIntro`, `PageHero`, `Section`, `Surface` head | see §4 | 140 distinct `*-head|hdr|header|hero|toolbar|bar|top` class names in TSX |
| Badges/chips | `Badge` | 58 sites/29 files | 40 `-badge|tag|pill|chip|label|status|dot` CSS families; `.ch-pill` shared chip exists (press target in press.ts:11) |
| Banners/notices | `InlineNotice/PageNotice` | 118 files mention notice/banner components | `.ch-cpv-banner`, `.ch-rsm-banner`, `.ch-tfx-banner`, `.ch-stale` (shell.css:4379), `.ch-rcv-note` |
| Tables | `DataTable` | 1 consumer | 23 `<table` in 21 files; 21 files with `role="table|grid"`; chart tables in `ui/charts/ChartTable` |
| Stepper | `ui/Stepper` | 0 | local `Stepper` (practice/builder/Sheets.tsx:28) |
| Truncation | `ui/Truncate` | 0 | 186 `text-overflow: ellipsis`, 84 `line-clamp`, 132 `overflow-wrap/word-break` rules |

---

## 3. Card deep dive

### 3.1 Is there a Card primitive? What is its architecture?

Yes, one: `ui/Surface.tsx` [V]. It is a **prop-slot component, not compound**: `title`, `subtitle`, `actions`, `rule`, `footer`, `footerNote`, `padded`, `variant`, `level` (Surface.tsx:19-47). There are no exported `Card.Header/Body/Footer` parts, no `asChild`, no `href`/`onClick` (a card cannot be a link or button; interactive cards are hand-built, the spec's "summary card is the tap target", DESIGN_LANGUAGE §9). No loading/empty/error/selected/hover states. Nesting guard is dev-only `console.warn` (Surface.tsx:47). CSS: `.ch-surface` = `--ch-bg-surface` + `--ch-radius-lg` + `--ch-card-shadow` (ui.css:632-638); head padding `16px 20px 0` (ui.css:642-648), body `16px 20px 20px` (:672); footer is an inset band with `--ch-bg-inset` (:675-687) which later rules override per flag (`.ch-surface--card .ch-surface__foot` transparent, ui.css:2335; `[data-ch-crh='on']` head/foot rewritten at ui.css:2425-2465).

Consequences:
- The *same component* is restyled by three flags: base (`ui.css:632`), `.ch-app[data-ch-refresh='on']` (ui.css:2225-2302), `[data-ch-crh='on']` (ui.css:2425+). 513 selectors across `styles/` are scoped to `data-ch-refresh='on'` or `data-ch-crh='on'` [V]. Whether the flags are universally on in production is not verifiable here [I: STATUS.md says Clubhouse is on for every team; flags still gate the CSS].
- `variant="feature"` is implemented (ui.css:2315-2334) and documented as the one green card, but **no screen uses it** (grep `variant="feature"` = 0). The green card is drawn four other ways (§3.5).
- `Section` (ui/Section.tsx) is documented as "no card" but `shell.css` has a global selector `[data-ui='clubhouse'] main .ch-sec:not(:is(.ch-hl, .ch-hf, .ch-ask, .ch-htb) *):not(:has(.ch-surface, .ch-es--page) …) { background: var(--ch-card-bg); box-shadow: var(--ch-card-shadow) }` (from the card scan; shell.css), i.e. a Section *becomes a card by CSS* on phone and desk (DESIGN_LANGUAGE §9 confirms: "On desktop (19 Nov 2026) the Section is itself a card"). The card is therefore partly an emergent CSS state of a section, partly Surface, partly 35 feature classes.

### 3.2 Token value drift between "the one card"

The design language says one card, one elevation (DESIGN_LANGUAGE §4). Tokens do collapse (`--ch-card-bg`=`--ch-bg-surface`, tokens.css:759-760; `--ch-sheet-bg`=`--ch-card-bg`, :993; `--ch-elevation-reading|lifted|framed|on-frame|feature` all alias `--ch-elevation-card`, tokens.css:700-701, 729-730, 885; `--ch-shadow-sm`:669) [V]. But call-site *names* still proliferate (counts of `var(--ch-…)` uses in CSS [V]):

| Shadow token used on card-like boxes | uses | resolves to |
|---|---|---|
| `--ch-elevation-reading` | 99 | card |
| `--ch-card-shadow` | 73 | card |
| `--ch-elevation-control` | 46 | control (not card) |
| `--ch-elevation-card` | 34 | card |
| `--ch-sheet-shadow` | 15 | card (tokens.css:994) |
| `--ch-shadow-sm` | 13 | card (tokens.css:669) |
| `--ch-shadow-float` | 11 | raised/other |
| `--ch-elevation-lifted` | 2 | card |
| `--ch-elevation-glass-card` | | **raised** (tokens.css:941), used by `.ch-bst-card` (shell.css) so that card is a *raised-elevation card* |
| `--ch-elevation-raised` | | used by `.ch-au-wl-card` (auth.css) |
| `--ch-green-raised-shadow` | | `.ch-ox-card` (onboard.css) on a radial-gradient background |
| `--ch-stats-redesign-shadow-1` | | `.ch-shs-card` (stats-redesign.css:2439) |
| `--ch-classes-x1`, `--ch-ui-x2`, `--ch-ask-shadow-2`, `--ch-qc-shadow-11` | | per-page shadow indirection layers |

Card fill tokens on card-like rules: `--ch-card-bg` 157 declarations/25 files, `--ch-bg-surface` 154/36, `--ch-sheet-bg` 56/20, `--ch-feature-bg` 47/18, plus one-offs found: `--ch-ivory-100` (`.ch-rt-card`, rounds-track.css), `--ch-ivory-25` (`.ch-st-card`, stats.css), `--ch-chart-paper` (`.ch-akg-card`), `--ch-shs-s-card` (stats-redesign.css:10, flips to `--ch-green-800` at :268), `--ch-cl-t` (classes.css tinted card), `white` (rounds.css:5224 sets `--ch-sheet-bg: white`, contradicting "nothing is white", tokens.css:29) [V]. Because most resolve to the same value the visual drift is small today; the *structural* risk is that a token change would not propagate uniformly (e.g. `--ch-shs-s-card` and `--ch-ivory-*` do not follow `--ch-card-bg`).

### 3.3 Inventory by category

Counts are classes/selectors, scanned with a throwaway node/postcss-free script (scratchpad, not committed) (CSS rules that have background ∈ {card, surface, elevated, subtle, well, feature, ask-card} + radius ≥ 12 or `--ch-radius-md|lg|xl` + padding): **210 rules in 48 CSS files** (lower bound; cards drawn via other background forms or via shared `.ch-sec` are not caught) [V for the number, I for completeness].

Padding/radius/shadow columns are observed base rules (a second throwaway script over the stylesheets) [V].

| Category | # implementations (class families) | Where (representative) | Surface | Border/ring | Shadow | Radius | Padding |
|---|---|---|---|---|---|---|---|
| **Generic content card** (title + rows) | ~14 | `.ch-surface` ui.css:632; `.ch-setm-card` (settings, 28 refs); `.ch-qf-card` (qualifiers, 52 refs); `.ch-rv-card` (round review, 22); `.ch-prc-card`/`-tile`/`-group`/`-drill`/`-slot`/`-gcard`/`-fold` (practice, 16 rules); `.ch-tfx-card`; `.ch-lv-card`; `.ch-rsu-card`; `.ch-rcv-card`; `.ch-hb-card`; `.ch-cp-card` | bg-surface / card-bg / sheet-bg | none, or hairline ring in box-shadow (`0 0 0 var(--ch-hairline-w) var(--ch-border-hairline)` rv, rsu, cp), `.ch-tfx-card` adds a real `border:` | elevation-reading / card-shadow / sheet-shadow / shadow-sm | lg 16 everywhere; `.ch-th-card` and `.ch-ph-card` xl 20 | 16 / `16px 20px` / `12px 16px` / `var(--ch-space-3) var(--ch-space-4)` / `6px` (`.ch-st-card`) |
| **Summary / entity** (tap target into detail) | ~8 | `.ch-shs-card` + `SummaryCard.tsx` (stats), `.ch-h-card`, `.ch-hm-card`, `.ch-dh-card` (home), `.ch-rs-face`, `.ch-rs-tcard` (roster), `.ch-cl-card` (classes), `.ch-msv-card` (messages), `.ch-hb-ann` (hub) | card-bg / `--ch-shs-s-card` / tinted `--ch-cl-t` | ring as shadow | stats-specific shadow token | lg | `12px 16px 16px` (shs), `12px 16px` (h), `12px 12px 8px` (hm), `16px 16px 12px` (cl) |
| **KPI / figure tiles** | ~6 | `.ch-rs-face__figs`, `.ch-prc-tile`, `.ch-msd-tile`, `.ch-htb .tile`, `.ch-tour-desk-ev__fig > div`, `.ch-hg-grid .ch-hg-m` | `--ch-bg-subtle` / well-bg / card-bg | inset hairline | inset or none | md 12 | per tile |
| **Analytical / chart card** | ~6 | `.ch-akg-card` (CoachHelm Ask graph), `.ch-cmp-bar`, `.ch-tour-cmp-block` / `-tl` / `-scope`, `.ch-tour-rev-trend`, `.ch-shs-card.is-flushb` (chart bleeds), `.ch-lg__cell` (ledger grid) | chart-paper / bg-surface | hairline | elevation-reading | lg | `16px 20px` |
| **Featured (green)** | 18 CSS files, 47 declarations; see §3.5 | `.ch-shs-feature`, `.ch-hm-next`, `.ch-h-herocard`, `.ch-qf-hero`, `.ch-qf-herobox`, `.ch-rv-hero`, `.ch-hs-hero`, `.ch-hd-dos__h`, `.ch-hb-board`, `.ch-hb-ann.is-lead`, `.ch-prc-feat`, `.ch-cl-term`, `.ch-feat`, `.ch-surface--feature` | `--ch-feature-bg` (green-800, tokens.css:884) | none | `--ch-feature-shadow`/`--ch-elevation-feature` (=card shadow, tokens.css:885) | lg | varies |
| **Widget / dashboard** | ~5 | `.ch-hw` (hub widgets), `.ch-h-dash__card`/`.ch-h-qc` (home dashboard), `.ch-hm-sec`, `.ch-hrs-pl`, `.ch-hrs-ev__l` | card-bg | | card-shadow | lg | |
| **Action / composer card** | ~6 | `.ch-ox-card` (onboarding, radial gradient fill), `.ch-au-wl-card` (auth welcome), `.ch-qcs .cmp`/`.qc__body` (quick-chat), `.ch-ak-meter`, `.ch-msv-tocard`, `.ch-ak-home .sugg` | surface/gradient | hairline | raised or card | lg/xl | |
| **Status / notice card** | ~7 | `.ch-rcv-note`, `.ch-stale` (shell.css:4379), `.ch-cpv-banner`, `.ch-cl-over`, `.ch-in__need`, `.ch-prc-stale` (2px focus-colour ring as shadow), `.ch-boot-page__card`, `.ch-empty-page` (auto-carded in shell.css) | surface / subtle / well | | | lg | |
| **Compact / well / inset** | ~25 | `Inset` (ui.css:699: raw `#efece3` hex plus inset shadow, **bypasses tokens**), `.ch-tfx`, `.ch-rcpt`, `.ch-change-note`, `.ch-feed__ask`, `.ch-ak-*` wells (CoachHelm Ask v2: 21 of the 210 rules), `.ch-ed__inv`, `.ch-ca-panel`, `.ch-rsu-par` | `--ch-bg-subtle` / `--ch-well-bg` | inset hairline (0.5px in Ask v2: `--ch-ak-ak-hair`) | `--ch-well-shadow` | md | |
| **Navigation card** | ~4 | `.ch-nav` rail item plate (`--ch-nav-well-bg`, tokens.css:733-737), `.ch-strip__plate`, `.ch-more__me` | card-bg | | elevation-card | | |
| **Popover/menu panel** (not a card, shares recipe) | 3 | `.ch-popover` (ui.css:~711), `.ch-ca-pop`, `.ch-pp__trigger` | `--ch-overlay-bg` / bg-surface | | raised/overlay | lg | `4px` |
| **Print card** | 2 | `.ch-prt-card` (`padding: 16mm 32px`, print studio) | | | | | print units |

### 3.4 Anatomy implementations (header / eyebrow / title / meta / footer / actions)

| Implementation | Header | Eyebrow | Title | Meta | Footer | Actions | Interactive states | Loading/empty/error |
|---|---|---|---|---|---|---|---|---|
| `Surface` | optional, `padding 16px 20px 0`, flex row | none | h2/h3 `--ch-type-headline` | `subtitle` caption (13px) | note left + actions right in `--ch-bg-inset` band | `actions` slot right | none (static) | none, caller composes `EmptyState`/`SectionBoundary` inside |
| `Surface variant="card"` under `[data-ch-crh='on']` | inline baseline row, hairline `::after` inset 16 (ui.css:2436) | none | headline 17 | | hairline `::before` | | | |
| Stats card `.ch-shs-card` + `.ch-shs-ah` | **deep green title bar** (look-09 option F, stats-redesign.css:2875-2890, "every card that is not the screen's one green feature card opens on the deep green title bar") | in bar | in bar | count + chevron in bar | note inside | pager keys in feature inks | pressed wash [I] | `.ch-shs-card.is-waiting`, `.ch-shs-empty` (stats-redesign.css:978-987), skeleton variant `ch-shs-skel-card` |
| Home cards (`.ch-h-card`, `.ch-hm-card`) | green title bar on phone since 2026-11-21 (docs/clubhouse/pages/P002-home/changes/2026-11-21-stat-card-title-bars.md) | | | | | | | |
| Qualifiers `.ch-qf-card` | ledger-style row grid; `is-ledger` variant becomes a hairline-ring card (qualifiers.css, three overriding rule sets under `[data-canopy]`) | | | | | | | |
| Practice cards | 10+ distinct classes, all `card-bg + card-shadow` | | | | | | | |
| `Ledger.FeatureCard` | `kicker` + optional chip (gilt "soon") | kicker | title | `line` | `foot` | whole card is link/button | press shade, never scales (Ledger.tsx:142-146) | |

The look-09 **option F** direction (one deep green feature card per detail, green title bar on all other cards, heavier type, plain figures in ink with green/amber only against a benchmark) is implemented in `stats-redesign.css` (:1554, :1588, :2802-2890), Home (changelog above), Round review (P011 changelog), CoachHelm Standing (P013) and Roster/qualifier slices are listed in QUEUE look-09 (docs/clubhouse/QUEUE.md:528). Per Nick's instruction this inventory does not redesign it. **Observation**: option F is being implemented as a CSS rule on `.ch-shs-card:not(.ch-shs-feature):not(.ch-shs-empty) > .ch-shs-ah` (stats-redesign.css:2879-2890) and parallel selectors per area, not on `Surface`'s head. So the title bar is another per-area re-implementation, not a Surface variant, unless the in-flight PRs move it (I cannot read #2606/#2610 state: this checkout has no git metadata) [I].

### 3.5 The feature (green) card: five ways

1. `Surface variant="feature"`: ui.css:2315-2334; 0 consumers [V].
2. `Ledger.FeatureCard` / `.ch-feat`: 7 files (Home DayCard, CoachLatest, PlayerHomePhone, TeamRounds, Tournaments, WhatsNew, PlayerEvent, YourWeek…) [V].
3. Stats `.ch-shs-feature` (SummaryCard.tsx) [V].
4. Hero blocks that are really feature cards: `.ch-hm-next`, `.ch-h-herocard`, `.ch-rv-hero`, `.ch-hs-hero`, `.ch-qf-hero`/`-herobox`, `.ch-hd-dos__h`, `.ch-hb-board`/`.ch-hb-ann.is-lead`, `.ch-prc-feat`, `.ch-cl-term`, `.ch-rd-unf` [V from CSS scan].
5. Skeleton twins (`.ch-hm-skel__card`, `.ch-cl-sk-crh__term`) that must be kept in sync by hand.

Law 5 says "one feature card per view"; nothing enforces it (no counter), and `Surface` warns only about *nested* surfaces.

### 3.6 Left-border and stripe check (owner rule: thick left-border cards banned)

- `border-left: Npx` with N ≥ 3: **0**. `border-left: 2px` occurrences: `rounds.css:2967` (`2px solid transparent`) and `hub.css:639` (`2px dashed`, a timeline connector) [V].
- Inset-shadow stripes: `stats.css:881` and `:4286` (dark) `box-shadow: inset 2px 0 0 color-mix(... --ch-green-600 55%/70%)` on `.ch-lg__cell.is-col`, a *selected column* marker in a ledger grid, 2px, not a card edge; closest thing to a stripe in the tree, arguably within the rule since it is a column selection cue not a card status edge [V/I]. `stats-redesign.css:2505` `inset 2px 0 0 var(--ch-card-bg)` is a card-coloured separator, not a stripe. `rounds-track.css:2682` `8px 0 0 var(--ch-green-900)` is a spread shadow, not an edge bar [V].
- No test pins the banned list for stripes (`styles/__tests__` has depth, page-colour, raw-colour, desk-green-corner etc.; none for left borders) [V]. The rule is held by review.

### 3.7 Containers that should not be cards (law 1 vs. "flush" ledger vs. everything-is-a-card)

Evidence-based candidates (judgement is [I]):
- **Single-line status notes** drawn as cards: `.ch-rcv-note`, `.ch-stale`, `.ch-cpv-banner`, `.ch-ak-board .bnote` should be `InlineNotice`/`PageNotice` (exists, 89 consumers).
- **Per-row containers**: `.ch-prc-drill`, `.ch-prc-slot`, `.ch-prc-run__card`, `.ch-rs-face` (a roster row in 16px radius with card shadow), `.ch-hrs-ev__l`, `.ch-hm-nextrow`, `.ch-cl-today__row`. Each row a lifted card contradicts "no card inside a card" when listed inside a Section that is itself auto-carded (shell.css rule above). They should be `GroupRow`/`LedgerRow` in one card.
- **Group wrappers around a table/scroller**: `.ch-tour-desk-ct__scroll`, `.ch-tour-desk-hg__scroll`, `.ch-tour-desk-ev__list`, `.ch-tour-led__list`, `.ch-tour-links-list`: a scroll container given a card face (acceptable only when the table scrolls; the ledger section doc says "Keep a card only for a real object … a table that scrolls", Section.tsx:8-10).
- **Chips and pills drawn with card recipe**: `.ch-ak-home .sugg button`, `.ch-hb-new`, `.ch-hb-evpick button` (surface + control elevation) are buttons, not cards.
- **Empty pages** auto-carded: `.ch-empty-page:not(.ch-empty-page--danger, .ch-notyet *)` (shell.css) puts the whole empty state in a card *and* `ui.css:2579-2610` removes the card from `.ch-es--page` inside surface/sheet/shs-card — two opposing global rules [V].
- **Hero containers** whose only job is the page title (`.ch-qf-hero`, `.ch-hs-hero`, `.ch-hd-dos__h`): headers wearing feature-card CSS.

---

## 4. Header and navigation deep dive

### 4.1 Mechanisms present [V]

1. **TopBar** (`shell/TopBar.tsx`): sticky glass (`--ch-glass-*`, tokens.css:680-685), height `--ch-topbar-h: 56px` (tokens.css:535). Desk: breadcrumbs + `DeskSlot` portal (`DeskTop`, 5 sites in 4 files) + SearchPill + Helm key + Bell + Settings gear (page-specific gear target for CoachHelm/Team Hub, TopBar.tsx:21-24). Phone: title is the section switcher.
2. **Phone breakpoint**: `(max-width: 820px), (max-height: 500px) and (pointer: coarse)` (`lib/phone-query.ts:5`) [V]. Phone-ness is **also** a JS hook (`useChPhone`, `lib/use-phone.ts:45`) and a cookie (`lib/phone-cookie.ts`) so server and client agree.
3. **Phone page title**: `LargeTitle` (31 files, 33 sites), 34px, `shell/large-title.tsx` fades the bar's title in at 36-52px scroll (large-title.tsx:7-9); `LargeTitleSkeleton` keeps parity. Excluded on purpose: Home hero, Calendar month, round course, qualifier name (large-title.tsx:20-25).
4. **Phone pushed bar**: `PhoneBar` (11 consumers) and `PhoneTop` (53 `usePhoneTop|<PhoneTop` hits in 41 files) in `shell/phone-chrome.tsx:358` portal into TopBar's slot; `PhoneScreen` for full pushes (11 importers).
5. **SectionStrip** (phone nav): no bottom tab bar; `--ch-tabbar-h: 0px "no bottom bar on the phone since the section strip"` (tokens.css:539). Pull bar down / tap title / swipe bar sideways (`useSectionGestures`).
6. **Sidebar** (desk rail), foldable to an icon rail, `NavPlate` sliding plate, `RailTip` for folded labels.
7. **Dock**: *not* navigation (see §1.2); the user-facing "bottom nav" does not exist.
8. **Breadcrumbs**: `crumbs.tsx` (36 lines): trail = `string[]`; only 4 screens set it (`usePageCrumbs`); link target by label lookup (`crumbHref`) [V].
9. **Command palette**: ⌘K, `Modal` + `cmdk`, groups Recent/Go to/People/Events/Actions (Palette.tsx:12-17), people loaded lazily for coaches with explicit loading/failed lines (Palette.tsx:30-36). Shortcut sheet and `page-keys.ts` (per-page key map). Desktop only trigger (SearchPill); phone has the "Helm key" quick-chat.
10. **Section header in page**: `Section` head (`ch-sec__head`) and `Surface` head: two parallel "title + meta + actions" rows with different class sets and different padding (Section: flush on canvas; Surface: `16px 20px 0`).

### 4.2 Distinct page-header compositions (count, [V] with classification [I])

h1 usage: 73 `<h1` in 56 files; class split: `ch-sr-only` 13 (hidden h1 because bar holds it), `ch-display` 10, `ch-hl-h__t` 4, `ch-empty-page__title` 3, `ch-hero__title ch-display` 1, `ch-ox-h1` 1, `ch-ask-head__t` 1, `lt` 1; plus `LargeTitle` 33 and `PageIntro` (own h1).

Distinct compositions (I count 9):
1. Phone: bar (root title/section switcher) + `LargeTitle` + `LargeTitleContext` (default for most section roots).
2. Phone: bar only (page without large title: Calendar, round, qualifier).
3. Phone: pushed `PhoneBar`/`PhoneTop` (back + centred title + one action) (41 files).
4. Phone: Home green hero swaps bar title via `usePhoneHero` (phone-chrome.tsx:133).
5. Desk: framed page head with 40px `ch-display` title in forest ink (DESIGN_LANGUAGE law 1; 19 Nov decision) with eyebrow.
6. `PageIntro` (eyebrow/title/brief/action), optional `large` flag to make it a phone large title (Ledger.tsx:208-242).
7. `PageHero` with six tones (1 consumer; `header-lab` page shows 6 tone variants that are historical, `app/clubhouse-preview/header-lab/page.tsx:3-9`).
8. Feature-hero-as-header (`.ch-hs-hero`, `.ch-qf-hero`, `.ch-rv-hero`, `.ch-hd-dos__h`, CoachHelm `.ch-hl-h__t`).
9. Screen-local heads: `.ch-qf-head` (8 uses), `.ch-h-head` (5), `.ch-rs-head` (4), `.ch-rsm-head` (3), `.ch-tour-head`, `.ch-set-head`, `.ch-rec-head`, `.ch-calm-head`, `.ch-ask-head`, `.ch-prb-head`… (~30 distinct `*-head` names in screens).

### 4.3 Behaviours

- **Sticky/collapse**: bar is sticky glass; large title collapse driven by CSS scroll-timeline where available, JS fallback otherwise (large-title.tsx:14-18); only 5 `animation-timeline|scroll-timeline` rules exist in CSS [V]. Desk: last crumb appears when the page title scrolls under (D16, per clubhouse.md).
- **Safe areas**: no token. `env(safe-area-inset-*)` is written raw 128 times (top 65, bottom 50, left 7, right 6) across stylesheets; JS probe `lib/safe-area.ts:1-14` for numbers [V]. Largest users: shell.css 25, coachhelm-plan 13, controls 9, messages 7. Risk: each sheet/screen re-derives the inset [I].
- **Contextual actions**: phone: one trailing action on bar (`PhoneBarParts.action`); desk: `DeskTop` portal into bar, 5 sites. Most screens put primary controls in-page (`ThumbDock` is unused).
- **Search/filter integration**: no header-level search/filter slot. Search is per-screen (16 `SearchField` + 8 custom). The palette is global navigation, not in-page search; Stats `StatsFilter`, Qualifiers pills, Roster search, Practice find are separate.
- **Glass**: law says "one material". `backdrop-filter` appears in 71 declarations; 41 use `--ch-glass-filter`, 2 in `messages-overlays.css` use their own blur variables (`--ch-scrim-blur-msg`) [V].

---

## 5. Overlay family

| Overlay | Implementation | Top layer / `<dialog>` | Focus trap & return | Scroll lock | Drag to dismiss | Snap points | Notes |
|---|---|---|---|---|---|---|---|
| Modal | `ui/Modal.tsx` | native `<dialog>.showModal()` (`lib/dialog-lifetime.ts:173`) | native trap + `chDialogOpener()` return, `fallbackFocus` when opener gone (dialog-lifetime.ts:125-134) | `acquireOverlayScroll` (overlay-scroll.ts:8) + `useSheetKeyboardFit` | phone: header/grab, `sheet-drag.ts` thresholds 25%/80px/0.4px per ms; Messages variant 1/3 | **none**; fixed `detent` share (0.62/0.74/0.9, cap 92dvh) | desktop centred 520px |
| FormSheet/ListSheet/ActionSheet | `ui/FormSheet.tsx` | native dialog | same hook | same | yes; refused drag springs back (FormSheet.tsx:44-51) | none | dirty/busy guards, `HeldSheetsContext` so edge swipe/Back ask first (CH-8509) |
| Palette, Shortcuts, Account, PushAsk | `Modal` | yes | yes | yes | yes (phone) | | consistent |
| Menu | `ui/Menu.tsx` | **no** (`createPortal` fixed div) | opener refocus on Esc/select; focus list on open (Menu.tsx:152) | no scroll lock (closes on scroll [I]) | no | | inside a dialog it portals into the dialog (inert otherwise) |
| ContextMenu / MenuSheet | `ui/ContextMenu.tsx` | portal | opener focus | closes on scroll/resize/blur | sheet form on phone | | |
| Peek (hover card / long-press) | `ui/Peek.tsx` | portal, `inert` when absent (Peek.tsx:385) | Esc closes | | | | hold 450ms |
| PickerHost (date/time) | `ui/PickerHost.tsx` | portal; mounts **inside** open dialog else app root (PickerHost.tsx:63) | Esc closes picker only (:211) | | | | |
| Tooltip | `ui/Tooltip.tsx` | portal | non-modal; keyboard focus-visible only | | | | no `role=tooltip` [I] |
| Toast | `ui/Toast.tsx` | portal; moves into topmost open `<dialog>` (Toast.tsx:145-155, CH-1812) | `aria-live=polite`; Esc closes toast only | | | | |
| Bell | `shell/Bell.tsx` | own portal + `role=dialog aria-modal` | own | own (`OverlayScrollLock`) | | | **parallel**, 705 lines |
| TeamSwitch | `shell/TeamSwitch.tsx` | own portal | own | | | | parallel |
| Quick chat | `shell/quick-chat/QuickChatSession.tsx:295` | `role=dialog aria-modal` section | own | `useOverlayScrollLock` | | | parallel |
| Bubble/hold-lift/seen-by/details-v2/GlassMenu (Messages) | screens/messages/overlays | own portals, `role=menu/dialog`, `aria-modal` on hold-lift | own | | long-press lift | | messages-overlays.css (18.6 KB) |
| Calendar popovers | screens/calendar/drag-popovers, class-group, Calendar | own portals, `role=dialog/menu` | own | | | | |
| CoachHelm PlanCard, Stories, ReadChip | screens/coachhelm | own `<dialog>`/portal, `aria-modal` | own | `Stories.tsx` uses scroll lock | | | |
| Pushed phone screen | `shell/PhoneScreen.tsx` | not a dialog; inertness of covered screens | focus to title | `useOverlayScrollLock` | edge-swipe back (use-edge-swipe) | | |

Counts [V]: `createPortal` in 24 files (6 in `ui/`); `role="dialog"` in 16 files; `aria-modal` in 5 (all hand-rolled); direct `<dialog` in 5 screens; `useOverlayScrollLock|acquireOverlayScroll` consumers: 6 files only — so any hand-rolled overlay outside those either does not lock scroll or has its own. No overlay uses the HTML Popover API (`popover=`, `showPopover`: 0 hits) or anchor positioning. The scrim rule "glass only on floating navigation" (ui.css popover comment) is respected.

---

## 6. Forms

- **Primitives**: `Field` (label/help/error/count, `aria-describedby`, error is deliberately not `role=alert`, Field.tsx:6-10) is exactly right and **unused**. `ChoiceGroup`, `Stepper`, `SpanSwitch`, `ConfirmAction`: unused. In use: `Select` (native, 27), `Switch` (18), `Checkbox` (9), `Slider` (4), `SearchField` (17), `DateField` (17), `TimeField` (10), `Segmented` as form choice (`block` prop).
- **Inputs**: raw `<input` 152 in 66 files, only 37 carry `className="ch-input"`; `.ch-input` focus-ring list in `base.css:144` is hand-maintained (7 selectors), so a new input class (e.g. `.ch-rsu-in`, `.ch-au-input input`) needs an edit in base.css.
- **Duplicated definitions**: `controls.css` defines `.ch-field` twice (controls.css:201 and :2037, label at :207/:2043; error appears only in the second block) [V].
- **Validation/error display patterns** (6+): `aria-invalid` in 45 files; `role="alert"` in 60 files; ad-hoc error classes: `.ch-au-err` 11 uses, `.ch-ox-err`/`-error` 13, `.ch-rt-error` 6, `.ch-tfx-save-error`, `.ch-tour-form-error`, `.ch-tour-form-name-err`, `.ch-ed-title-err`, `.ch-tour-imp-paste-err`, `.ch-rt-dist-err`, `.ch-cl-err`; help text: `.ch-setm-help`, `.ch-ox-help`, `.ch-ed-rsvp-help`, `.ch-dd-scope-help`, hints `.ch-rt-hint`, `.ch-tfx-hint`, `.ch-msp-hint`… All visible-text patterns differ in whether they announce on type (`role=alert` live) or on focus (`aria-describedby`), contradicting the `Field` design intent.
- **Submit semantics**: `FormSheet` action is a submit button (Enter works). Page-level forms are a mix of `use-action.ts` (`lib/use-action.ts`) and local state [I].
- **Date/time**: native-adjacent `DateField` (grid, `aria-live`) / `TimeField` (listbox) hosted in `PickerHost` (combobox); phone variant opens a sheet; Esc closes picker without closing host (PickerHost.tsx:211-228). Good, nested-dialog behaviour is considered.
- **Textarea**: 36 raw in 32 files; shared `.ch-textarea` plus per-screen composers (`.ch-ms-comp__field textarea` in base.css list).
- **Disabled with reason**: `Button.aria.describedby` exists (Button.tsx:32) and is used once in screens [V]; tooltips don't render on touch (Tooltip.tsx:21), so a disabled Save has no visible explanation on phone except `FormSheet.note` [I].

---

## 7. Compound-state gaps

| Scenario | Evidence / status |
|---|---|
| Loading button inside a dialog | `Button.busy` exists; `FormSheet` blocks closing while `busy` and springs back (FormSheet.tsx:44-51). `Modal` has no busy/dirty/disabled-close API: a `Modal` consumer (99 files) must hand-roll "do not close while saving" (Esc handler `onCancel` always calls `onClose`, Modal.tsx:86-89). [V] |
| Disabled with explanation | Only one use of `aria.describedby` on Button across screens; no `DisabledReason` pattern; Tooltip is hover/keyboard only [V]. |
| Selected row in filtered list | `DataTable` keeps `aria-current` selection and "selection follows keyboard"; `.ch-sel` wash token exists; but if a filter removes the selected row nothing resets it (the table is used by 1 screen). Elsewhere (Roster cards, Messages) selection is per-screen [I]. `useRovingRows` in 10 files. |
| Overflow / long text | `ui/Truncate` has 0 consumers; 186 ellipsis + 84 clamp rules written per page; `PopupLab` stress-tests `LONG` strings against shared popups (`preview/PopupLab.tsx:11`) but not cards or rows. |
| Extreme numbers | tabular numerals everywhere (504 `tabular-nums` rules, `.ch-num` in base.css:157); `lib/format.ts` has true-minus conventions; no primitive caps width of a hero figure ("44/56px hero figure" role in type roles) [I]. A stress dataset exists: `preview/stress.ts`, `ComponentPlayground`'s stress toggle posts to the gallery iframe (ComponentGallery.tsx:32-46). |
| Error inside card | `SectionBoundary` provides per-section error+retry, `Retry` primitive, `RouteErrorView`; `Surface` has no state slots, so each card wires its own [V]. |
| Empty vs filtered vs restricted | `EmptyKind` covers the three (States.tsx:34) and `role=status` for filtered [V]. |
| Nested overlays | Toast→dialog, picker→sheet, menu→dialog handled by portal-host lookup (Toast.tsx:145, PickerHost.tsx:63). Stacked sheets: only `HeldSheetsContext` for phone stacks; a Modal over a FormSheet relies on the native top layer ordering [I]. |
| Press/hover parity | `useChPress` applies to `.ch-btn,.ch-pill,[data-ch-press]` only (press.ts:11); card press is opt-in `data-ch-press-scale` — most interactive cards are hand-wired. |
| Reduced motion | `useChReducedMotion`, `data-motion='off'` selectors everywhere (e.g. ui.css:626-628) [V]. |

---

## 8. Component documentation and discovery

- **Routes**: `app/clubhouse-preview/components/page.tsx` (13 lines) renders `ComponentCatalog.tsx` (53) and `ComponentGallery.tsx` (123); `ComponentPlayground.tsx` (89) edits tokens live and posts a draft to the gallery iframe over `postMessage` (ComponentGallery.tsx:32-46, `playground-tokens.ts`); `popup-lab/page.tsx` renders `PopupLab.tsx` (103) with 8 sheet kinds incl. the three wrapper families; `header-lab/page.tsx` (39) is an iframe wall of six legacy `PageHero` tones (dev only, `notFound()` in production). Plus 30 `Preview*.tsx` screen previews and `preview/retired.ts`.
- **component-catalog.json** (generated by `scripts/clubhouse/component-catalog.mjs`, 992,748 bytes): 670 components; by group: screens 482, ui 74, shell 48, preview 35, routes 24, live 5, lib 2. **Only 22 of 74 `ui` entries have a gallery example**; the other 648 entries are "Contextual module" (the catalog's own words: "declarations are not browser coverage", component-catalog.mjs:1) [V]. Shell has 0 examples.
- **Not in the gallery** (52 ui files): ChoiceGroup, ContextMenu, DataTable, DateField, TimeField, Field, FormSheet, GroupList, LargeTitle, Ledger (FeatureCard/PageIntro), ListPresence, Modal variants beyond default, Peek, PickerHost, SwipeRow, Toast, Tooltip, Truncate, WeekStrip, Stepper, Spinner, Swap, StatTerm, Section, PageHero, SideScroll, charts. No example for **Surface variant="card"/"feature"** (only `flat`, ComponentGallery.tsx:85) [V].
- **What the catalog records**: file, group, exported names, CSS files (e.g. `Button` lists 30+ stylesheets because the class is referenced everywhere), examples, fixture. It has *no* props, variants, states, a11y, or usage counts. Prose docs live elsewhere (`docs/clubhouse/UI_OWNERSHIP.md` capability table: Select, Date, Overlay, Form, Scrollbar, Toast, CRUD owners; `docs/clubhouse/catalog/` CH-codes; `design/refresh/DESIGN_LANGUAGE.md` §9).
- **Component catalog tests**: `ui/__tests__` has 41 test files covering most overlays and controls; none for `Field`'s adoption (can't, 0 users), none pinning "one feature card per view".
- **Drift**: `UI_OWNERSHIP.md` calls `ui/Select` and `ui/Menu` the Select/Listbox owners — consistent with code; it says "Form: styles/controls.css; feature form components", i.e. it *documents* that no `Field` is the owner, while `ui/Field.tsx` claims (header comment) to be the premium-plan recipe [V]. DESIGN_LANGUAGE §9 "Card = ui/Surface.tsx" vs the code reality of 35 card classes and 0 `feature` consumers.

---

## 9. Ranked architectural weaknesses (evidence)

1. **No single card architecture.** `Surface` (14 files) vs 35 `.ch-*-card` classes in 62 TSX files vs auto-carded `.ch-sec`/`.ch-empty-page` by global selector (shell.css) vs `Ledger.FeatureCard`. §3.
2. **Card behaviour is a CSS cascade of flags, not variants.** 513 selectors scoped to `data-ch-refresh='on'`/`data-ch-crh='on'`; `.ch-surface--card` restyled at ui.css:2309, :2425-2465; two possible looks for one component. §3.1.
3. **Feature card defined 5 ways; `Surface variant="feature"` has 0 consumers**; green fill declared in 47 places/18 files; "one per view" is unenforced. §3.5.
4. **Option F (green title bar) is implemented as per-area CSS** (`.ch-shs-card:not(.ch-shs-feature) > .ch-shs-ah`, stats-redesign.css:2879) rather than a Surface slot, so rollout to Home/Rounds/Roster/Standing repeats the selector work per screen (changelogs P002, P004, P005, P011, P013). Status of #2606/#2610 not verifiable here.
5. **Dead or ignored primitives that encode the right decisions**: `Field` (0), `ChoiceGroup` (0), `Stepper` (0), `SpanSwitch` (0), `ConfirmAction` (0), `Truncate` (0), `DeltaChip` (0), `ThumbDock` (0). Each has a local twin (6 `Field`s, a `Stepper`, `HomeSpanSwitch`). Cost: validation a11y, truncation policy and stepper semantics are unshared.
6. **Toggle consolidation incomplete and the backlog is mis-scoped.** look-07 lists 9 families; 5 still render hand-built toggles (`ch-hb-tabs`, `ch-qf-pill`, `ch-tour-desk-pill/-tabs`, `ch-rt-seg`), 1 is dead CSS (`ch-th-toggle`), 2 are not toggles. No `Tabs` primitive although 6 files hand-build `role=tablist`; `PillGroup` is a second API. §2.
7. **Overlay logic forked outside `Modal`/`Menu`.** Bell (705 lines), TeamSwitch, quick-chat, Messages overlays, Calendar popovers, CoachHelm PlanCard/Stories each own portal, focus, `aria-modal`, scroll lock; scroll-lock helper has only 6 consumers; 12 hand-rolled `role=menu` files; 5 screens render raw `<dialog>`. §5.
8. **Modal lacks the guards FormSheet has** (busy, dirty, disabled close) though it has 99 files of consumers; 3+ wrapper families re-wrap FormSheet (settings, recruiting, practice) and `PopupLab` has to test each separately. §1.1, §2.
9. **Menus and popovers are positioned by custom maths** (no top layer, no Popover API/anchor positioning, `use-popover-fit.ts` 46 lines plus per-component code) and fail only in test-covered situations [I]; menus can't escape clipping ancestors except by portal. §5.
10. **Header composition sprawl.** 9 compositions; `PageIntro`, `PageHero` (1 consumer, 6 retired tones), `LargeTitle`, `PhoneBar`, Section head, Surface head, ~30 local `*-head` classes; large-title detection is selector based (`.ch-large-title` + exclusion list, large-title.tsx:32-34). §4.2.
11. **Breadcrumb model is stringly typed** (`string[]`, hrefs resolved by label match, TopBar.tsx:74; 4 consumers) — a renamed section label silently loses links. §4.1.
12. **Dock is mis-named and half dead**: `ThumbDock` has no screen consumer; the phone has no persistent bottom navigation; `--ch-tabbar-h: 0px` kept "for its readers" (tokens.css:539). Dead token and naming debt. §1.2.
13. **No row primitive adoption.** `GroupList` 9 sites vs 36 TSX `-row` classes (110 uses) vs the §7 spec; `LedgerRow` 2 sites. Row heights/dividers/pressed wash are re-implemented per page. §2.
14. **Table story is split**: `DataTable` has 1 consumer; 23 raw `<table>` in 21 files; 21 `role=table|grid`; the more complete keyboard model is unavailable to most tables. §2.
15. **Empty/skeleton chrome fragmented**: 6 empty-state primitives (`EmptyState`, `NoData`, `NoTeam`, `CrhStateBlock`, `EmptyShape`, `StateSignal`), 70 `-skel` classes, two opposing global rules for `.ch-empty-page` carding (shell.css vs ui.css:2579-2610). §2, §3.7.
16. **Token indirection chain hides intent**: 10+ names resolve to the one card shadow (`--ch-elevation-reading|lifted|framed|on-frame|feature`, `--ch-shadow-sm`, `--ch-sheet-shadow`, `--ch-card-shadow-flat`, tokens.css:669-737, 847, 885, 994); some bypass (`--ch-shs-s-card`, `--ch-ivory-100/25`, `white` at rounds.css:5224, raw `#efece3` in `.ch-inset` ui.css:699). 560 raw hex occurrences outside token files (ratcheted by `raw-colour-baseline.json`), 111 numeric `z-index` literals vs 55 `--ch-z*` tokens. §3.2.
17. **CSS size and ownership**: 105,516 lines/71 files; `stats.css` 219 KB, `home.css` 183 KB, `rounds.css` 180 KB, `shell.css` 156 KB (4,447 lines), `calendar.css` 136 KB; 777 dark-mode selectors keyed on a Fairway-named attribute `html[data-fw-theme='dark']` (36 files) although the doctrine says never read non-`--ch-*`/ch hooks. Per-page ownership is enforced (`scripts/clubhouse/css-owners.mjs`), cross-page primitives are not. 83 `!important` lines.
18. **Safe-area handling is copy-pasted**: 128 raw `env(safe-area-inset-*)` expressions, no token/mixin. §4.3.
19. **Form errors are announced three different ways** (alert, describedby, plain text) across 45 `aria-invalid` and 60 `role=alert` files because `Field` is unused; `.ch-field` is defined twice in controls.css (:201, :2037); `base.css:144` hard-codes input classes for the focus ring. §6.
20. **Catalog covers 3% of the truth**: 22 of 670 entries have an example (74 ui files, 22 examples); no props/variant/state metadata, no `Surface` `card`/`feature` examples, no Modal/FormSheet/Toast/Tooltip/DataTable/Field in the gallery. §8.
21. **Interactive card/pressed model is opt-in**: `useChPress` covers `.ch-btn,.ch-pill,[data-ch-press]` only; cards opt in via `data-ch-press-scale`; `Surface` and `GroupList` have no link/button mode, so each tappable card re-derives role, focus ring and wash. §3.1, §7.
22. **Text policy not shared** (`Truncate` unused, 186 ellipsis and 84 clamp rules, 132 wrap rules). §7.
23. **Press/haptic plumbing coupled to components by convention** (`haptic()` called in 8+ primitives with different semantics: Button via `feel`, Segmented always `select`, Switch/Checkbox/Slider own) — no `useHaptic`-style contract per behaviour [I].
24. **Behavioural duplication in roving/typeahead/keyboard**: `ui/use-roving.ts` (82) vs `lib/roving.ts` (69), `menuKeyDown`/`typeAhead` in Menu.tsx exported and reused by ContextMenu, DataTable's own roving, Segmented's own key handler (Segmented.tsx:104-117): four keyboard-nav implementations. [V for existence, I for divergence]
25. **Libraries installed but unused** (Radix 7 packages, `package.json:230-237`) while the tree re-implements dialog/tabs/toggle-group/popover/tooltip behaviour; the decision "not Radix" is defensible (Fairway isolation rule) but is not recorded next to the primitives and results in no shared test of behaviour parity. [I]

---

## 10. Proposed layering (proposal only, nothing applied)

Mapping existing files to eight layers. "(new)" = gap to fill; "(merge)" = fold duplicates.

**L0 Foundations** (tokens, motion, environment)
- `styles/tokens.css`, `auth-tokens.css`, `onboard-tokens.css`, `base.css`, `motion.css`, `lib/motion.ts`, `lib/fonts.ts`, `lib/type-scale.ts`, `lib/type-k.ts`, `lib/reduced-motion.ts`, `lib/phone-query.ts`, `lib/use-phone.ts`, `lib/safe-area.ts` + (new) `--ch-safe-*` tokens replacing 128 raw `env()` uses.
- Rename the elevation aliases to three canonical names (flat/card/raised) in `tokens.css`; keep the rest as deprecations.

**L1 Behavioural primitives** (headless, no look)
- `lib/dialog-lifetime.ts`, `lib/sheet-drag.ts`, `lib/overlay-scroll.ts`, `lib/focus-keeper.ts`, `lib/focus-quietly.ts`, `lib/use-popover-fit.ts`, `lib/roving.ts` + `ui/use-roving.ts` (merge), `ui/sheet-keyboard.ts`, `lib/press.ts`, `lib/haptics.ts`, `lib/slide-plate.ts`, `lib/use-busy.ts`, `lib/use-action.ts`, `menuKeyDown`/`typeAhead` (lift out of `Menu.tsx`), (new) `usePortalHost()` (the Toast/Picker/Peek "inside the open dialog" rule), (new) `useOverlay()` wrapper so Bell/TeamSwitch/quick-chat adopt the dialog lifetime.

**L2 Core primitives** (one component per job; variants not forks)
- Actions: `Button`, `IconButton`, (new) `ToggleButton/Chip`, `Tooltip`.
- Selection: `Segmented` (+ fold `PillGroup`), (new) `Tabs` (replace six hand-built tablists), `Switch`, `Checkbox`, `ChoiceGroup`, `Select`, `Slider`, `Stepper`.
- Inputs: `Field`, `ui .ch-input/.ch-textarea`, `SearchField`, `DateField`, `TimeField`, `PickerHost`.
- Feedback: `Badge`, `Spinner`, `Toast`, `InlineNotice/PageNotice`, `EmptyState` (absorb NoData/NoTeam/CrhStateBlock/EmptyShape/StateSignal), `Skeleton*`, `Truncate`, `Icon`, `Avatar`.
- Overlay shells: `Modal` (add busy/dirty guard from `FormSheet`), `FormSheet/ListSheet/ActionSheet`, `Menu`, `ContextMenu`, `Peek`.

**L3 Composed** (small compositions of L2)
- `Surface` rebuilt as compound: `Card` + `Card.Head/Body/Foot/Note/Actions` + `variant` flat/card/feature + `tone` (the option-F title bar) + `interactive` (href/onClick) + `state` (loading/empty/error), replacing the three flag styles. `Inset`. `Section` (flush ledger head). `GroupList/GroupRow`, `LedgerList/LedgerRow/FigureRow`, `FeatureCard` (becomes `Card variant="feature"`), `PageIntro`, `LargeTitle`, `PhoneBar`, `FormSheet` bar, `SectionBoundary/SectionGroup`, `Notices`, `ListPresence`, `Swap`, `SwipeRow`.

**L4 Analytical** (figures and charts)
- `ui/charts/*`, `ui/ScoreMark`, `Nine`, `FormLine`, `StatTerm`, `DeltaChip`, `WasValue`, `TrustChip`, `Zone`, `CrhLine`, plus `screens/stats/{charts,MiniCharts,LegBars,ScoreMixBar,ScoringFeatureChart,PuttBands,RoundTrend}.tsx` promoted when a second screen uses them; (new) `KpiTile` consuming `--ch-bg-subtle` tile recipe (§3.3).

**L5 Patterns** (behaviour + layout rules, 2+ screens)
- Summary-to-detail card (DESIGN_LANGUAGE §9), master-detail with `DataTable`, filter bar (Stats `StatsFilter`, Qualifiers pills, Practice find unified over `SearchField` + `Segmented`), form-in-sheet (`FormSheet` + `Field`), pushed-screen flow (`PhoneScreen` + `PhoneBar`), list with presence (`ListPresence` + `GroupRow`), summary card pager, command palette (`shell/command/*`), notification stack (`Bell*`).

**L6 Layouts**
- `shell/ClubhouseFrame`, `ClubhouseShell`, `RouteFrame`, `TopBar`, `Sidebar`, `NavPlate`, `RailToggle`, `SectionStrip`, `section-switch`, `phone-chrome`, `PhoneScreen`, `Dock`/`ThumbDock` (rename or delete), `PullToRefresh`, `OfflineBanner`, `ShellSkeleton`, `crumbs.tsx` (make a typed `Crumb{label,href}`), (new) `PageLayout` primitive encoding the 9 header compositions as 3 (phone root with large title, pushed, desk head).

**L7 Features**
- `screens/*` (18 areas), `live/*`, `routes/*`; each keeps only domain classes and fixtures; per-page `.ch-<prefix>-*` CSS retained but may no longer declare card/row/toggle/sheet chrome (candidate `css-quality` check: "no `background: var(--ch-card-bg)` + radius outside L3").

**Docs/discovery layer** (cuts across): extend `scripts/clubhouse/component-catalog.mjs` to emit props/variants/state coverage and usage counts; add the missing gallery examples (Surface card/feature, Modal guards, Toast, Tooltip, DataTable, Field, DateField) and a "dead primitives" gate (primitive with 0 non-test importers fails the check), plus a test counting `.ch-surface--feature` per view.

## 11. What could not be verified

- No git metadata in this checkout (not a repository): PR #2606 merge state, draft #2610 contents and `main`'s relation to QUEUE rows were not readable; look-09 status relies on `docs/clubhouse/QUEUE.md:528` and per-page changelogs.
- No browser/engine runs: interactive states, focus rings, touch behaviour and scroll-timeline support are read from code/CSS, not observed (no engine-tier evidence). Hover/press/disabled counts in §1 come from selector greps and are indicative only.
- Whether `data-ch-refresh='on'` and `data-ch-crh='on'` are on for every user in production (affects which Surface look ships).
- Card census (210 rules) is a heuristic over CSS declarations; cards expressed through nested selectors, custom properties or `@container` rules may be missed. Import counts ignore dynamic imports and barrel re-exports (none found for the 0-consumer primitives).
