'use client';

/* eslint-disable helm/no-arbitrary-text-px, helm/no-raw-button, jsx-a11y/aria-role */

/**
 * ============================================================================
 * Fairway — gated preview / showcase route (DEV-ONLY, ADDITIVE)
 * ----------------------------------------------------------------------------
 * A standalone gallery of every Wave-1 Fairway primitive in its key states and
 * variants, rendered with realistic golf / CoachHelm content. It exists so the
 * design system can be *seen* — it is NOT linked into the app nav, imports no
 * existing page/component, and changes nothing in the live app.
 *
 * The whole page is wrapped in the `.fairway-ds` scope on a `bg-canvas` page so
 * the Fairway tokens/fonts resolve (see `@/lib/redesign/flag`). Everything is
 * imported from the integrated barrel `@/components/fairway`.
 * ========================================================================== */

import * as React from 'react';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  IconHome,
  IconUsers,
  IconCalendar,
  IconChart,
  IconTarget,
  IconSettings,
  IconLogOut,
  IconPlus,
  IconEdit,
  IconTrash,
  IconEye,
  IconFilter,
} from '@/components/icons';
import {
  // app-shell
  AppShell,
  PageContainer,
  Eyebrow,
  type NavSection,
  // view-header
  ViewHeader,
  type ViewHeaderSegment,
  // surfaces
  Surface,
  Inset,
  Elevated,
  GlassSurface,
  // cards-insight
  MetricCard,
  InsightCard,
  InsightPanel,
  // controls
  Button,
  IconButton,
  Segmented,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  StatusPill,
  FilterPill,
  Badge,
  Chip,
  Avatar,
  AvatarGroup,
  Toolbar,
  // forms
  Form,
  FormSection,
  FormField,
  Input,
  TextArea,
  Select,
  NumberField,
  Checkbox,
  Switch,
  RadioGroup,
  // data-table
  DataTable,
  type ColumnDef,
  // calendar
  CalendarSurface,
  DatePicker,
  // charts
  TrendChart,
  StrokesGainedTornado,
  type TrendPoint,
  type SGCategory,
  // charts — phase-1 batch
  Sparkline,
  TrendChip,
  StatTile,
  GenomeFingerprint,
  type GenomeDimension,
  // pages · coachhelm — phase-2 composites
  CoachHelmShell,
  CoachHelmSubNav,
  FocusAreaCard,
  type FocusAreaCardData,
  // feedback
  ToastStack,
  fairwayToast,
  InlineNotice,
  EmptyState,
  InsufficientData,
  SkeletonCard,
  OnboardingStep,
  OnboardingSteps,
  // overlays
  ModalShell,
  Sheet,
  PopoverPanel,
  // command
  SearchField,
  CommandMenu,
  type CommandGroup,
  type CommandItem,
} from '@/components/fairway';

/* ------------------------------------------------------------------------- */
/* Section scaffolding                                                        */
/* ------------------------------------------------------------------------- */

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5">
        <h2 className="font-fw-display text-title-2 text-text-primary">{title}</h2>
        {blurb ? (
          <p className="mt-1 max-w-2xl font-fw-sans text-body-sm text-text-secondary">{blurb}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-fw-mono text-[11px] uppercase tracking-wide text-text-tertiary">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Sample golf data                                                          */
/* ------------------------------------------------------------------------- */

const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [
      { label: 'Home', href: '#', icon: IconHome, active: true },
      { label: 'Roster', href: '#', icon: IconUsers, badge: 12 },
      { label: 'Calendar', href: '#', icon: IconCalendar },
    ],
  },
  {
    heading: 'CoachHelm',
    items: [
      { label: 'Stats', href: '#', icon: IconChart },
      { label: 'Qualifiers', href: '#', icon: IconTarget, badge: 3 },
    ],
  },
];

interface PlayerRow {
  id: string;
  name: string;
  classYear: string;
  scoring: number;
  sg: number;
  status: 'qualified' | 'bubble' | 'out';
}

const PLAYER_ROWS: PlayerRow[] = [
  { id: 'p1', name: 'Mason Reed', classYear: 'Jr', scoring: 71.2, sg: 1.8, status: 'qualified' },
  { id: 'p2', name: 'Eli Carter', classYear: 'So', scoring: 72.6, sg: 0.9, status: 'qualified' },
  { id: 'p3', name: 'Owen Blake', classYear: 'Sr', scoring: 73.4, sg: 0.3, status: 'bubble' },
  { id: 'p4', name: 'Liam Foster', classYear: 'Fr', scoring: 74.1, sg: -0.4, status: 'bubble' },
  { id: 'p5', name: 'Noah Pierce', classYear: 'Jr', scoring: 75.0, sg: -1.1, status: 'out' },
  { id: 'p6', name: 'Caleb Hunt', classYear: 'So', scoring: 75.8, sg: -1.6, status: 'out' },
];

