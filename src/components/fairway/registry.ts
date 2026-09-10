/**
 * Fairway component registry — the machine-readable "which component solves
 * this?" map. Agents and people consult it BEFORE adding UI (brief §22).
 *
 * Every `name` is a real export of `@/components/fairway` (enforced by
 * registry.test.ts). `replaces` names the vibe-coded pattern the component
 * retires; `avoidFor` is as important as `bestFor`.
 *
 * Archetypes (brief §7): A intelligence overview · B operational board ·
 * C analytical instrument · D workspace · E chronology · F drill/context detail.
 */
export type FairwayCategory =
  | 'architecture'
  | 'surface'
  | 'intelligence'
  | 'data-viz'
  | 'control'
  | 'overlay'
  | 'form'
  | 'feedback'
  | 'navigation';

export type FairwayMaterial = 'canvas' | 'matte' | 'inset' | 'raised' | 'float' | 'modal' | 'green';

export interface FairwayRegistryEntry {
  name: string;
  category: FairwayCategory;
  status: 'canonical' | 'preferred' | 'legacy' | 'new';
  /** Screen archetypes this belongs to. */
  archetypes: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'>;
  material: FairwayMaterial;
  bestFor: string[];
  avoidFor: string[];
  /** Vibe-coded patterns this retires. */
  replaces: string[];
  mobile: string;
  desktop: string;
  examples: string[];
}

