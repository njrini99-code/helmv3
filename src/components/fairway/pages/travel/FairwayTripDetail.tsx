'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayTripDetail — one trip, read top to bottom
 * ----------------------------------------------------------------------------
 * The read of ONE itinerary on a shadow card:
 *
 *   • Header   — the status pill (coach Edit / Delete opposite), the trip
 *                name, the destination, and how far off the trip is: a
 *                countdown tile from `sm`, one line of text on a phone.
 *   • Journey  — a sunken band: Depart (day, time, meeting point) → the
 *                transport and nights → Return ("Not set" when the coach has
 *                not set one). The band is the schedule; nothing repeats it.
 *   • Tabs     — Details and Expenses (Fairway Tabs).
 *
 * Details is a set of raised modules, each rendered only when its fields
 * exist (honest emptiness; nothing fabricated): the linked calendar event,
 * Lodging (a tel: link and the confirmation number) beside What to bring
 * (uniform, then gear one item per line from the DB array), Flight beside
 * Rooms, Notes (line breaks kept), and an Expenses strip that reads the same
 * per-trip load as the Expenses tab: a skeleton while it loads, a retry when
 * it failed, and the total with cents once it answered. A module without its
 * row partner takes the whole row. There is no travel roster table, so there
 * is no roster module; room assignments show when set.
 *
 * Expenses is FairwayExpenseSummary / FairwayExpenseList (unchanged). The
 * parent owns the load, export and CRUD wiring (no writes happen here), and
 * mounts the expense form.
 *
 * Delete opens a ModalShell confirm that names the cascade: "the entire
 * itinerary and its N expenses" once that trip's expenses have loaded, and
 * "any expenses logged on it" until then. The confirm never claims zero
 * expenses from a list that was never read.
 *
 * Contrast comes from surface steps (card, sunken band, raised modules), the
 * type scale and hairlines. Green only where Fairway puts it: the pulsing
 * on-the-road pill and the active tab bar. Presentation only; tokens only.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Clock,
  Download,
  Luggage,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Plane,
  Plus,
  Receipt,
  Trash2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  StatusPill,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
  Skeleton,
  ModalShell,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import { FairwayExpenseList } from './FairwayExpenseList';
import { FairwayExpenseSummary } from './FairwayExpenseSummary';
import type {
  TravelExpense,
  ExpenseSummary as ExpenseSummaryType,
  TravelBudget,
} from '@/app/golf/actions/travel';
import {
  type TravelItinerary,
  TRANSPORT_ICON,
  TRANSPORT_LABEL,
  formatTravelDay,
  formatTravelMoney,
  formatTravelTime,
  formatTripNights,
  getTripStatus,
  tripCountdown,
  tripPhase,
} from './travel-helpers';

const EM_DASH = '—';

/** A gear list whose every item is this short reads in two columns from `sm`. */
const GEAR_COMPACT_MAX = 28;

export interface FairwayTripDetailProps {
  itinerary: TravelItinerary;
  /** Today, for the status pill and the countdown. Null until it resolves. */
  now?: Date | null;
  isCoach: boolean;
  activeTab: 'details' | 'expenses';
  onTabChange: (tab: 'details' | 'expenses') => void;
  onEdit: () => void;
  onDelete: () => void;
  /* ── expenses wiring (owned by the parent; passed in) ── */
  expenses: TravelExpense[];
  expenseSummary: ExpenseSummaryType | null;
  budgets: TravelBudget[];
  loadingExpenses: boolean;
  /** This trip's expense read failed; the modules offer a retry. */
  expensesFailed?: boolean;
  /**
   * The expense count the delete confirm names. Null while this trip's
   * expenses have not loaded (the confirm then says "any expenses").
   * Omitted: `expenses.length`.
   */
  expenseCount?: number | null;
  exporting: boolean;
  onAddExpense: () => void;
  onEditExpense: (expense: TravelExpense) => void;
  onRefreshExpenses: () => void;
  onExportCSV: () => void;
}

