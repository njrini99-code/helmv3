<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Same-day (2026-02-22) point-in-time audit cluster, superseded many times over by the 06-2026/07-2026 audit cadence (docs/audits/GOLFHELM_E2E_TAB_AUDIT_2026-06-20.md, docs/audits/DB_FORENSIC_AUDIT_2026-07-08.md, RLS Wave A #327).
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm College Coach — UI/Premium Design Audit
Date: 2026-02-22

---

## Overall Design Grade: B+

The college coach dashboard has a genuinely premium foundation — glass cards, skeleton loaders, a responsive sidebar, and consistent component patterns throughout. The biggest issues are **design token contamination** (raw blue-*, green-*, emerald-* colors scattered across components that should use primary-*/warm-*) and a **handful of animate-spin spinners** that violate the no-spinner rule. Fix those and this lands at A-.

---

## Design System Violations

| Component | Violation | Severity | Fix |
|-----------|-----------|----------|-----|
| `pipeline/page.tsx` — `PipelineStatsSummary` | `bg-blue-50 border-blue-200 text-blue-600 text-blue-900` for Watching card | HIGH | Replace with `bg-primary-50 border-primary-200 text-primary-600 text-primary-900` |
| `pipeline/page.tsx` — `PipelineStatsSummary` | `bg-green-50 border-green-200 text-green-600 text-green-900` for Committed card | HIGH | Replace with `bg-primary-50 border-primary-200 text-primary-600` (primary IS your green) |
| `pipeline/page.tsx` — `PipelineStatsSummary` | `bg-purple-50 border-purple-200 text-purple-600` for Offers card | MEDIUM | Use `bg-primary-50` or introduce a neutral semantic token; don't freestyle color |
| `coach/discover/PlayerCard.tsx` | `text-emerald-600` for name hover + watchlist `activeClass` | HIGH | Replace with `group-hover:text-primary-600` and `activeClass="text-primary-600"` |
| `coach/discover/PlayerCard.tsx` | `bg-emerald-600` for VerifiedBadge | MEDIUM | Replace with `bg-primary-600` (primary IS emerald per your theme) |
| `coach/discover/FilterPanel.tsx` | `animate-spin` div as loading indicator (line ~623) | HIGH | Replace with inline skeleton shimmer or remove — no spinners per design spec |
| `coach/discover/DiscoverView.tsx` | Two `animate-spin` spinners used as page-fetch indicator (lines 598, 640) | HIGH | Replace with subtle skeleton overlay or opacity transition on the grid |
| `coach/discover/TeamCard.tsx` | `bg-blue-50 text-blue-700` for high_school type badge; `bg-emerald-50 text-emerald-700` for JUCO | MEDIUM | Map to `primary-50/primary-700` and warm tokens consistently |
| `(public)/player/[id]/PlayerProfileClient.tsx` | `bg-blue-100 text-blue-800` for Class of {year} badge (line 342) | HIGH | Replace with `bg-warm-100 text-warm-800` or `bg-primary-100 text-primary-800` |
| `(public)/player/[id]/PlayerProfileClient.tsx` | `bg-blue-500 text-white` for Committed badge (line 415) | MEDIUM | Replace with `bg-primary-500 text-white` |
| `(public)/player/[id]/PlayerProfileClient.tsx` | `text-blue-600` for icon color (line 770) | LOW | Replace with `text-primary-600` |
| `(public)/player/[id]/PlayerProfileClient.tsx` | `animate-spin` inline div for watchlist button loading state (line 282) | HIGH | Replace with `isPending ? 'opacity-50 pointer-events-none' : ''` or a skeleton button state |
| `(dashboard)/dashboard/settings/recruiting-preferences/…client.tsx` | Raw `import { Loader2 }` from `lucide-react` + `animate-spin` (line 14, 287) | CRITICAL | Replace with `@/components/icons` equivalent or button loading state pattern |
| `(auth)/complete-signup/CompleteSignupClient.tsx` | `animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600` | MEDIUM | Not in coach dashboard scope but violates global rule; use skeleton |
| `(dashboard)/dashboard/team/JucoPlayerDashboard.tsx` | `text-green-600` for positive trend (line 133); `bg-blue-500` / `bg-green-500` for event type dots | LOW | Map to `text-primary-600` and `bg-primary-500` |
| `coach/discover/DiscoverView.tsx` & multiple | `text-slate-*` used everywhere (acceptable as neutral) but should migrate to `text-warm-*` | LOW | Systematic find-replace when bandwidth allows; not blocking |

---

## Page-by-Page Assessment

### Sidebar: A-

**What works:** Dark `#1C1917` background ✅. Full icon system from `@/components/icons` ✅. College coach sees clean recruiting nav (Dashboard, Command Center, Discover, Pipeline, Watchlist, Compare, Calendar, Camps, Messages) with zero team-management items ✅. Collapsible with smooth cubic-bezier animation ✅. Unread count badge on Messages ✅. Role-based nav switching is well-architected. Logo branding with full/icon states ✅.

**Needs fixing:**
- Active state styling was not fully visible in the read — verify it renders as `bg-primary-600/15 text-primary-400` or similar, not just a left-border tick
- Coach profile area at the bottom: confirm avatar + name + role subtitle are rendered with enough contrast on the dark background
- Mode toggle for JUCO coaches: clean UX but test that it's visually differentiated from nav items

---

### Dashboard Landing (College Coach): B

**What works:** Real Supabase queries (not hardcoded). Stats cards with actual data. Quick-action cards. Saved-search section. Layout feels like a functional SaaS tool, not a wireframe.

**Needs fixing:**
- Lines 182–183: `iconBg="bg-blue-50" iconColor="text-blue-500"` for the Messages stat card — should be `bg-primary-50` / `text-primary-500`
- Empty state for "No saved searches yet" is just a plain `text-sm text-slate-600` line — add an icon + EmptyState component for consistency
- Verify the hero/greeting section doesn't show hardcoded "0" counts on first load before data resolves — skeleton loaders needed on individual stat cards if they load async

---

### Command Center: A-

**What works:** This is the strongest page in the dashboard. `PlayerRosterCard` uses the full glass spec: `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm` ✅. `TeamStatCard` follows the same pattern ✅. `TrendIndicator` uses `text-primary-600` for improving trends ✅. Icon system consistent ✅. Calendar mini-view is clean. Tab toggle (roster/stats) is properly implemented.

**Needs fixing:**
- `StatChip` uses `bg-slate-50` and `text-slate-400/800` — acceptable neutrals but a warm-50 background would match the cream theme better
- The `insights` section (BaseballCoachInsight) — verify it has a proper empty state with icon, not just silence
- Consider making the Command Center feel more "war room" by giving the team stat cards slightly larger numbers and stronger visual hierarchy between the accent card and the regular cards

---

### Discover Page: B+

**What works:** Filter sidebar clean and well-organized. Player cards use glass cards (`bg-white/70 backdrop-blur-xl border border-white/40 rounded-[20px]`). Hover actions (heart/message) appear on hover — premium touch ✅. Avatar fallback with initials ✅. Mobile filter drawer with slide-in animation ✅. Active filter count badge on the mobile filter button ✅. `PlayerPeekPanel` and `TeamPeekPanel` wired correctly ✅.

**Needs fixing:**
- `text-emerald-600` hover color on player names in default/featured card variants — should be `primary-600`
- `DiscoverView` uses two `animate-spin` mini spinners for the "fetching new results" state (when filters change and old results are still visible). Replace with a subtle `opacity-60 pointer-events-none` transition on the grid + a thin progress bar at top
- `FilterPanel` has an `animate-spin` spinner in the map/heatmap section — replace with skeleton pulse
- Pagination: not read in detail — verify it follows premium pagination patterns (numbered buttons, prev/next with arrows) not a raw `<div>Page 1 of N</div>`
- Team type badges in `TeamCard` use blue/emerald literals — see violations table

---

### Player Peek Panel (PlayerPeekPanel.tsx): A-

**What works:** Header with Avatar (xl), name h2, school + location, position Badge + grad year Badge — clean and complete ✅. Quick stats 2-column grid with icon + label + value ✅. About section with line-clamp ✅. Bats/Throws inline row ✅. Loading skeleton matches panel layout exactly — correct proportions for header, grid, text block, button ✅. `PeekPanelRoot` abstraction is good architecture. Both action buttons properly styled.

**Needs fixing:**
- `StatItem` uses `bg-slate-50` background — consider `bg-warm-50` for better cream palette harmony
- "Updating..." loading state on watchlist button is a plain text change — acceptable but consider a subtle opacity dim + disabled state vs. inline text
- No empty/error state beyond "Player not found" plain text — add a small icon + styled message
- The `toast.error` / `toast.success` via `sonner` is inconsistent with the rest of the app using `useToast()` hook — unify the toast system

---

### Team Peek Panel (TeamPeekPanel.tsx): A

**What works:** Best-structured panel in the codebase. Logo with brand color tinting ✅. Quick stats grid (roster count, recruiting active count) using `bg-primary-50` ✅. Tab toggle with `bg-slate-900 text-white` for active — premium black pill tab ✅. Coaching staff cards clean with Avatar + name + role + "Head" pill ✅. Roster grouped by grad year with class labels ✅. Skeleton exactly matches the loaded state ✅. Empty roster state with icon + explanation text ✅.

**Needs fixing:**
- `emerald-50/emerald-600` for JUCO player type badge in roster tab (line ~) — should use `primary-50/primary-600`
- Contact Coach button routes to `?new=1` which is good, but verify the Messages page properly opens the composer

---

### Pipeline Page: B

**What works:** Kanban DnD with `@dnd-kit` — smooth drag with rotation/scale on `DragOverlay` ✅. List view with proper tab filters + count badges ✅. Empty state uses `glass-standard + ShineEffect` ✅. Bulk actions bar uses `glass-standard + ShineEffect` ✅. Keyboard navigation (j/k/Enter/x) with kbd hint display is editorial-grade ✅. Mobile card view. Position Planner view.

**Needs fixing:**
- `PipelineStatsSummary` — the 6 stat cards at top are a **major design system violation**: `bg-blue-50`, `bg-green-50`, `bg-purple-50` raw colors instead of `primary-*/warm-*`. These are the first thing a coach sees. Fix immediately.
- Desktop table uses `bg-white rounded-2xl border border-slate-200` (plain white) — consider `bg-white/80` with subtle glass treatment or at minimum `border-warm-200`
- `PipelineColumn` component not fully read — verify stage header uses design system colors (not raw purple/green/blue per status)
- Verify `PipelineCard` follows glass card spec like the Command Center cards

---

### Watchlist Page: B+

**What works:** Rich filter bar (search + 4 selects + clear). Export CSV feature ✅. Sortable columns with chevron indicators ✅. Bulk actions with `glass-standard + ShineEffect` ✅. Empty state with glass card + ShineEffect ✅. Quick Add modal with player search ✅. Mobile card view matches desktop table structure.

**Needs fixing:**
- **Critical UX flaw:** Bulk "Add Note" uses native `prompt()` dialog (line ~450) — completely breaks the premium feel. Replace with a proper `Modal` component (matches the existing Note Modal pattern already in the file)
- Note editing: the truncated note `substring(0, 20)` in the table cell is fine, but the clickable underlined text styling `text-xs text-slate-600 underline` looks weak — style it as a proper mini-button or chip
- "Saving..." text in the Note Modal save button should be a disabled state, not text change

---

### Compare Page: B+

**What works:** Glass `Card variant="glass"` for the search section ✅. Player count badge (X/4 players) ✅. Selected players as pill chips with avatar + name + X button ✅. Dashed placeholder slots in the empty state — clear affordance ✅. Skeleton with glass `glass-standard rounded-2xl animate-pulse` per slot ✅.

**Needs fixing:**
- "Searching..." plain text feedback while searching — replace with a subtle spinner or skeleton rows in the dropdown (this is the one valid spinner context)
- `PlayerComparison` component not audited here — the main comparison table itself needs to be checked for stat row alternating pattern, alignment, and remove-player affordance
- Empty state `IconTarget size={40}` in a `Card variant="glass"` looks good but the icon is too small for the amount of space — try size={48} with a colored icon background `bg-primary-100 rounded-2xl p-3`

---

### Messages: B

**What works:** Two-panel layout with proper mobile responsive (show/hide based on `mobileShowChat`) ✅. Loading skeleton for conversation list uses `animate-pulse` with avatar + two text lines ✅. Auto-selects first conversation on desktop ✅. URL-based deep linking to conversations ✅. New message modal flow ✅.

**Needs fixing:**
- Loading fallback for the right panel uses `<Loading />` component — need to verify this is a skeleton, not a spinner
- `bg-[#FAF6F1]` hardcoded hex background — technically this is the cream color but it should be `bg-cream` or a semantic class. Acceptable for now, low priority
- `ConversationList` and `ChatWindow` are lazy-loaded — verify their loading states are also skeleton-based (the lazy wrapper may show a flash)
- The conversation list/chat window quality depends entirely on `LazyConversationList` / `LazyChatWindow` components which were not read — these are the premium/non-premium determinants. Audit those separately if not already done.

---

### Program/Team Profile Page: B

**What works:** Auth-gated (only college/juco coaches can view) ✅. Logo display with fallback icon ✅. Division/Conference/Type badges ✅. Coaching staff in 2-column grid with avatar + name + role + optional bio ✅. `ProgramRoster` tab with real data ✅. Right sidebar with contact card + quick facts ✅.

**Needs fixing:**
- Hero card gradient (`bg-gradient-to-br from-primary-50 to-white`) is subtle — good but the hero feels thin without a cover photo. The logo at 96x96 needs more breathing room
- Coaching staff cards use `bg-white rounded-lg border border-slate-200 p-4` — border-radius is `rounded-lg` while the rest of the app uses `rounded-2xl`. Inconsistency.
- Contact Card uses `h3` with `text-sm font-semibold uppercase tracking-wide` as a section label — this is actually clean and consistent ✅
- Empty state: `<Card className="p-8 text-center"><p className="text-slate-500">No additional program information available.</p></Card>` — needs an icon (e.g., `IconBuilding` or `IconUsers`) and a subtitle explaining what will appear here
- Quick Facts sidebar card uses `bg-gradient-to-br from-primary-50 to-white` — nice ✅
- No hero banner/cover image — the program page looks significantly less impressive than a real D1 program page. Even a color swatch from `organization.primary_color` would elevate it

---

### Player Profile Page: B+

**What works:** Hero banner with custom image OR premium gradient fallback with glow effects ✅. Profile card overlapping banner (negative margin) is a premium editorial pattern ✅. Avatar with recruiting-activated badge (green checkmark) ✅. Tab navigation with icons + count badges ✅. `MetricCard` with highlight colors for key metrics ✅. `VideoCard` with hover overlay play button — premium ✅. Profile Activity gradient card (primary-500 to emerald-600) ✅. Schools of Interest with numbered rank + org logo ✅. `TeamsTab` grouped timeline with active badge ✅. `AchievementsTab` with amber gradient cards ✅.

**Needs fixing:**
- **Spinner violation:** Line 282 — `<div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />` inside the watchlist button loading state. Replace with `disabled + opacity-50` on the button
- `bg-blue-100 text-blue-800` for "Class of {year}" badge — must be `bg-primary-100 text-primary-800` or `bg-warm-100 text-warm-800`
- `bg-blue-500 text-white` for "Committed to X" badge — must be `bg-primary-500 text-white`
- `text-blue-600` for the `IconActivity` icon color in StatsTab Physical Profile heading — use `text-primary-600`
- `MetricCard` highlight variant: the `highlight` prop maps to `blue` as a raw color literal. Rename the prop values to semantic names (`primary`, `secondary`, `accent`) and update the maps
- Mobile: the header profile card is `rounded-2xl shadow-xl` but verify the shadow on mobile doesn't look harsh against the cream background — `shadow-xl` may need softening to `shadow-lg`
- "View All (N) Videos" button has no styling (`<button className="text-sm text-primary-600...">`) — add proper hover/focus states

---

## Critical Visual Issues (breaks premium feel)

- [ ] **Pipeline stats bar uses raw blue-*/green-*/purple-* colors** — first thing a college coach sees on their core workflow page — `pipeline/page.tsx` PipelineStatsSummary — replace ALL with `primary-*` / `warm-*` / semantic color system
- [ ] **PlayerCard hover color is `text-emerald-600`** — on every discover card, hovering a player name turns green instead of the design-system primary color — `PlayerCard.tsx` lines 213, 314 — change to `group-hover:text-primary-600`
- [ ] **3 animate-spin spinners in the discover flow** — `FilterPanel.tsx` (1), `DiscoverView.tsx` (2) — kills the skeleton-only rule on the most-used page — replace with opacity transitions or thin progress indicators
- [ ] **animate-spin on watchlist button in Player Profile** — `PlayerProfileClient.tsx` line 282 — noticeable inline spinner in a featured action button — use disabled opacity state instead
- [ ] **Raw `Loader2` from lucide-react in Settings** — `recruiting-preferences-client.tsx` lines 14, 287 — direct violation of icon system rule — replace with button loading state pattern
- [ ] **Bulk Add Note via `prompt()` in Watchlist** — `WatchlistClient.tsx` — browser native prompt dialog looks like 2002 — replace with the existing `Modal` component
- [ ] **Program profile coaching staff cards use `rounded-lg`** — breaks border-radius consistency (rest of app is `rounded-2xl`) — `program/[id]/page.tsx` staff grid — update to `rounded-2xl`

---

## Polish Items (makes it feel 10% better)

- [ ] **Sidebar active state** — verify the active nav item has `bg-white/10` or `text-primary-400` treatment with a left-accent bar; if it's just font-weight change it's too subtle — `sidebar.tsx`
- [ ] **PlayerPeekPanel `StatItem` background** — change from `bg-slate-50` to `bg-warm-50` for palette harmony with the cream background — `PlayerPeekPanel.tsx`
- [ ] **Compare empty state icon** — bump `IconTarget` to size 48 + add a `bg-primary-100 rounded-2xl p-3` wrapper instead of bare icon — `compare/page.tsx`
- [ ] **Dashboard empty saved searches** — plain text "No saved searches yet" — add an icon + EmptyState component — `coach/college/page.tsx`
- [ ] **Pipeline Kanban columns `PipelineColumn`** — verify stage header labels use a consistent color-coding system aligned with the status badge variants used in the list/table views (not ad-hoc colors)
- [ ] **"Searching..." text in Compare** — replace with 3 skeleton rows in the dropdown while searching — `compare/page.tsx`
- [ ] **Program page hero** — use `organization.primary_color` to tint the hero background for a branded feel per program — `program/[id]/page.tsx`
- [ ] **Note truncation UX in tables** — change the `text-xs text-slate-600 underline` note cell to a `text-xs bg-slate-100 px-2 py-0.5 rounded-full` chip that clearly says `+ note` when empty — `pipeline/page.tsx` + `WatchlistClient.tsx`
- [ ] **"Updating..." button text in PlayerPeekPanel** — use `disabled + opacity-50` on the button rather than text swap for a more polished feel — `PlayerPeekPanel.tsx`
- [ ] **Discover filter results count in Header subtitle** — consider animating the count change with a CSS `transition: opacity` on the subtitle when filters change — `discover/page.tsx`
- [ ] **Watchlist "Showing X of Y" count** — currently just `text-sm text-slate-500 text-center` — move to be left-aligned alongside pagination or make it a more styled label — `WatchlistClient.tsx`

---

## What Looks Great Already

- **Command Center player roster cards** — perfect glass card spec, avatar with jersey badge, trend indicator, stat chips — this is the benchmark the rest of the app should match
- **Team Peek Panel** — best-structured component in the codebase: logo with brand color tinting, clean header, black-pill tab toggle, roster grouped by grad year, skeleton matches exactly
- **Player Profile hero + banner** — the negative-margin profile card overlapping the hero banner is a genuinely premium pattern; gradient fallback with glow blobs is tasteful
- **Pipeline keyboard navigation** — j/k/Enter/x keyboard shortcuts with `<kbd>` hint display is editorial-grade UX
- **Pipeline empty state** — `glass-standard + ShineEffect + CTAButton` pattern is exactly right
- **Drag and drop with DragOverlay rotation** — the `rotate-[2deg] scale-105 shadow-xl` on the drag overlay is a professional touch
- **Mobile filter drawer** — slide-in animation, sticky apply button with result count, proper backdrop blur — better than most native apps
- **Discover active filter count badge** on the mobile filter button — small detail, big usability win
- **PlayerCard hover actions** — heart/message buttons appearing on hover with `opacity-0 group-hover:opacity-100` is clean and doesn't clutter the default state
- **TeamPeekPanel coaching staff** — "Head" pill badge with `text-primary-600 bg-primary-50 border border-primary-100 rounded-full` is premium
- **Compare selected-players pill chips** — Avatar + name + accessible X button in `bg-primary-50 border border-primary-200 rounded-full` — clean editorial pattern
- **Sidebar collapse/expand** with icon-to-logo crossfade is polished
- **Skeleton loaders across the board** — the team commitment to no-spinner/no-loading-text is almost fully honored; only 4 violations found

---

## Priority Fix List

1. **Pipeline PipelineStatsSummary raw color cleanup** — highest visual impact; first widget coaches see daily — `pipeline/page.tsx` lines 108–155
2. **PlayerCard `text-emerald-600` → `text-primary-600` hover** — every discover card is affected; the color mismatch is visible at a glance — `PlayerCard.tsx`
3. **Eliminate 3 animate-spin spinners in discover flow** — `FilterPanel.tsx`, `DiscoverView.tsx` — violates the core no-spinner rule on the highest-traffic page
4. **PlayerProfileClient `animate-spin` watchlist button + blue badge violations** — public-facing profile page seen by coaches AND players — `PlayerProfileClient.tsx`
5. **Settings `Loader2` from lucide-react** — raw import from wrong icon library — `recruiting-preferences-client.tsx`
6. **Watchlist bulk Add Note: replace `prompt()` with Modal** — single most jarring UX moment in the entire app — `WatchlistClient.tsx`
7. **Program page coaching staff `rounded-lg` → `rounded-2xl`** — border-radius inconsistency on a trust-building public page — `program/[id]/page.tsx`
8. **Program page hero: tint background with `organization.primary_color`** — makes every program page feel custom rather than generic — `program/[id]/page.tsx`
9. **TeamCard type badges: map blue-*/emerald-* → primary-*/semantic tokens** — `TeamCard.tsx` color config object lines 57–75
10. **Dashboard college landing: `iconBg bg-blue-50` → `bg-primary-50`** — small but breaks token discipline on the landing page — `coach/college/page.tsx` lines 182–183