export const FAIRWAY_REGISTRY: readonly FairwayRegistryEntry[] = [
  // ── Architecture ────────────────────────────────────────────────────────
  {
    name: 'AppShell', category: 'architecture', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'canvas',
    bestFor: ['every golf route'], avoidFor: ['marketing pages'], replaces: ['per-page shells', 'custom headers'],
    mobile: 'top bar + floating dock + More sheet', desktop: 'sidebar + content', examples: ['/golf/dashboard/*'],
  },
  {
    name: 'PageContainer', category: 'architecture', status: 'preferred', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'canvas',
    bestFor: ['page gutter + max width'], avoidFor: ['nested containers'], replaces: ['ad-hoc max-w/px wrappers'],
    mobile: '16px gutter', desktop: 'content max width', examples: [],
  },
  {
    name: 'ViewHeader', category: 'architecture', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'canvas',
    bestFor: ['the one h1 per view', 'eyebrow + title + one primary action', 'view segments'], avoidFor: ['section titles', 'a second header on the same view'],
    replaces: ['stacked greeting cards', 'hero cards with three pills'],
    mobile: 'large title collapses into the top bar', desktop: 'title row with actions right', examples: ['Coach dashboard', 'Rounds library'],
  },
  {
    name: 'Spine', category: 'architecture', status: 'canonical', archetypes: ['A'], material: 'green',
    bestFor: ['the ONE structural green region: identity, standing, priorities, ledger, CTA', '`readouts` for multi-fact rows under the verdict instead of folding them into the verdict sentence', '`urgent` for a marked row before the ledger (fixes urgent-after-ledger ordering vs. pushing it through `children`)'], avoidFor: ['a second green block on the same screen', 'body copy'],
    replaces: ['profile hero card + separate stats card + separate CTA card'],
    mobile: 'stacks above the stage', desktop: 'left column, sticky', examples: ['Player dossier', 'CoachHelm home'],
  },
  {
    name: 'StageRouter', category: 'architecture', status: 'canonical', archetypes: ['A', 'C'], material: 'canvas',
    bestFor: ['overview → drill views that replace the stage'], avoidFor: ['tabs as page architecture', 'accordions'],
    replaces: ['17,000px single scroll', 'accordion per category'],
    mobile: 'stage swaps in place, back returns scroll', desktop: 'stage beside the Spine', examples: ['Player game', 'Player stats'],
  },
  {
    name: 'Bento', category: 'architecture', status: 'canonical', archetypes: ['A'], material: 'canvas',
    bestFor: ['asymmetric overview: one 2×2 hero cell + supporting cells'], avoidFor: ['equal KPI grids', 'more than 6 cells'],
    replaces: ['4 equal MetricCards in a row'],
    mobile: 'single column, hero first', desktop: '12-col asymmetric grid', examples: ['CoachHelm home', 'Coach dashboard'],
  },
  {
    name: 'BentoCell', category: 'architecture', status: 'canonical', archetypes: ['A'], material: 'matte',
    bestFor: ['one cell of a Bento; size expresses importance'], avoidFor: ['a cell with no data visual'], replaces: ['Surface + h3 + number'],
    mobile: 'full width', desktop: 'span by importance', examples: [],
  },
  {
    name: 'MatrixBoard', category: 'architecture', status: 'canonical', archetypes: ['B'], material: 'matte',
    bestFor: ['who needs attention', 'team comparison', 'ranking', 'triage', '`onRowSelect` for a board whose bare (non-expanding) rows navigate/select instead of expanding', '`hideOnMobile` to hide a per-board column below 940px beyond the built-in set'], avoidFor: ['single KPI', 'free-form content', 'fewer than 3 rows'],
    replaces: ['player card gallery', 'one chart per player', '25 profile cards'],
    mobile: 'compressed rows + sheet detail; identity column defaults to a wider `minmax(0,2fr)` track so names truncate only after metric columns shrink', desktop: 'board + inline expand or right inspector', examples: ['Roster', 'Team stats', 'CoachHelm players'],
  },
  {
    name: 'Filmstrip', category: 'architecture', status: 'canonical', archetypes: ['E'], material: 'matte',
    bestFor: ['a round hole by hole', 'a season round by round', 'anything with chronology'], avoidFor: ['unordered lists'],
    replaces: ['9 accordions', 'hole cards'],
    mobile: 'horizontal strip, snap', desktop: 'strip with detail below', examples: ['Round review', 'Rounds library'],
  },
  {
    name: 'DrillPanel', category: 'architecture', status: 'canonical', archetypes: ['F'], material: 'raised',
    bestFor: ['selected evidence in context', 'inline expansion under a row'], avoidFor: ['a modal for every detail'],
    replaces: ['navigate-away detail pages for small details'],
    mobile: 'bottom sheet', desktop: 'inline or right inspector', examples: ['Signals', 'Roster row detail'],
  },
  {
    name: 'Toolbar', category: 'architecture', status: 'canonical', archetypes: ['B', 'D', 'E'], material: 'float',
    bestFor: ['filters, view switching, date navigation as ONE composed bar', 'frame="bare" (default): no box, a hairline at rest, the frost bar only while stuck'], avoidFor: ['a single button', 'wrapping it in a Surface or placing it above a list as a card (frame="card" is for a bar floating over a canvas)'],
    replaces: ['4+ loose pills above a grid', 'full-width select + full-width search stacked', 'a pill-shaped toolbar card above a list card'],
    mobile: 'one bare row, overflow into a sheet', desktop: 'one bare sticky row, right-aligned actions; set --fw-toolbar-bleed to the page padding so the stuck bar runs edge to edge', examples: ['Calendar', 'Rounds library'],
  },
  {
    name: 'ResizableWorkspace', category: 'architecture', status: 'new', archetypes: ['D'], material: 'canvas',
    bestFor: ['desktop queue | evidence | assistant', 'schedule lane + inspector'], avoidFor: ['mobile (renders center-only by default)', 'a single-pane view'],
    replaces: ['fixed-width flex columns with no resize', 'bespoke pointer-drag splitter code'],
    mobile: 'center pane only by default, or a consumer-owned renderMobile layout', desktop: 'pointer + keyboard resizable panes, user-touched layout persisted, collapsible sides, defaultCollapsed (media-query friendly) for the inspector below 2xl', examples: ['Signals workspace', 'Practice planner'],
  },
  // ── Surfaces ────────────────────────────────────────────────────────────
  {
    name: 'Surface', category: 'surface', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'matte',
    bestFor: ['one matte information surface with internal seams'], avoidFor: ['wrapping every section', 'nesting inside another Surface'],
    replaces: ['Card', 'card stacks'],
    mobile: 'edge-to-edge or 16px gutter', desktop: 'panel', examples: [],
  },
  {
    name: 'Inset', category: 'surface', status: 'canonical', archetypes: ['A', 'B', 'C', 'F'], material: 'inset',
    bestFor: ['a recessed group inside a surface'], avoidFor: ['outer shadow', 'inset inside inset'], replaces: ['card inside card'],
    mobile: '', desktop: '', examples: [],
  },
  {
    name: 'InsetGroup', category: 'surface', status: 'new', archetypes: ['F'], material: 'inset',
    bestFor: ['metadata rows with seams: venue, description, invited', 'settings rows'], avoidFor: ['numbers (use StatMatrix)'],
    replaces: ['location card + description card + attendee card'],
    mobile: 'full width rows, 44px', desktop: 'same', examples: ['Event sheet', 'Settings'],
  },
  {
    name: 'StatMatrix', category: 'surface', status: 'new', archetypes: ['A', 'B', 'F'], material: 'inset',
    bestFor: ['2–6 related numbers as ONE object'], avoidFor: ['one number', 'unrelated numbers'],
    replaces: ['four response cards', 'a row of MetricCards'],
    mobile: '2×2', desktop: '4 columns', examples: ['Event responses', 'Team stats header'],
  },
  {
    name: 'ScrollArea', category: 'surface', status: 'new', archetypes: ['A', 'B', 'D'], material: 'canvas',
    bestFor: ['a queue/rail/panel that scrolls independently of the page', 'a ResizableWorkspace pane'], avoidFor: ['the page body itself', 'content that already fits without scrolling'],
    replaces: ['bespoke overflow-y-auto + manual scrollbar CSS', 'nested scroll divs with no edge fade'],
    mobile: 'native momentum scroll, overscroll-behavior: contain', desktop: 'compact 8px scrollbar, edge fade', examples: ['ResizableWorkspace panes'],
  },
  {
    name: 'StatStrip', category: 'surface', status: 'canonical', archetypes: ['A', 'B', 'E'], material: 'matte',
    bestFor: ['a compact KPI band under a title'], avoidFor: ['hero metrics'], replaces: ['5 KPI cards above a list'],
    mobile: 'scrolling strip', desktop: 'one row', examples: ['Rounds library'],
  },
  {
    name: 'Elevated', category: 'surface', status: 'canonical', archetypes: ['A', 'F'], material: 'raised',
    bestFor: ['the selected object', 'the one raised insight'], avoidFor: ['static content'], replaces: ['shadow-xl for looks'],
    mobile: '', desktop: '', examples: [],
  },
  {
    name: 'GlassSurface', category: 'surface', status: 'canonical', archetypes: ['D'], material: 'float',
    bestFor: ['floating chrome: top bar, command, hero, overlay, chrome'], avoidFor: ['body copy', 'tables', 'calendar body', 'every card'],
    replaces: ['bespoke backdrop-filter recipes'],
    mobile: 'blur downshifts', desktop: '', examples: ['Command menu', 'Calendar masthead'],
  },
  {
    name: 'InstrumentPanel', category: 'surface', status: 'canonical', archetypes: ['C'], material: 'green',
    bestFor: ['a rich instrument moment: effectiveness, strokes gained'], avoidFor: ['more than one per screen', 'text'],
    replaces: ['metric card + chart card'],
    mobile: '', desktop: '', examples: ['Player dossier SG instrument', 'Effectiveness'],
  },
  {
    name: 'InstrumentCluster', category: 'surface', status: 'canonical', archetypes: ['C'], material: 'green',
    bestFor: ['one primary readout + gauge + supporting readouts'], avoidFor: ['4 metric cards + chart'], replaces: ['KPI grid'],
    mobile: '', desktop: '', examples: ['Effectiveness'],
  },
  // ── Intelligence ────────────────────────────────────────────────────────
  {
    name: 'InsightCard', category: 'intelligence', status: 'canonical', archetypes: ['A'], material: 'raised',
    bestFor: ['the ONE top insight'], avoidFor: ['a feed of insight cards', 'prose that should be a chart'], replaces: ['AI prose cards ×3'],
    mobile: '', desktop: '', examples: ['CoachHelm home'],
  },
  {
    name: 'InsightPanel', category: 'intelligence', status: 'canonical', archetypes: ['D', 'F'], material: 'matte',
    bestFor: ['reasoning + evidence + action beside a selection'], avoidFor: ['standalone'], replaces: ['modal explanation'],
    mobile: 'sheet', desktop: 'right column', examples: ['Signals'],
  },
  {
    name: 'PriorityList', category: 'intelligence', status: 'canonical', archetypes: ['A'], material: 'matte',
    bestFor: ['what to do first'], avoidFor: ['unordered'], replaces: ['bullet prose'],
    mobile: '', desktop: '', examples: ['Spine'],
  },
  {
    name: 'StandingBars', category: 'intelligence', status: 'canonical', archetypes: ['A', 'B'], material: 'matte',
    bestFor: ['where do I rank vs team / tour: labeled You / Team / Reference bars, diverging for strokes gained'], avoidFor: ['a lone dot on a rail'], replaces: ['StandingTrack', 'StandingStrip', 'legacy StandingBar', '"you are top quartile" text'],
    mobile: 'frame="bare" inside a host card', desktop: 'className="text-text-on-accent" on the Spine gradient', examples: ['Spine', 'Player stats', 'Round review'],
  },
  {
    name: 'MetricCard', category: 'intelligence', status: 'legacy', archetypes: ['A'], material: 'matte',
    bestFor: ['a single standalone metric with its own trend, at most two per view'], avoidFor: ['rows of 4', 'KPI grids'],
    replaces: [], mobile: '', desktop: '', examples: [],
  },
  {
    name: 'Readout', category: 'intelligence', status: 'canonical', archetypes: ['C'], material: 'green',
    bestFor: ['a calibrated number in an instrument'], avoidFor: ['outside an instrument'], replaces: ['big number in a card'],
    mobile: '', desktop: '', examples: [],
  },
  // ── Data viz ────────────────────────────────────────────────────────────
  { name: 'Sparkline', category: 'data-viz', status: 'canonical', archetypes: ['A', 'B'], material: 'matte', bestFor: ['am I improving, inline'], avoidFor: ['noisy 90-point series in a 60px box'], replaces: ['trend text'], mobile: '', desktop: '', examples: [] },
  { name: 'TrendChart', category: 'data-viz', status: 'canonical', archetypes: ['A', 'C'], material: 'matte', bestFor: ['how did this evolve'], avoidFor: ['a chart with a title and legend floating in a white card', 'fewer than 4 points'], replaces: ['prose trend summary'], mobile: '', desktop: '', examples: ['Performance trend'] },
  { name: 'StrokesGainedTornado', category: 'data-viz', status: 'canonical', archetypes: ['A', 'C'], material: 'matte', bestFor: ['what hurts me most'], avoidFor: ['a single category'], replaces: ['leak prose'], mobile: '', desktop: '', examples: ['Player stats'] },
  { name: 'DivergingBars', category: 'data-viz', status: 'canonical', archetypes: ['B', 'C'], material: 'matte', bestFor: ['above / below baseline'], avoidFor: ['unsigned values'], replaces: ['+/- text columns'], mobile: '', desktop: '', examples: [] },
  { name: 'ShotDispersion', category: 'data-viz', status: 'canonical', archetypes: ['C'], material: 'matte', bestFor: ['where are the misses'], avoidFor: ['fewer than 10 shots'], replaces: ['miss direction cards'], mobile: '', desktop: '', examples: ['Driving drill'] },
  { name: 'PuttingHeatmap', category: 'data-viz', status: 'canonical', archetypes: ['C'], material: 'matte', bestFor: ['putting weakness by distance'], avoidFor: ['one round'], replaces: ['make-rate rows'], mobile: '', desktop: '', examples: ['Putting drill'] },
  { name: 'RampMatrix', category: 'data-viz', status: 'canonical', archetypes: ['C'], material: 'matte', bestFor: ['distance band × outcome'], avoidFor: ['sparse data'], replaces: ['make-rate rows per band'], mobile: '', desktop: '', examples: [] },
  { name: 'GenomeFingerprint', category: 'data-viz', status: 'canonical', archetypes: ['A'], material: 'matte', bestFor: ['what is my profile'], avoidFor: ['fewer than 3 dimensions'], replaces: ['persona prose'], mobile: '', desktop: '', examples: ['Genome'] },
  { name: 'RailBars', category: 'data-viz', status: 'canonical', archetypes: ['A', 'C'], material: 'matte', bestFor: ['rate vs benchmark, several rows'], avoidFor: ['no benchmark'], replaces: ['percent text rows'], mobile: '', desktop: '', examples: ['Player dossier'] },
  { name: 'RingGauge', category: 'data-viz', status: 'canonical', archetypes: ['B'], material: 'matte', bestFor: ['a composite in a board cell'], avoidFor: ['hero'], replaces: ['score text in a cell'], mobile: '', desktop: '', examples: ['MatrixBoard'] },
  { name: 'RankCell', category: 'data-viz', status: 'canonical', archetypes: ['B'], material: 'matte', bestFor: ['rank in a board'], avoidFor: ['outside a board'], replaces: ['#3 text'], mobile: '', desktop: '', examples: ['Team stats'] },
  { name: 'SignalChip', category: 'data-viz', status: 'canonical', archetypes: ['B', 'D'], material: 'matte', bestFor: ['severity / state at a glance'], avoidFor: ['decorative color'], replaces: ['3 competing badge colors'], mobile: '', desktop: '', examples: ['Signals'] },
  { name: 'TickerStrip', category: 'data-viz', status: 'canonical', archetypes: ['E'], material: 'matte', bestFor: ['a compact chronology of values'], avoidFor: ['unordered values'], replaces: ['last-10 bar card'], mobile: '', desktop: '', examples: ['Rounds'] },
  { name: 'RadialGauge', category: 'data-viz', status: 'canonical', archetypes: ['C'], material: 'green', bestFor: ['confidence, effectiveness'], avoidFor: ['every percentage'], replaces: ['percent in a card'], mobile: '', desktop: '', examples: ['Effectiveness'] },
  { name: 'GradeDots', category: 'data-viz', status: 'canonical', archetypes: ['E'], material: 'matte', bestFor: ['hole grades along a strip'], avoidFor: ['a single grade'], replaces: ['letter-grade badge as hero'], mobile: '', desktop: '', examples: ['Round review'] },
  { name: 'DataTable', category: 'data-viz', status: 'canonical', archetypes: ['B', 'D'], material: 'matte', bestFor: ['real tables: sort, filter, density'], avoidFor: ['3 rows'], replaces: ['row cards', 'repeated Surfaces pretending to be a table'], mobile: 'compressed rows', desktop: 'sticky columns, row menus', examples: ['Recruiting'] },
  // ── Controls ────────────────────────────────────────────────────────────
  { name: 'Button', category: 'control', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'raised', bestFor: ['one primary per screen', 'shape="block" for sticky CTAs'], avoidFor: ['three pills in a hero', 'ghost for the primary'], replaces: ['legacy ui/button'], mobile: '44px on coarse pointers', desktop: '', examples: [] },
  { name: 'IconButton', category: 'control', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'raised', bestFor: ['icon-only actions with a label'], avoidFor: ['every icon in a circle'], replaces: [], mobile: '', desktop: '', examples: [] },
  { name: 'Segmented', category: 'control', status: 'canonical', archetypes: ['A', 'B', 'E'], material: 'inset', bestFor: ['2–5 mutually exclusive views'], avoidFor: ['page architecture', 'a giant control as the first thing on a page'], replaces: ['tab bars for view modes'], mobile: 'fits one row', desktop: 'inside the toolbar', examples: ['Calendar mode'] },
  { name: 'Tabs', category: 'control', status: 'canonical', archetypes: ['D', 'F'], material: 'matte', bestFor: ['sections inside a detail'], avoidFor: ['top-level page architecture'], replaces: ['button rows that toggle content'], mobile: '', desktop: '', examples: [] },
  { name: 'FilterPill', category: 'control', status: 'canonical', archetypes: ['B', 'D'], material: 'inset', bestFor: ['toggleable filters inside a toolbar'], avoidFor: ['4+ loose in a region'], replaces: ['secondary Buttons used as filters'], mobile: '', desktop: '', examples: [] },
  { name: 'Chip', category: 'control', status: 'canonical', archetypes: ['A', 'B', 'F'], material: 'inset', bestFor: ['a compact label'], avoidFor: ['chips as buttons'], replaces: ['Badge for non-status labels'], mobile: '', desktop: '', examples: [] },
  { name: 'StatusPill', category: 'control', status: 'canonical', archetypes: ['B', 'F'], material: 'inset', bestFor: ['semantic state'], avoidFor: ['decoration'], replaces: ['colored text'], mobile: '', desktop: '', examples: [] },
  { name: 'Avatar', category: 'control', status: 'canonical', archetypes: ['A', 'B', 'F'], material: 'matte', bestFor: ['identity'], avoidFor: ['giant headshots'], replaces: ['initials divs'], mobile: '', desktop: '', examples: [] },
  { name: 'AvatarGroup', category: 'control', status: 'canonical', archetypes: ['B', 'F'], material: 'matte', bestFor: ['who is involved'], avoidFor: [], replaces: ['attendee card list'], mobile: '', desktop: '', examples: ['Event sheet'] },
  { name: 'PlayerIdentity', category: 'control', status: 'canonical', archetypes: ['B'], material: 'matte', bestFor: ['a player in a board row'], avoidFor: [], replaces: ['player card header'], mobile: '', desktop: '', examples: ['Roster'] },
  // ── Overlays ────────────────────────────────────────────────────────────
  { name: 'Sheet', category: 'overlay', status: 'canonical', archetypes: ['F'], material: 'modal', bestFor: ['mobile detail, filters, creation, actions', 'material="frost" when it floats above a stage'], avoidFor: ['desktop-only flows'], replaces: ['navigate-away detail on phones'], mobile: 'bottom, detents', desktop: 'docked right (matte)', examples: ['Event sheet', 'More sheet'] },
  { name: 'ModalShell', category: 'overlay', status: 'canonical', archetypes: ['F'], material: 'modal', bestFor: ['focused tasks and confirmations'], avoidFor: ['every detail'], replaces: ['legacy ui/dialog'], mobile: 'full-height', desktop: 'centered', examples: ['Event editor'] },
  { name: 'ConfirmModal', category: 'overlay', status: 'canonical', archetypes: ['F'], material: 'modal', bestFor: ['a destructive or cautionary confirm (delete, reset, discard-adjacent)'], avoidFor: ['unsaved-input discard (use DiscardChangesModal)', 'anything needing more than a title + one message + two buttons'], replaces: ['legacy ui/confirm-dialog', 'file-local ModalShell confirm recipes'], mobile: 'small centered', desktop: 'small centered', examples: ['Delete account', 'Reset notification preferences', 'Delete all classes'] },
  { name: 'PopoverPanel', category: 'overlay', status: 'canonical', archetypes: ['B', 'D'], material: 'float', bestFor: ['menus, notification panel'], avoidFor: ['long content'], replaces: ['custom absolute dropdowns'], mobile: 'sheet fallback', desktop: 'anchored', examples: ['Notifications'] },
  { name: 'CommandMenu', category: 'overlay', status: 'canonical', archetypes: ['D'], material: 'float', bestFor: ['fast global search and actions'], avoidFor: ['a hero search page'], replaces: ['a search page'], mobile: 'full sheet', desktop: '⌘K', examples: [] },
  { name: 'Menu', category: 'overlay', status: 'new', archetypes: ['B', 'D'], material: 'float', bestFor: ['row/overflow action menus', 'context menus with icons, shortcuts, destructive items'], avoidFor: ['long scrolling content (use Sheet)', 'a single action (use a Button)'], replaces: ['src/components/ui/dropdown-menu.tsx', 'src/components/ui/row-actions-menu.tsx', 'hand-rolled absolute dropdowns'], mobile: 'same floating panel, collision-aware', desktop: 'anchored, roving-tabindex keyboard nav', examples: [] },
  { name: 'Tooltip', category: 'overlay', status: 'new', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'float', bestFor: ['icon-only control labels', 'truncated text or shortcuts on desktop hover'], avoidFor: ['mobile-only flows (no hover surface)', 'content the user must interact with (use Menu/PopoverPanel)'], replaces: ['title attribute tooltips', 'ad-hoc absolute-positioned label spans'], mobile: 'renders the trigger only — no hover surface', desktop: 'hover/focus reveal, 120ms fade, no arrow', examples: [] },
  // ── Forms ───────────────────────────────────────────────────────────────
  { name: 'FormSection', category: 'form', status: 'canonical', archetypes: ['F'], material: 'matte', bestFor: ['grouped fields sharing spacing'], avoidFor: ['a card per field'], replaces: ['field cards'], mobile: '', desktop: '', examples: ['Qualifier editor'] },
  { name: 'FormField', category: 'form', status: 'canonical', archetypes: ['F'], material: 'matte', bestFor: ['label above, helper/error below'], avoidFor: ['placeholder as the only label'], replaces: ['bespoke label + input stacks'], mobile: '', desktop: '', examples: [] },
  { name: 'SettingsGroup', category: 'form', status: 'canonical', archetypes: ['F'], material: 'inset', bestFor: ['native grouped settings'], avoidFor: ['settings cards in cards'], replaces: ['a Surface per setting'], mobile: 'iOS-like groups', desktop: 'two-column', examples: ['Settings'] },
  // ── Feedback ────────────────────────────────────────────────────────────
  { name: 'EmptyState', category: 'feedback', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'matte', bestFor: ['no data with context and one action'], avoidFor: ['dashes in a grid', 'a lock icon in a card'], replaces: ['— placeholders'], mobile: '', desktop: '', examples: [] },
  { name: 'InlineNotice', category: 'feedback', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'inset', bestFor: ['a local, quiet notice'], avoidFor: ['stacking two notices'], replaces: ['toast for persistent state'], mobile: '', desktop: '', examples: [] },
  { name: 'Skeleton', category: 'feedback', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'matte', bestFor: ['loading that preserves layout'], avoidFor: ['full-page spinner'], replaces: ['Loading… text'], mobile: '', desktop: '', examples: [] },
  { name: 'Progress', category: 'feedback', status: 'new', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'matte', bestFor: ['completion of a running process: upload, import, sync'], avoidFor: ['a static measure against a benchmark (use Meter)', 'a single percentage KPI (use a RadialGauge/StatTile)'], replaces: ['ad-hoc h-2 bg-gray-200 bars', 'one-off page-local progress bars'], mobile: '', desktop: '', examples: [] },
  { name: 'Meter', category: 'feedback', status: 'new', archetypes: ['A', 'C'], material: 'matte', bestFor: ['a value measured against a known good range or band'], avoidFor: ['a running process (use Progress)', 'no band or target to measure against'], replaces: ['percent text with no visual band context'], mobile: '', desktop: '', examples: [] },
  // ── Navigation ──────────────────────────────────────────────────────────
  { name: 'FairwayBottomNav', category: 'navigation', status: 'canonical', archetypes: ['A', 'B', 'C', 'D', 'E', 'F'], material: 'float', bestFor: ['the floating dock: 4–5 destinations + More'], avoidFor: ['a second floating bar near the bottom'], replaces: ['solid tab bar'], mobile: '60px frost capsule', desktop: 'hidden', examples: [] },
  { name: 'FairwayHubSubNav', category: 'navigation', status: 'canonical', archetypes: ['A', 'B'], material: 'float', bestFor: ['sibling views under one hub'], avoidFor: ['tabs as page architecture elsewhere'], replaces: ['per-page tab bars'], mobile: 'sticky under top bar', desktop: '', examples: ['Rounds & Stats'] },
] as const;

export const FAIRWAY_REGISTRY_BY_NAME: ReadonlyMap<string, FairwayRegistryEntry> = new Map(
  FAIRWAY_REGISTRY.map((e) => [e.name, e]),
);

/** Which registered component answers a question (brief §14). */
export const QUESTION_TO_VISUAL: ReadonlyArray<readonly [question: string, component: string]> = [
  ['Am I improving?', 'TrendChart'],
  ['What changed?', 'Sparkline'],
  ['What hurts me most?', 'StrokesGainedTornado'],
  ['Where do I rank?', 'StandingBars'],
  ['Who needs attention?', 'MatrixBoard'],
  ['Where are misses?', 'ShotDispersion'],
  ['Where is putting weakness?', 'PuttingHeatmap'],
  ['What is my profile?', 'GenomeFingerprint'],
  ['What should I do first?', 'PriorityList'],
  ['What happened during the round?', 'Filmstrip'],
  ['How confident are we?', 'Readout'],
  ['What is above/below baseline?', 'DivergingBars'],
  ['How did this evolve?', 'TickerStrip'],
];