export function FairwayTripDetail({
  itinerary,
  now = null,
  isCoach,
  activeTab,
  onTabChange,
  onEdit,
  onDelete,
  expenses,
  expenseSummary,
  budgets,
  loadingExpenses,
  expensesFailed = false,
  expenseCount: expenseCountProp,
  exporting,
  onAddExpense,
  onEditExpense,
  onRefreshExpenses,
  onExportCSV,
}: FairwayTripDetailProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const status = getTripStatus(itinerary, now);
  const phase = now ? tripPhase(itinerary, now) : 'upcoming';
  const countdown = now && phase !== 'past' ? tripCountdown(itinerary, now) : null;
  const countdownText = countdown
    ? countdown.figure
      ? `${countdown.figure} ${countdown.label}`
      : countdown.label
    : null;

  // The destructive cascade size, named in the confirm copy only once this
  // trip's expenses have actually been read.
  const expenseCount = expenseCountProp === undefined ? expenses.length : expenseCountProp;

  // Close the confirm when the shown trip changes.
  React.useEffect(() => {
    setConfirmOpen(false);
  }, [itinerary.id]);

  const handleConfirmDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };

  const gear = gearItems(itinerary);
  const hasLodging = Boolean(itinerary.hotel_name?.trim());
  const hasBring = Boolean(itinerary.uniform_requirements?.trim() || gear.length > 0);
  const hasFlight = Boolean(itinerary.flight_info?.trim());
  const hasRooms = Boolean(itinerary.room_assignments?.trim());
  const hasLogistics = hasLodging || hasBring || hasFlight || hasRooms || Boolean(itinerary.notes?.trim());

  return (
    <>
      <Surface elevation="shadow" padding="none" className="overflow-hidden">
        {/* One Tabs root spans the header (TabsList) and the body
            (TabsContent): Radix Tabs share context. `gap-0` drops the root's
            default gap so the tab hairline sits flush on the content. */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => onTabChange(v as 'details' | 'expenses')}
          className="gap-0"
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <StatusPill tone={status.tone} pulse={status.pulse} dot>
                {status.label}
              </StatusPill>
              {isCoach ? (
                <div className="-mr-2 flex shrink-0 items-center gap-1">
                  {/* Below `sm` the text hides and the icons are aria-hidden,
                      so the buttons carry aria-labels. size="sm" floors the
                      tap target at 44px on coarse pointers. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    aria-label="Edit itinerary"
                    leftIcon={<Pencil className="h-4 w-4" />}
                  >
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    aria-label="Delete itinerary"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  >
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                {/* #87: the header spans the whole column, so a long name or
                    destination wraps instead of clipping. */}
                <h2
                  tabIndex={-1}
                  data-trip-heading
                  className="break-words font-fw-display text-h3 text-text-primary outline-none [text-wrap:balance] sm:text-h2"
                >
                  {itinerary.event_name.trim() || 'Trip'}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-fw-sans text-body-sm text-text-secondary">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
                  <span className="break-words">{itinerary.destination.trim() || 'Destination not set'}</span>
                </p>
                {countdownText ? (
                  <p className="mt-3 flex items-center gap-1.5 font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary sm:hidden">
                    <Clock className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
                    {countdownText}
                  </p>
                ) : null}
              </div>
              {countdown ? <CountdownTile figure={countdown.figure} label={countdown.label} /> : null}
            </div>

            <JourneyBand itinerary={itinerary} now={now} className="mt-5" />

            <TabsList aria-label="Trip sections" className="-mx-5 mt-5 px-1.5 sm:-mx-6 sm:px-2.5">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
            </TabsList>
          </div>

          {/* ═══════════ DETAILS ═══════════ */}
          <TabsContent value="details" className="p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              {itinerary.event_id ? <LinkedEventRow itinerary={itinerary} /> : null}

              {!hasLogistics ? (
                <p className="rounded-fw-md border border-dashed border-border-subtle px-4 py-3 font-fw-sans text-body-sm text-text-secondary">
                  No lodging or logistics added yet {EM_DASH} the schedule above is all that&rsquo;s posted.
                </p>
              ) : null}

              {/* Modules pair up two to a row from `md`; one without a partner
                  takes the whole row, so the grid never leaves a hole. */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {hasLodging ? <LodgingModule itinerary={itinerary} className={soloSpan(hasBring)} /> : null}

                {hasBring ? (
                  <Module icon={Luggage} title="What to bring" className={soloSpan(hasLodging)}>
                    <div className="flex flex-col gap-4">
                      {itinerary.uniform_requirements?.trim() ? (
                        <div>
                          <FieldLabel>Uniform</FieldLabel>
                          <p className="mt-1 max-w-prose whitespace-pre-line break-words font-fw-sans text-body-sm text-text-primary">
                            {itinerary.uniform_requirements.trim()}
                          </p>
                        </div>
                      ) : null}
                      {gear.length > 0 ? (
                        <div>
                          <FieldLabel>Gear</FieldLabel>
                          <ul
                            className={cn(
                              'mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1.5',
                              // Two columns only when the module has the row to itself.
                              !hasLodging &&
                                gear.every((item) => item.length <= GEAR_COMPACT_MAX) &&
                                'sm:grid-cols-2',
                            )}
                          >
                            {gear.map((item, i) => (
                              <li
                                key={`${i}-${item}`}
                                className="flex items-start gap-2.5 font-fw-sans text-body-sm text-text-primary"
                              >
                                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" />
                                <span className="min-w-0 break-words">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </Module>
                ) : null}

                {hasFlight ? (
                  <Module icon={Plane} title="Flight" className={soloSpan(hasRooms)}>
                    <p className="whitespace-pre-line break-words font-fw-sans text-body-sm text-text-primary">
                      {itinerary.flight_info?.trim()}
                    </p>
                  </Module>
                ) : null}

                {hasRooms ? (
                  <Module icon={Users} title="Rooms" className={soloSpan(hasFlight)}>
                    <p className="whitespace-pre-line break-words font-fw-sans text-body-sm text-text-primary">
                      {itinerary.room_assignments?.trim()}
                    </p>
                  </Module>
                ) : null}

                {itinerary.notes?.trim() ? (
                  <Module icon={NotebookPen} title="Notes" className="md:col-span-2">
                    <p className="max-w-prose whitespace-pre-line break-words font-fw-sans text-body-sm leading-6 text-text-primary">
                      {itinerary.notes.trim()}
                    </p>
                  </Module>
                ) : null}

                <ExpensesStrip
                  className="md:col-span-2"
                  isCoach={isCoach}
                  loading={loadingExpenses}
                  failed={expensesFailed}
                  count={expenses.length}
                  total={expenseSummary ? expenseSummary.total : sumAmounts(expenses)}
                  onOpen={() => onTabChange('expenses')}
                  onAdd={onAddExpense}
                  onRetry={onRefreshExpenses}
                />
              </div>
            </div>
          </TabsContent>

          {/* ═══════════ EXPENSES ═══════════ */}
          <TabsContent value="expenses" className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-fw-sans text-body-lg font-semibold text-text-primary">Trip expenses</h3>
              <div className="flex items-center gap-1.5">
                {expenses.length > 0 && !loadingExpenses ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onExportCSV}
                    busy={exporting}
                    disabled={exporting}
                    leftIcon={<Download className="h-4 w-4" />}
                  >
                    Export CSV
                  </Button>
                ) : null}
                {isCoach && !expensesFailed ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onAddExpense}
                    leftIcon={<Plus className="h-4 w-4" />}
                  >
                    Add expense
                  </Button>
                ) : null}
              </div>
            </div>

            {loadingExpenses ? (
              <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-live="polite">
                <span className="sr-only">Loading expenses…</span>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-2/3" />
              </div>
            ) : expensesFailed ? (
              <div className="flex flex-col items-start gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-4">
                <p className="font-fw-sans text-body-sm text-text-primary">
                  Expenses for this trip could not load.
                </p>
                <Button variant="secondary" size="sm" onClick={onRefreshExpenses}>
                  Try again
                </Button>
              </div>
            ) : expenses.length === 0 ? (
              <Surface elevation="border" padding="none">
                <EmptyState
                  variant="subtle"
                  icon={Receipt}
                  title="No expenses logged"
                  description={
                    isCoach
                      ? 'Track lodging, transport, meals, and entry fees for this trip.'
                      : 'Trip expenses your coach logs will appear here.'
                  }
                />
              </Surface>
            ) : (
              <div className="flex flex-col gap-6">
                {expenseSummary && expenseSummary.count > 0 ? (
                  <FairwayExpenseSummary
                    summary={expenseSummary}
                    budgets={budgets}
                    itineraryId={itinerary.id}
                    isCoach={isCoach}
                    onBudgetUpdated={onRefreshExpenses}
                  />
                ) : null}
                <div>
                  <h4 className="mb-3 font-fw-sans text-body-sm font-semibold text-text-secondary">All expenses</h4>
                  <FairwayExpenseList
                    expenses={expenses}
                    onEdit={onEditExpense}
                    onRefresh={onRefreshExpenses}
                    isCoach={isCoach}
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Surface>

      {/* Destructive-cascade confirm: names what gets removed (the trip AND
          its expenses), consistent with the Fairway remove-player confirm. */}
      <ModalShell
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        size="md"
        title="Delete this trip?"
        description={
          <>
            Delete <span className="font-medium text-text-primary">{itinerary.event_name}</span>? This
            can&rsquo;t be undone.
          </>
        }
      >
        <ModalShell.Body>
          <p className="rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3 font-fw-sans text-body-sm text-text-secondary">
            {expenseCount === null ? (
              <>This removes the entire itinerary and any expenses logged on it.</>
            ) : expenseCount > 0 ? (
              <>
                This removes the entire itinerary{' '}
                <span className="font-medium text-text-primary">
                  and its {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
                </span>
                .
              </>
            ) : (
              <>This removes the entire itinerary. No expenses are logged on this trip yet.</>
            )}
          </p>
        </ModalShell.Body>

        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Delete trip
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Pieces
 * ────────────────────────────────────────────────────────────────────────── */

/** The gear list, one entry per item: the DB array when present, else the joined string. */
function gearItems(itinerary: TravelItinerary): string[] {
  const source =
    itinerary.gear_items ?? (itinerary.gear_list ? itinerary.gear_list.split(',') : []);
  return source.map((item) => item.trim()).filter((item) => item.length > 0);
}

/** A module whose row partner is missing takes the whole row from `md`. */
function soloSpan(hasPartner: boolean): string | undefined {
  return hasPartner ? undefined : 'md:col-span-2';
}

function sumAmounts(expenses: ReadonlyArray<TravelExpense>): number {
  return expenses.reduce((sum, expense) => sum + (Number.isFinite(expense.amount) ? expense.amount : 0), 0);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-fw-sans text-caption text-text-tertiary">{children}</p>;
}

/** A raised module: icon + title over its content. */
function Module({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Inset padding="sm" className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
        <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h3>
      </div>
      {children}
    </Inset>
  );
}

/** How far off the trip is, as a tile beside the name (from `sm`). */
function CountdownTile({ figure, label }: { figure: string | null; label: string }) {
  return (
    <div
      data-testid="trip-countdown"
      className="hidden min-w-[6.5rem] shrink-0 flex-col items-center justify-center rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-2.5 text-center sm:flex"
    >
      {figure ? (
        <>
          <span className="font-fw-sans text-h1 font-semibold tabular-nums text-text-primary">{figure}</span>
          <span className="font-fw-sans text-caption text-text-secondary">{label}</span>
        </>
      ) : (
        <span className="py-2 font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">{label}</span>
      )}
    </div>
  );
}

/**
 * The schedule as one band: Depart → transport and nights → Return. Stacked
 * on a phone, three columns from `sm` with the return set flush right.
 */
function JourneyBand({
  itinerary,
  now,
  className,
}: {
  itinerary: TravelItinerary;
  now: Date | null;
  className?: string;
}) {
  const Icon = TRANSPORT_ICON[itinerary.transportation_type];
  const year = now ? now.getFullYear() : null;
  const withYear = (key: string) => year !== null && Number(key.slice(0, 4)) !== year;
  const nights = formatTripNights(itinerary);
  const departLocation = itinerary.departure_location?.trim();

  return (
    <section
      aria-label="Schedule"
      className={cn('rounded-fw-md bg-surface-sunken p-4 sm:px-5', className)}
    >
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4">
        <div className="min-w-0">
          <FieldLabel>Depart</FieldLabel>
          <p className="mt-0.5 font-fw-sans text-body font-semibold tabular-nums text-text-primary">
            {itinerary.departure_date
              ? formatTravelDay(itinerary.departure_date, withYear(itinerary.departure_date))
              : 'Not set'}
          </p>
          {itinerary.departure_time || departLocation ? (
            <p className="mt-0.5 break-words font-fw-sans text-body-sm text-text-secondary">
              {[itinerary.departure_time ? formatTravelTime(itinerary.departure_time) : null, departLocation]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 sm:flex-col sm:gap-1.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="hidden h-px w-5 bg-border-strong sm:block md:w-8" />
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface text-text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span aria-hidden className="hidden h-px w-5 bg-border-strong sm:block md:w-8" />
          </div>
          <p className="font-fw-sans text-caption tabular-nums text-text-secondary">
            {TRANSPORT_LABEL[itinerary.transportation_type]}
            {nights ? <span className="text-text-tertiary"> · {nights}</span> : null}
          </p>
        </div>

        <div className="min-w-0 sm:text-right">
          <FieldLabel>Return</FieldLabel>
          {itinerary.return_date ? (
            <>
              <p className="mt-0.5 font-fw-sans text-body font-semibold tabular-nums text-text-primary">
                {formatTravelDay(itinerary.return_date, withYear(itinerary.return_date))}
              </p>
              {itinerary.return_time ? (
                <p className="mt-0.5 font-fw-sans text-body-sm tabular-nums text-text-secondary">
                  {formatTravelTime(itinerary.return_time)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 font-fw-sans text-body font-semibold text-text-tertiary">Not set</p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The linked golf_events row. Deep-links to the specific event (?event=<id>)
 * so the calendar opens its drawer. Hidden when the trip is not linked.
 */
function LinkedEventRow({ itinerary }: { itinerary: TravelItinerary }) {
  return (
    <Link
      href={`/golf/dashboard/calendar?event=${itinerary.event_id}`}
      className="group flex min-h-11 items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3.5 py-2.5 transition-[border-color,box-shadow] [transition-duration:180ms] hover:border-border-strong hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus motion-reduce:transition-none"
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-fw-sans text-caption text-text-tertiary">On the calendar</span>
        <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {itinerary.event_title || 'Calendar event'}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] group-hover:translate-x-0.5 group-hover:text-text-primary motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}

function LodgingModule({ itinerary, className }: { itinerary: TravelItinerary; className?: string }) {
  const phone = itinerary.hotel_phone?.trim();
  const dialable = phone ? phone.replace(/[^\d+]/g, '') : '';
  const confirmation = itinerary.hotel_confirmation?.trim();
  return (
    <Module icon={BedDouble} title="Lodging" className={className}>
      <div>
        <p className="break-words font-fw-sans text-body font-semibold text-text-primary">
          {itinerary.hotel_name?.trim()}
        </p>
        {itinerary.hotel_address ? (
          <p className="mt-0.5 break-words font-fw-sans text-body-sm text-text-secondary">
            {itinerary.hotel_address.trim()}
          </p>
        ) : null}
      </div>
      {phone || confirmation ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3 font-fw-sans text-body-sm">
          {phone ? (
            <>
              <dt className="text-text-tertiary">Phone</dt>
              <dd className="min-w-0">
                {dialable.length >= 7 ? (
                  <a
                    href={`tel:${dialable}`}
                    className="inline-flex items-center gap-1.5 rounded-fw-sm font-medium tabular-nums text-text-primary underline decoration-border-strong underline-offset-4 hover:decoration-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus [@media(pointer:coarse)]:min-h-11"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
                    {phone}
                  </a>
                ) : (
                  <span className="tabular-nums text-text-primary">{phone}</span>
                )}
              </dd>
            </>
          ) : null}
          {confirmation ? (
            <>
              <dt className="text-text-tertiary">Confirmation</dt>
              <dd className="min-w-0 select-all break-all font-medium tabular-nums text-text-primary">
                {confirmation}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </Module>
  );
}

/**
 * The trip's expenses at a glance, as one strip under the logistics: the same
 * per-trip read as the Expenses tab. Never says "none logged" before that
 * read answered, and never shows a failed read as none.
 */
function ExpensesStrip({
  className,
  isCoach,
  loading,
  failed,
  count,
  total,
  onOpen,
  onAdd,
  onRetry,
}: {
  className?: string;
  isCoach: boolean;
  loading: boolean;
  failed: boolean;
  count: number;
  total: number;
  onOpen: () => void;
  onAdd: () => void;
  onRetry: () => void;
}) {
  let summary: React.ReactNode;
  let action: React.ReactNode = null;
  if (loading) {
    summary = (
      <div role="status" aria-busy="true" className="mt-1">
        <span className="sr-only">Loading expenses…</span>
        <Skeleton className="h-4 w-44" />
      </div>
    );
  } else if (failed) {
    summary = <p className="font-fw-sans text-body-sm text-text-secondary">Expenses could not load.</p>;
    action = (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    );
  } else if (count === 0) {
    summary = <p className="font-fw-sans text-body-sm text-text-secondary">No expenses logged yet.</p>;
    action = isCoach ? (
      <Button variant="secondary" size="sm" onClick={onAdd} leftIcon={<Plus className="h-4 w-4" />}>
        Add expense
      </Button>
    ) : null;
  } else {
    summary = (
      <p className="font-fw-sans text-body-sm tabular-nums text-text-secondary">
        <span className="text-body font-semibold text-text-primary">{formatTravelMoney(total)}</span> across{' '}
        {count} {count === 1 ? 'expense' : 'expenses'}
      </p>
    );
    action = (
      <Button variant="ghost" size="sm" onClick={onOpen} rightIcon={<ArrowRight className="h-4 w-4" />}>
        Open expenses
      </Button>
    );
  }

  return (
    <Inset
      padding="sm"
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
        <div className="min-w-0">
          <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">Expenses</h3>
          {summary}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Inset>
  );
}