const PLAYER_COLUMNS: ColumnDef<PlayerRow, unknown>[] = [
  { accessorKey: 'name', header: 'Player', meta: { noWrap: true } },
  { accessorKey: 'classYear', header: 'Class', meta: { align: 'center' } },
  {
    accessorKey: 'scoring',
    header: 'Scoring Avg',
    meta: { align: 'right', numeric: true },
    cell: (ctx) => (ctx.getValue() as number).toFixed(1),
  },
  {
    accessorKey: 'sg',
    header: 'SG: Total',
    meta: { align: 'right', numeric: true },
    cell: (ctx) => {
      const v = ctx.getValue() as number;
      return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: { align: 'center' },
    cell: (ctx) => {
      const s = ctx.getValue() as PlayerRow['status'];
      const tone = s === 'qualified' ? 'success' : s === 'bubble' ? 'warning' : 'danger';
      return <StatusPill tone={tone}>{s}</StatusPill>;
    },
  },
];

const TREND_DATA: TrendPoint[] = [
  { x: 'Sep', y: 74.1 },
  { x: 'Oct', y: 73.2, marker: { label: 'Fall Invitational' } },
  { x: 'Nov', y: 72.8 },
  { x: 'Feb', y: 72.1 },
  { x: 'Mar', y: 71.6 },
  { x: 'Apr', y: 71.2, marker: { label: 'Conference' } },
];

const SG_DATA: SGCategory[] = [
  { label: 'Off the Tee', value: 0.7 },
  { label: 'Approach', value: 1.3 },
  { label: 'Around Green', value: -0.4 },
  { label: 'Putting', value: -0.9 },
];

const COMMAND_GROUPS: CommandGroup[] = [
  {
    heading: 'Navigate',
    items: [
      { id: 'roster', label: 'Go to Roster', icon: <IconUsers size={16} />, shortcut: 'G R' },
      { id: 'stats', label: 'Open Team Stats', icon: <IconChart size={16} />, shortcut: 'G S' },
      { id: 'calendar', label: 'View Calendar', icon: <IconCalendar size={16} /> },
    ],
  },
  {
    heading: 'Actions',
    items: [
      { id: 'new-q', label: 'Create Qualifier', icon: <IconPlus size={16} />, tone: 'accent' },
      { id: 'review', label: 'Review last round', icon: <IconEye size={16} /> },
    ],
  },
];

const COMMAND_RECENT: CommandItem[] = [
  { id: 'recent-mason', label: 'Mason Reed — profile', icon: <IconUsers size={16} /> },
];

/* CoachHelm phase-1/2 sample data ----------------------------------------- */

// A descending scoring series (golf is lower-is-better → improving).
const SPARK_IMPROVING = [74.4, 73.9, 73.1, 72.6, 72.0, 71.4];
// A single point → the honest em-dash (<2 points contract).
const SPARK_STARVED = [71.4];

// A coach focus area with real progress history + a real source chip.
const FOCUS_AREA_COACH: FocusAreaCardData = {
  id: 'fa-coach-1',
  area_type: 'putting',
  title: 'Cut 3-putts inside 25 feet',
  description: 'Lag-putt distance control on long approaches; tighten the leave to a tap-in.',
  status: 'active',
  target_metric: 'Putts Per Round',
  current_value: 31.4,
  target_value: 29.5,
  started_at: '2026-03-02',
  from_review_id: 'rev-2291',
  review_context: 'Spring Invitational — round 2',
  progressHistory: [
    { at: '2026-03-02', value: 32.6 },
    { at: '2026-03-16', value: 32.0 },
    { at: '2026-04-06', value: 31.4 },
  ],
};

// A player focus area — fewer than 2 progress points → honest em-dash sparkline.
const FOCUS_AREA_PLAYER: FocusAreaCardData = {
  id: 'fa-player-1',
  area_type: 'driving',
  title: 'Find more fairways off the tee',
  description: 'Commit to the 3-wood on tight driving holes.',
  status: 'in_progress',
  target_metric: 'Fairways Hit %',
  current_value: 58,
  target_value: 68,
  started_at: '2026-04-12',
  from_insight_id: 'ins-7741',
  progressHistory: [{ at: '2026-04-12', value: 55 }],
};

// Genome dimensions — single player (vs the 50th-percentile baseline).
const GENOME_SINGLE: GenomeDimension[] = [
  { label: 'Driving', value: 72 },
  { label: 'Approach', value: 64 },
  { label: 'Around Green', value: 41 },
  { label: 'Putting', value: 38 },
  { label: 'Course Mgmt', value: 58 },
  { label: 'Mental', value: 67 },
];

// Genome dimensions — a second player for the two-player compare.
const GENOME_COMPARE: GenomeDimension[] = [
  { label: 'Driving', value: 55 },
  { label: 'Approach', value: 70 },
  { label: 'Around Green', value: 62 },
  { label: 'Putting', value: 60 },
  { label: 'Course Mgmt', value: 49 },
  { label: 'Mental', value: 51 },
];

// Only 2 live dimensions → honest insufficient-data (<3 live dims contract).
const GENOME_INSUFFICIENT: GenomeDimension[] = [
  { label: 'Driving', value: 72 },
  { label: 'Approach', value: 64 },
  { label: 'Around Green', value: null },
  { label: 'Putting', value: null },
  { label: 'Course Mgmt', value: null },
  { label: 'Mental', value: null },
];

/* ------------------------------------------------------------------------- */
/* Page                                                                       */
/* ------------------------------------------------------------------------- */

export default function FairwayPreviewPage() {
  const [seg, setSeg] = React.useState('season');
  const [filterActive, setFilterActive] = React.useState<Record<string, boolean>>({
    qualified: true,
    juniors: false,
  });
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [single, setSingle] = React.useState<Date | undefined>(new Date());

  const segments: ViewHeaderSegment[] = [
    { value: 'season', label: 'Season' },
    { value: 'event', label: 'By Event' },
    { value: 'player', label: 'By Player' },
  ];

  return (
    <div className={fairwayScope('min-h-screen bg-canvas font-fw-sans text-text-primary')}>
      <ToastStack />

      <AppShell
        sections={NAV_SECTIONS}
        user={{ name: 'Coach Davis', teamName: 'State University' }}
        brand={<span className="font-fw-display text-headline text-text-on-accent">GolfHelm</span>}
        breadcrumbs={[{ label: 'Dashboard', href: '#' }, { label: 'Design System' }]}
        pathname="#"
        onSearchOpen={() => setCommandOpen(true)}
        searchPlaceholder="Search players, events…  (⌘K)"
        sidebarFooter={
          <div className="flex flex-col gap-1">
            <button className="flex items-center gap-2 rounded-fw-sm px-2 py-1.5 text-body-sm text-text-tertiary hover:text-text-on-accent">
              <IconSettings size={16} /> Settings
            </button>
            <button className="flex items-center gap-2 rounded-fw-sm px-2 py-1.5 text-body-sm text-text-tertiary hover:text-text-on-accent">
              <IconLogOut size={16} /> Sign out
            </button>
          </div>
        }
        topBarActions={
          <Button variant="primary" size="sm" leftIcon={<IconPlus size={16} />}>
            New round
          </Button>
        }
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-16 px-2 py-8">
          {/* ── ViewHeader ─────────────────────────────────────────────── */}
          <ViewHeader
            eyebrow="Fairway Design System"
            title="Wave 1 — Primitive Showcase"
            description="Every warm-premium primitive in its key states and variants, with realistic golf content. Dev-only; not linked in nav."
            meta={
              <span className="inline-flex items-center gap-2">
                <StatusPill tone="success" dot>
                  Locked
                </StatusPill>
                <span className="text-text-tertiary">Updated just now</span>
              </span>
            }
            secondaryActions={
              <Button variant="secondary" size="sm" leftIcon={<IconEdit size={16} />}>
                Edit
              </Button>
            }
            primaryAction={
              <Button variant="primary" leftIcon={<IconPlus size={16} />}>
                Add view
              </Button>
            }
            segments={segments}
            segmentValue={seg}
            onSegmentChange={setSeg}
            plinth
          />

          {/* ── Foundations (the systematization primitives) ───────────── */}
          <Section
            id="foundations"
            title="Foundations"
            blurb="The single-source-of-truth frame + overline. PageContainer gives every route one width + one left edge; Eyebrow is the one overline recipe (token-owned tracking/weight), drawn identically everywhere."
          >
            <div className="flex flex-col gap-4">
              <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
                <PageContainer width="prose" flow={false} className="py-6">
                  <Eyebrow tone="accent">Page frame</Eyebrow>
                  <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">
                    A centered column (here <code>width=&quot;prose&quot;</code>) with gutters aligned to the top bar.
                  </p>
                </PageContainer>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <Eyebrow>Neutral overline</Eyebrow>
                <Eyebrow tone="secondary">Secondary</Eyebrow>
                <Eyebrow tone="accent">Signal · accent</Eyebrow>
              </div>
            </div>
          </Section>

          {/* ── Surfaces ───────────────────────────────────────────────── */}
          <Section
            id="surfaces"
            title="Surfaces"
            blurb="The warm matte card family — Surface (border OR shadow, never both at rest), the sunken Inset, the opaque Elevated panel, and the ONE restrained Liquid Glass."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              <Surface elevation="border" padding="md">
                <Label>elevation=border</Label>
                <p className="mt-2 text-body-sm text-text-secondary">
                  Resting matte card. Hairline border, no shadow.
                </p>
              </Surface>
              <Surface elevation="shadow" padding="md" interactive>
                <Label>elevation=shadow · interactive</Label>
                <p className="mt-2 text-body-sm text-text-secondary">
                  Soft shadow; lifts to shadow-raise on hover.
                </p>
              </Surface>
              <Surface elevation="border" padding="md">
                <Label>Inset (nested well)</Label>
                <Inset padding="sm" className="mt-2">
                  <p className="text-body-sm text-text-secondary">
                    Sunken evidence row inside a card.
                  </p>
                </Inset>
              </Surface>
              <Elevated padding="md">
                <Label>Elevated (opaque)</Label>
                <p className="mt-2 text-body-sm text-text-secondary">
                  Floating menu panel — no glass.
                </p>
              </Elevated>
            </div>

            <div className="mt-5 overflow-hidden rounded-fw-lg bg-[#1f2a23] p-6">
              <Label>GlassSurface (allow-list only · on a dark plinth)</Label>
              <div className="mt-3">
                <GlassSurface surface="overlay" padding="md" className="max-w-md">
                  <p className="font-fw-display text-headline text-text-primary">
                    Restrained Liquid Glass
                  </p>
                  <p className="mt-1 text-body-sm text-text-secondary">
                    Cream-tinted, used only where the design system allows — overlays, nav, one hero
                    card. Never a resting card texture.
                  </p>
                </GlassSurface>
              </div>
            </div>
          </Section>

          {/* ── MetricCard row (Number Flow) ───────────────────────────── */}
          <Section
            id="metrics"
            title="MetricCard row"
            blurb="Single-metric tiles with Fragment Mono numerics (animated via Number Flow), delta chips that respect golf's lower-is-better scoring, plus loading + empty states."
          >
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <MetricCard
                label="Scoring Avg"
                value={71.2}
                decimals={1}
                delta={{ value: -0.6, label: 'vs last month', suffix: '' }}
                goodDirection="down"
                footnote="Team, last 6 events"
              />
              <MetricCard
                label="SG: Total"
                value={1.8}
                decimals={1}
                suffix=" SG"
                delta={{ value: 0.4, label: 'vs season' }}
                goodDirection="up"
              />
              <MetricCard label="Rounds Logged" value={142} delta={{ value: 18, label: 'this month' }} />
              <MetricCard label="Qualified" value={0} empty emptyMessage="No qualifier yet" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
              <MetricCard label="Loading" value={0} loading />
              <MetricCard
                label="Hero variant"
                value={68.9}
                decimals={1}
                variant="hero"
                delta={{ value: -1.2, label: 'best round' }}
                goodDirection="down"
              />
            </div>
            {/* compact density — the dense 6-up grid (truncating overline) */}
            <div className="mt-5 grid grid-cols-3 gap-3 lg:grid-cols-6">
              <MetricCard density="compact" label="Fairways" value={61} suffix="%" />
              <MetricCard density="compact" label="GIR" value={52} suffix="%" />
              <MetricCard density="compact" label="Scrambling" value={48} suffix="%" />
              <MetricCard density="compact" label="Putts / round" value={31.2} decimals={1} goodDirection="down" />
              <MetricCard density="compact" label="Up &amp; down attempts made" value={44} suffix="%" />
              <MetricCard density="compact" label="3-putt avoidance" value={92} suffix="%" />
            </div>
          </Section>

          {/* ── InsightCard hero ───────────────────────────────────────── */}
          <Section
            id="insights"
            title="InsightCard"
            blurb="The CoachHelm signal surface. `hero` is the one Liquid-Glass card per view; default + compact are matte."
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <InsightCard
                  variant="hero"
                  priority="high"
                  overline="Putting · Signal"
                  title="Mason is leaving short putts low"
                  meta={<span className="text-text-tertiary">87% confidence</span>}
                  evidence={
                    <p className="text-body-sm text-text-secondary">
                      Over the last 4 rounds, 11 of 14 missed putts inside 8ft missed on the low
                      side — a −0.9 SG putting trend.
                    </p>
                  }
                  actions={
                    <>
                      <Button variant="primary" size="sm">
                        Create focus area
                      </Button>
                      <Button variant="ghost" size="sm">
                        Dismiss
                      </Button>
                    </>
                  }
                >
                  A repeatable miss pattern worth a drill block before the conference championship.
                </InsightCard>
              </div>
              <div className="flex flex-col gap-5">
                <InsightCard variant="default" priority="medium" overline="Approach" title="Wedge distance control improving">
                  Proximity from 100–125yd is down to 21ft, the team&apos;s best window this season.
                </InsightCard>
                <InsightCard variant="compact" priority="info" title="3 players need a round logged this week" />
              </div>
            </div>
          </Section>

          {/* ── DataTable ──────────────────────────────────────────────── */}
          <Section
            id="data-table"
            title="DataTable"
            blurb="TanStack-powered warm table: sortable headers, row selection, density, inline row actions, tabular numerics, and matte styling."
          >
            <DataTable<PlayerRow>
              data={PLAYER_ROWS}
              columns={PLAYER_COLUMNS}
              ariaLabel="Team roster qualifying standings"
              caption="Qualifying standings — spring season"
              enableRowSelection
              enableSorting
              getRowId={(r) => r.id}
              rowActions={[
                {
                  id: 'view',
                  label: 'View profile',
                  icon: <IconEye size={16} />,
                  onSelect: (d) => fairwayToast.info(`Open ${d.name}`),
                },
                {
                  id: 'edit',
                  label: 'Edit',
                  icon: <IconEdit size={16} />,
                  onSelect: (d) => fairwayToast.message(`Edit ${d.name}`),
                },
                {
                  id: 'remove',
                  label: 'Remove',
                  icon: <IconTrash size={16} />,
                  tone: 'danger',
                  onSelect: (d) => fairwayToast.danger(`Removed ${d.name}`),
                },
              ]}
            />
          </Section>

          {/* ── Calendar ───────────────────────────────────────────────── */}
          <Section
            id="calendar"
            title="Calendar"
            blurb="A warm month grid (today / selected / event dots / keyboard nav) and an anchored DatePicker field."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Surface elevation="border" padding="md">
                <Label>CalendarSurface</Label>
                <div className="mt-3">
                  <CalendarSurface mode="single" selected={single} onSelect={setSingle} size="cozy" />
                </div>
              </Surface>
              <Surface elevation="border" padding="md">
                <Label>DatePicker (anchored popover)</Label>
                <div className="mt-3 max-w-xs">
                  <DatePicker mode="single" />
                </div>
              </Surface>
            </div>
          </Section>

          {/* ── Forms ──────────────────────────────────────────────────── */}
          <Section
            id="forms"
            title="Forms"
            blurb="Calm form primitives on Base UI — visible labels, inline validation that never shifts layout, full interaction states."
          >
            <Surface elevation="border" padding="lg" className="max-w-2xl">
              <Form>
                <FormSection title="New qualifier" description="Set up a scoring event for the team.">
                  <FormField label="Event name" required>
                    <Input placeholder="Fall Invitational" defaultValue="Conference Championship" />
                  </FormField>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Format">
                      <Select
                        defaultValue="stroke"
                        options={[
                          { label: 'Stroke play', value: 'stroke' },
                          { label: 'Match play', value: 'match' },
                        ]}
                      />
                    </FormField>
                    <FormField label="Rounds">
                      <NumberField defaultValue={3} min={1} max={4} />
                    </FormField>
                  </div>
                  <FormField label="Course" error="Please choose a course">
                    <Input placeholder="Search course…" />
                  </FormField>
                  <FormField label="Notes" help="Optional context for players.">
                    <TextArea rows={3} placeholder="Tee times, travel, dress code…" />
                  </FormField>
                  <FormField label="Scoring direction">
                    <RadioGroup
                      defaultValue="low"
                      options={[
                        { label: 'Lower is better', value: 'low' },
                        { label: 'Stableford (higher)', value: 'high' },
                      ]}
                    />
                  </FormField>
                  <div className="flex flex-col gap-3">
                    <Checkbox label="Count toward season qualifying" defaultChecked />
                    <Switch label="Notify roster on publish" defaultChecked />
                  </div>
                </FormSection>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" type="button">
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Create qualifier
                  </Button>
                </div>
              </Form>
            </Surface>
          </Section>

          {/* ── Controls ───────────────────────────────────────────────── */}
          <Section
            id="controls"
            title="Controls"
            blurb="Buttons (all variants/sizes/states), Segmented, Tabs, pills, badges, chips, and avatars."
          >
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="primary" busy>
                  Saving
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
                <IconButton variant="secondary" aria-label="Add">
                  <IconPlus size={18} />
                </IconButton>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm">
                  Small
                </Button>
                <Button variant="secondary" size="md">
                  Medium
                </Button>
                <Button variant="secondary" size="lg">
                  Large
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Segmented
                  value={seg}
                  onValueChange={setSeg}
                  options={[
                    { value: 'season', label: 'Season' },
                    { value: 'event', label: 'Event' },
                    { value: 'player', label: 'Player' },
                  ]}
                />
                <FilterPill
                  selected={filterActive.qualified}
                  onClick={() => setFilterActive((s) => ({ ...s, qualified: !s.qualified }))}
                >
                  Qualified
                </FilterPill>
                <FilterPill
                  selected={filterActive.juniors}
                  onClick={() => setFilterActive((s) => ({ ...s, juniors: !s.juniors }))}
                >
                  Juniors
                </FilterPill>
              </div>

              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="trends">Trends</TabsTrigger>
                  <TabsTrigger value="roster">Roster</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <p className="pt-3 text-body-sm text-text-secondary">Overview tab content.</p>
                </TabsContent>
                <TabsContent value="trends">
                  <p className="pt-3 text-body-sm text-text-secondary">Trends tab content.</p>
                </TabsContent>
                <TabsContent value="roster">
                  <p className="pt-3 text-body-sm text-text-secondary">Roster tab content.</p>
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone="success" dot>
                  Qualified
                </StatusPill>
                <StatusPill tone="warning">Bubble</StatusPill>
                <StatusPill tone="danger">Out</StatusPill>
                <Badge tone="accent">12</Badge>
                <Badge tone="neutral" variant="soft">
                  New
                </Badge>
                <Chip onRemove={() => fairwayToast.message('Removed')}>Junior</Chip>
                <AvatarGroup max={3}>
                  <Avatar name="Mason Reed" />
                  <Avatar name="Eli Carter" />
                  <Avatar name="Owen Blake" status="online" />
                  <Avatar name="Liam Foster" />
                </AvatarGroup>
              </div>
            </div>
          </Section>

          {/* ── Charts ─────────────────────────────────────────────────── */}
          <Section
            id="charts"
            title="Charts"
            blurb="Instrument-grade data viz on cream/green tokens with a 'view as table' fallback on every chart."
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <TrendChart
                title="Scoring average trend"
                overline="Season"
                takeaway="Down 2.9 strokes since September."
                data={TREND_DATA}
                benchmark={{ value: 72, label: 'Team avg' }}
                valueFormatter={(v) => v.toFixed(1)}
              />
              <StrokesGainedTornado
                title="Strokes Gained vs benchmark"
                overline="Last 6 rounds"
                takeaway="Approach is the strength; putting is the leak."
                data={SG_DATA}
              />
            </div>
          </Section>

          {/* ── Feedback / states ──────────────────────────────────────── */}
          <Section
            id="feedback"
            title="Feedback & states"
            blurb="Honest emptiness, inline notices, skeletons (never spinners), insufficient-data, onboarding steps, and toasts."
          >
            <div className="flex flex-col gap-5">
              <InlineNotice tone="info" title="Heads up" dismissible>
                Three players still need a round logged before the deadline.
              </InlineNotice>
              <InlineNotice tone="success" title="Saved">
                Qualifier published to the roster.
              </InlineNotice>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <Surface elevation="border" padding="md">
                  <EmptyState
                    title="No qualifiers yet"
                    description="Create your first scoring event to start tracking standings."
                    action={
                      <Button variant="primary" size="sm">
                        Create qualifier
                      </Button>
                    }
                  />
                </Surface>
                <Surface elevation="border" padding="md">
                  <InsufficientData unit="rounds" current={2} required={5} />
                </Surface>
                <SkeletonCard lines={3} withMedia />
              </div>

              <Surface elevation="border" padding="lg" className="max-w-2xl">
                <OnboardingSteps label="Get started">
                  <OnboardingStep index={1} status="complete" title="Create your team" />
                  <OnboardingStep
                    index={2}
                    status="active"
                    title="Invite your roster"
                    description="Share a join code with players."
                    action={
                      <Button variant="primary" size="sm">
                        Invite
                      </Button>
                    }
                  />
                  <OnboardingStep index={3} status="upcoming" title="Log a round" hasConnector={false} />
                </OnboardingSteps>
              </Surface>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => fairwayToast.success('Round saved')}>
                  Toast: success
                </Button>
                <Button variant="secondary" onClick={() => fairwayToast.warning('Deadline soon')}>
                  Toast: warning
                </Button>
                <Button variant="secondary" onClick={() => fairwayToast.danger('Sync failed')}>
                  Toast: danger
                </Button>
              </div>
            </div>
          </Section>

          {/* ── Overlays & command ─────────────────────────────────────── */}
          <Section
            id="overlays"
            title="Overlays & command"
            blurb="The overlay escalation — PopoverPanel < Sheet < ModalShell — plus the inline SearchField and the summoned ⌘K CommandMenu."
          >
            <div className="flex flex-wrap items-center gap-3">
              <ModalShell
                open={modalOpen}
                onOpenChange={setModalOpen}
                trigger={<Button variant="primary">Open ModalShell</Button>}
                title="Remove player from roster?"
                description="This removes Owen Blake from the spring roster. Their logged rounds are kept."
              >
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => setModalOpen(false)}>
                    Remove
                  </Button>
                </div>
              </ModalShell>

              <Sheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                side="right"
                trigger={<Button variant="secondary">Open Sheet</Button>}
                title="Filters"
                description="Refine the roster view."
              >
                <div className="flex flex-col gap-4 pt-2">
                  <Checkbox label="Qualified only" defaultChecked />
                  <Checkbox label="Underclassmen" />
                  <Switch label="Hide injured" />
                </div>
              </Sheet>

              <PopoverPanel
                surface="matte"
                trigger={<Button variant="ghost">Open Popover</Button>}
                ariaLabel="Quick actions"
              >
                <div className="flex flex-col gap-1">
                  <button className="rounded-fw-sm px-2 py-1.5 text-left text-body-sm hover:bg-surface-tint">
                    Export CSV
                  </button>
                  <button className="rounded-fw-sm px-2 py-1.5 text-left text-body-sm hover:bg-surface-tint">
                    Print standings
                  </button>
                </div>
              </PopoverPanel>

              <Button variant="ghost" onClick={() => setCommandOpen(true)}>
                Open ⌘K Command Menu
              </Button>
            </div>

            <div className="mt-5 max-w-md">
              <Label>SearchField (inline)</Label>
              <div className="mt-2">
                <SearchField placeholder="Search players…" clearable aria-label="Search players" />
              </div>
            </div>

            <CommandMenu
              open={commandOpen}
              onOpenChange={setCommandOpen}
              groups={COMMAND_GROUPS}
              recent={COMMAND_RECENT}
              onSelect={(item) => {
                fairwayToast.message(item.label);
                setCommandOpen(false);
              }}
            />
          </Section>

          {/* ── CoachHelm primitives + shell composites (phase 1 + 2) ──────── */}
          <Section
            id="coachhelm"
            title="CoachHelm — shell composites + chart primitives"
            blurb="The phase-1 instrument primitives (Sparkline, TrendChip, StatTile, GenomeFingerprint) and the phase-2 shell keystones (CoachHelmShell, CoachHelmSubNav, FocusAreaCard) — each in its key states, including the honesty-contract starved states."
          >
            <div className="flex flex-col gap-10">
              {/* CoachHelmShell — coach variant, Players tab active, Signals badge */}
              <div>
                <Label>CoachHelmShell · role=coach · active=players · Signals unread badge=4</Label>
                <div className="mt-3 overflow-hidden rounded-card border border-border-subtle">
                  <CoachHelmShell
                    active="players"
                    role="coach"
                    signalCount={4}
                    title="Players"
                    description="Roster-wide focus areas and genome reads."
                    breadcrumbs={[{ label: 'Mason Reed' }]}
                    actions={
                      <Button variant="primary" size="sm" leftIcon={<IconPlus size={16} />}>
                        New focus area
                      </Button>
                    }
                  >
                    <Surface elevation="border" padding="md">
                      <p className="text-body-sm text-text-secondary">
                        Surface body mounts here on <code>bg-canvas</code> with the §A airy
                        gutters. Each route keeps its own server fetch above the fork.
                      </p>
                    </Surface>
                  </CoachHelmShell>
                </div>
              </div>

              {/* CoachHelmSubNav — coach + player variants in isolation */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <Label>CoachHelmSubNav · role=coach (5 tabs, Signals badge)</Label>
                  <div className="mt-3">
                    <CoachHelmSubNav active="signals" role="coach" signalCount={7} />
                  </div>
                </div>
                <div>
                  <Label>CoachHelmSubNav · role=player (Overview + My Development)</Label>
                  <div className="mt-3">
                    <CoachHelmSubNav active="players" role="player" />
                  </div>
                </div>
              </div>

              {/* Toolbar — one quiet search + filters + primary action row */}
              <div>
                <Label>Toolbar · search + filters + view toggle + primary action</Label>
                <div className="mt-3">
                  <Toolbar
                    search={<SearchField placeholder="Search signals…" aria-label="Search signals" />}
                    filters={
                      <>
                        <FilterPill selected>Urgent</FilterPill>
                        <FilterPill>High</FilterPill>
                        <Toolbar.FilterMenu
                          label="More filters"
                          icon={<IconFilter size={14} />}
                          options={[
                            { value: 'putting', label: 'Putting' },
                            { value: 'driving', label: 'Driving' },
                            { value: 'mental', label: 'Mental game' },
                          ]}
                          selected={['putting']}
                        />
                      </>
                    }
                    viewToggle={
                      <Toolbar.ViewToggle
                        options={[
                          { value: 'table', label: 'Table' },
                          { value: 'grouped', label: 'Grouped' },
                        ]}
                        value="table"
                        onValueChange={() => {}}
                      />
                    }
                    primaryAction={
                      <Button variant="primary" size="sm" leftIcon={<IconPlus size={16} />}>
                        Scan team
                      </Button>
                    }
                  />
                </div>
              </div>

              {/* InsightPanel — docked read of one signal (identical scanned vs read) */}
              <div>
                <Label>InsightPanel · mode=docked · priority=high</Label>
                <div className="mt-3 max-w-2xl">
                  <InsightPanel
                    mode="docked"
                    priority="high"
                    overline="Putting · Signal"
                    title="3-putt rate climbing on long lag putts"
                    meta="2 days ago"
                    evidence="Across the last 4 rounds, lag putts from 25+ ft are finishing 6.1 ft from the hole on average — up from 3.8 ft in the fall."
                    evidenceLabel="Why this surfaced"
                    actions={[
                      { key: 'acknowledge', label: 'Acknowledge' },
                      { key: 'focus-area', label: 'Create focus area' },
                      { key: 'ask', label: 'Ask CoachHelm' },
                      { key: 'dismiss', label: 'Dismiss' },
                    ]}
                  >
                    Mason&rsquo;s distance control on long lag putts has slipped over the spring
                    swing. The leave is consistently long, forcing pressure come-backers.
                  </InsightPanel>
                </div>
              </div>

              {/* FocusAreaCard — coach + player variants */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <Label>FocusAreaCard · role=coach (real trend + source chip)</Label>
                  <div className="mt-3">
                    <FocusAreaCard
                      role="coach"
                      playerName="Mason Reed"
                      focusArea={FOCUS_AREA_COACH}
                      onEdit={() => {}}
                      onLogProgress={() => {}}
                      onComplete={() => {}}
                    />
                  </div>
                </div>
                <div>
                  <Label>FocusAreaCard · role=player (&lt;2 pts → em-dash sparkline)</Label>
                  <div className="mt-3">
                    <FocusAreaCard
                      role="player"
                      focusArea={FOCUS_AREA_PLAYER}
                      onLogProgress={() => {}}
                      onComplete={() => {}}
                    />
                  </div>
                </div>
              </div>

              {/* StatTile — populated AND insufficient-data (the honesty swap) */}
              <div>
                <Label>StatTile · populated · AND · starved → InsufficientData(compact)</Label>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Surface elevation="border" padding="sm">
                    <StatTile
                      label="Scoring average"
                      value={71.4}
                      trendData={SPARK_IMPROVING}
                      goodDirection="down"
                    />
                  </Surface>
                  <Surface elevation="border" padding="sm">
                    <StatTile
                      label="Prediction accuracy"
                      value={0.82}
                      format={{ style: 'percent', maximumFractionDigits: 0 }}
                      goodDirection="up"
                      hideTrend
                    />
                  </Surface>
                  <Surface elevation="border" padding="sm">
                    <StatTile
                      label="Outcome rate"
                      starved
                      current={0}
                      required={20}
                      unit="resolved predictions"
                      starvedDescription="Capture focus-area outcomes to light this up."
                    />
                  </Surface>
                </div>
              </div>

              {/* Sparkline + TrendChip — the inline micro-trend vocabulary */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <Label>Sparkline · populated (improving) AND &lt;2-point em-dash</Label>
                  <Surface elevation="border" padding="md" className="mt-3 flex items-center gap-8">
                    <div className="flex flex-col items-center gap-1.5">
                      <Sparkline data={SPARK_IMPROVING} goodDirection="down" label="Scoring average" />
                      <span className="text-eyebrow text-text-tertiary">6 rounds</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <Sparkline data={SPARK_STARVED} goodDirection="down" label="Scoring average" />
                      <span className="text-eyebrow text-text-tertiary">1 round (em-dash)</span>
                    </div>
                  </Surface>
                </div>
                <div>
                  <Label>TrendChip · improving / flat / declining (amber, never red)</Label>
                  <Surface elevation="border" padding="md" className="mt-3 flex flex-wrap items-center gap-3">
                    <TrendChip delta={-0.8} goodDirection="down" />
                    <TrendChip delta={0} goodDirection="down" />
                    <TrendChip delta={0.6} goodDirection="down" />
                    <TrendChip direction="improving" label="−0.8 strokes" numeric />
                  </Surface>
                </div>
              </div>

              {/* GenomeFingerprint — single / two-player compare / insufficient */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <GenomeFingerprint
                  overline="Genome"
                  title="Mason Reed — fingerprint"
                  subtitle="Deviation from the 50th percentile"
                  data={GENOME_SINGLE}
                  seriesName="Mason"
                  height={300}
                />
                <GenomeFingerprint
                  overline="Genome"
                  title="Compare — Mason vs Eli"
                  data={GENOME_SINGLE}
                  seriesName="Mason"
                  compareWith={GENOME_COMPARE}
                  compareName="Eli"
                  height={300}
                />
                <GenomeFingerprint
                  overline="Genome"
                  title="Owen Blake — fingerprint"
                  data={GENOME_INSUFFICIENT}
                  seriesName="Owen"
                  height={300}
                />
              </div>
            </div>
          </Section>
        </div>
      </AppShell>
    </div>
  );
}
