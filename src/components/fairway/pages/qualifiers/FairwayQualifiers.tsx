'use client';

/**
 * ============================================================================
 * Fairway · pages/qualifiers · FairwayQualifiers — the lineup field sheet
 * ----------------------------------------------------------------------------
 * The SHARED coach+player /golf/dashboard/qualifiers route, rebuilt to
 * docs/design/fairway-facelift/LANGUAGE.md: a bare masthead over one Surface
 * stage, a bare ledger row, then a dense table.
 *
 * What changed, and why. The previous pass was an Elevated hero card, a
 * standalone toolbar, and a bordered Surface holding two seam-lists. Four
 * regions, three of them boxes, and between them they answered one question:
 * what is this list. The question a coach actually opens this page with is
 * which qualifier is setting the lineup right now, when does its field lock,
 * and is the decision already made.
 *
 * Every field this page now reads was already arriving on the row. The loader
 * selects `golf_qualifiers.*`, so `entry_deadline`, `selection_state`,
 * `selection_slots_total`, `selection_slots_coach_pick` and `num_rounds` have
 * been in the payload all along and rendered nowhere. The stage, the deadline
 * clause, the lineup state and the travel-squad readout are all built from
 * that unused half of the row, with no new query.
 *
 * ── ROLE FORK (the only thing role changes) ────────────────────────────────
 *   Coaches and players see the same list, the same stage and the same table.
 *   Role toggles the coach-only "Create qualifier" action, the empty-state
 *   copy, and where the "needs a decision" ledger points: the selection
 *   workspace is coach-only and bounces a player straight back to the detail
 *   page, so a player's row links to the detail page directly rather than
 *   through a redirect.
 *
 * ── HONESTY ────────────────────────────────────────────────────────────────
 *   No entry counts: there is no golf_qualifier_entries join in this view. A
 *   null spot count is never summed as a zero; the readout says how many rows
 *   it could not count. A qualifier with no recorded entry deadline draws a
 *   single solid bar rather than a shaded waiting period we never measured.
 *
 * ── HYDRATION ──────────────────────────────────────────────────────────────
 *   `today` arrives from the server and is what the first client render uses,
 *   so the markup matches. An effect then corrects it to the viewer's own
 *   local day, which can differ from the server's UTC day near midnight. Day
 *   arithmetic never reads a clock during render.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';

import {
  ViewHeader,
  Surface,
  Button,
  EmptyState,
  FilterPill,
  SearchField,
  Segmented,
  PressTarget,
} from '@/components/fairway';
import { IconPlus } from '@/components/icons';
import type { GolfQualifier } from '@/lib/types/golf';
import { VerdictLine, FieldReadouts, SectionHead, type ReadoutItem } from '@/components/fairway/pages/dashboard/coach-home-parts';
import { qualifierStatusMeta } from './qualifier-status';
import { QualifyingField } from './QualifyingField';
import { LedgerColumn, LedgerEmpty, LedgerRow, QualifiersTable } from './qualifiers-parts';
import {
  buildQualifiersVerdict,
  detailHref,
  fieldDomain,
  isActive,
  isConcluded,
  lockingSoon,
  needsDecision,
  openSpots,
  pickHero,
  recentlyConcluded,
  selectionStateLabel,
  stageRows,
  statusOf,
  toBar,
  workspaceHref,
} from './qualifiers-field-logic';

const CREATE_HREF = '/golf/dashboard/qualifiers/new';
const TABLE_PAGE_SIZE = 10;

type StatusFilter = 'all' | 'active' | 'concluded';
type StageView = 'active' | 'all';

/**
 * Format a bare ISO date ("YYYY-MM-DD") for display. Parsed as **local**
 * midnight, not `new Date(dateStr)` — that treats a date-only string as UTC
 * midnight, so a timezone behind UTC (any US zone) reads it back as the PRIOR
 * calendar day, and server (UTC) vs. client (local) render two different
 * calendar days for the same value — a hydration mismatch (#30/#126).
 */
export function formatDate(dateStr: string): string {
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface FairwayQualifiersProps {
  /** Whether the current viewer is a coach (gates the Create action + copy). */
  isCoach: boolean;
  /** The team's qualifiers (loader query verbatim: team_id, start_date desc). */
  qualifiers: GolfQualifier[];
  /** The server's own calendar day, `YYYY-MM-DD`. See HYDRATION above. */
  today: string;
}

export function FairwayQualifiers({ isCoach, qualifiers, today: serverToday }: FairwayQualifiersProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [stageView, setStageView] = useState<StageView>('active');
  const [tableVisible, setTableVisible] = useState(TABLE_PAGE_SIZE);

  // The server's day is what the first client render uses, so the markup
  // matches. Near midnight the viewer's own day can differ; correct it after
  // mount rather than reading a clock during render.
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setToday((prev) => (local === prev ? prev : local));
  }, [serverToday]);

  const activeCount = useMemo(() => qualifiers.filter(isActive).length, [qualifiers]);
  const concludedCount = useMemo(() => qualifiers.filter(isConcluded).length, [qualifiers]);
  const hero = useMemo(() => pickHero(qualifiers), [qualifiers]);

  const verdict = useMemo(
    () => buildQualifiersVerdict({ hero, activeCount, concludedCount, today, formatDate }),
    [hero, activeCount, concludedCount, today],
  );

  const rows = useMemo(() => stageRows(qualifiers, stageView), [qualifiers, stageView]);
  const domain = useMemo(() => fieldDomain(rows, today), [rows, today]);
  const bars = useMemo(() => rows.map((q) => toBar(q, today)), [rows, today]);

  const spots = useMemo(() => openSpots(qualifiers), [qualifiers]);
  const decisions = useMemo(() => needsDecision(qualifiers), [qualifiers]);
  const locking = useMemo(() => lockingSoon(qualifiers, today), [qualifiers, today]);
  const concludedRecent = useMemo(() => recentlyConcluded(qualifiers), [qualifiers]);

  const readouts: ReadoutItem[] = useMemo(
    () => [
      { key: 'active', label: 'Active', value: String(activeCount), note: activeCount === 0 ? 'Nothing running' : ' ' },
      { key: 'concluded', label: 'Concluded', value: String(concludedCount), note: ' ' },
      {
        key: 'spots',
        label: 'Open spots',
        value: String(spots.total),
        // A null spot count is not a zero. Say how many rows are missing from
        // the total rather than publishing a figure that understates itself.
        note: spots.unknown > 0 ? `excludes ${spots.unknown} with no spot count set` : ' ',
      },
      {
        key: 'squad',
        label: 'Travel squad',
        value: hero?.selection_slots_total != null ? String(hero.selection_slots_total) : null,
        note:
          hero?.selection_slots_coach_pick != null
            ? `${hero.selection_slots_coach_pick} coach ${hero.selection_slots_coach_pick === 1 ? 'pick' : 'picks'}`
            : ' ',
      },
    ],
    [activeCount, concludedCount, spots, hero],
  );

  // The table's own search and status pills narrow the TABLE only. The stage
  // keeps its whole row set, which is what guarantees it always has something
  // to draw and keeps a typed search from emptying the instrument above it.
  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bucket = qualifiers.filter((row) => {
      if (statusFilter === 'active') return isActive(row);
      if (statusFilter === 'concluded') return isConcluded(row);
      return true;
    });
    if (!q) return stageRows(bucket, 'all');
    return stageRows(
      bucket.filter((row) =>
        `${row.name ?? ''} ${row.description ?? ''} ${row.course_name ?? ''}`.toLowerCase().includes(q),
      ),
      'all',
    );
  }, [qualifiers, statusFilter, query]);

  const tableShown = tableRows.slice(0, tableVisible);
  const tableRemaining = tableRows.length - tableShown.length;
  const isFiltering = statusFilter !== 'all' || query.trim().length > 0;

  const createCta = isCoach ? (
    <Button variant="primary" asChild>
      <a href={CREATE_HREF}>
        <IconPlus size={16} />
        <span>Create qualifier</span>
      </a>
    </Button>
  ) : undefined;

  // ── The true zero state keeps the old masthead: there is no field to draw,
  //    no ledger to fill and no table to head. ──────────────────────────────
  if (qualifiers.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8">
        <ViewHeader
          eyebrow="Qualifiers"
          title="Lineup decisions."
          description={
            isCoach
              ? 'Run head-to-head qualifiers to decide who plays this week.'
              : 'Qualifiers your coach posts will appear here.'
          }
          primaryAction={createCta}
        />
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              title="No qualifiers yet"
              description={
                isCoach
                  ? 'Create a qualifier to run a head-to-head and decide who plays this week.'
                  : 'No qualifiers have been posted by your coach yet.'
              }
              action={
                isCoach ? (
                  <Button variant="primary" asChild>
                    <a href={CREATE_HREF}>
                      <IconPlus size={16} />
                      <span>Create qualifier</span>
                    </a>
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      </div>
    );
  }

  const ledgerColumns = [decisions.length > 0, locking.length > 0, concludedRecent.length > 0];
  const heroStatus = hero ? qualifierStatusMeta(statusOf(hero)) : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-24 md:px-6 md:py-8">
      {/* ── 1 · MASTHEAD, bare on the canvas ────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="font-fw-sans text-eyebrow uppercase tracking-[0.09em] text-text-tertiary">Qualifiers</p>
        {createCta}
      </div>
      <h1 className="mt-2 font-fw-display text-display font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary">
        Lineup decisions.
      </h1>
      <div className="mt-3">
        <VerdictLine parts={verdict} />
      </div>
      <p className="mt-3 font-fw-mono text-caption tabular-nums text-text-tertiary">
        {qualifiers.length} on file
        {hero?.course_name ? ` · ${hero.course_name}` : ''}
        {hero?.num_rounds ? ` · ${hero.num_rounds} ${hero.num_rounds === 1 ? 'round' : 'rounds'}` : ''}
      </p>

      {/* ── 2 · THE STAGE, the one Surface ──────────────────────────────── */}
      <Surface elevation="shadow" padding="none" className="mt-10 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="min-w-0 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                  The pipeline{heroStatus ? ` · ${heroStatus.label}` : ''}
                </p>
                <h2 className="mt-1 font-fw-display text-h2 font-semibold text-text-primary">Qualifying field</h2>
                <p className="mt-1 max-w-[58ch] font-fw-sans text-body-sm text-text-secondary">
                  Each bar runs from the entry deadline through the last day of play; the pale half is the
                  waiting period. A one-day qualifier marks its date instead. Amber means entries
                  close within a week.
                </p>
              </div>
              <Segmented
                size="sm"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'all', label: 'All' },
                ]}
                value={stageView}
                onValueChange={(v) => setStageView(v as StageView)}
                aria-label="Which qualifiers to plot"
              />
            </div>
            <div className="mt-5">
              <QualifyingField bars={bars} domain={domain} today={today} ariaLabel="Qualifying field" />
            </div>
          </div>
          {/* Below xl the readouts read first, the way the coach home orders
              them on a phone: the four numbers are the glance, the field is
              what you scroll into. At xl they take the rail on the right. */}
          <div className="order-first border-b border-border-subtle p-4 md:p-6 xl:order-none xl:border-b-0">
            <FieldReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · THE LEDGER ROW, bare, hairline-divided ──────────────────── */}
      {ledgerColumns.some(Boolean) ? (
        <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
          <LedgerColumn title="Needs a decision" className="xl:col-span-4 xl:pr-8">
            {decisions.length === 0 ? (
              <LedgerEmpty>
                {activeCount === 0 ? 'No active qualifier right now.' : 'Every active qualifier has a decided lineup.'}
              </LedgerEmpty>
            ) : (
              decisions.map((q) => (
                <LedgerRow
                  key={q.id}
                  name={q.name ?? 'Untitled qualifier'}
                  // The selection workspace is coach-only and redirects a
                  // player to the detail page, so send a player there directly
                  // rather than through a bounce.
                  href={isCoach ? workspaceHref(q.id) : detailHref(q.id)}
                  fact={selectionStateLabel(q.selection_state)}
                />
              ))
            )}
          </LedgerColumn>

          <LedgerColumn title="Locking soon" className="xl:col-span-4 xl:px-8">
            {locking.length === 0 ? (
              <LedgerEmpty>
                {activeCount === 0 ? 'No active qualifier right now.' : 'No entry deadlines coming up.'}
              </LedgerEmpty>
            ) : (
              locking.map(({ q, days }) => (
                <LedgerRow
                  key={q.id}
                  name={q.name ?? 'Untitled qualifier'}
                  href={detailHref(q.id)}
                  fact={days === 0 ? 'today' : `${days}d`}
                  factTone={days <= 7 ? 'urgent' : 'quiet'}
                />
              ))
            )}
          </LedgerColumn>

          <LedgerColumn title="Recently concluded" className="md:col-span-2 xl:col-span-4 xl:pl-8">
            {concludedRecent.length === 0 ? (
              <LedgerEmpty>No qualifiers concluded yet.</LedgerEmpty>
            ) : (
              concludedRecent.map((q) => (
                <LedgerRow
                  key={q.id}
                  name={q.name ?? 'Untitled qualifier'}
                  href={detailHref(q.id)}
                  fact={formatDate(q.end_date ?? q.start_date)}
                />
              ))
            )}
          </LedgerColumn>
        </div>
      ) : null}

      {/* ── 4 · THE TABLE ───────────────────────────────────────────────── */}
      <div className="mt-12">
        <SectionHead title="All qualifiers" count={tableRows.length} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1 md:max-w-sm">
            <SearchField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search qualifiers"
              aria-label="Search qualifiers"
            />
          </div>
          <div className="flex flex-nowrap items-center gap-2">
            <FilterPill selected={statusFilter === 'all'} showCheck={false} count={qualifiers.length} onClick={() => setStatusFilter('all')}>
              All
            </FilterPill>
            <FilterPill selected={statusFilter === 'active'} showCheck={false} count={activeCount} onClick={() => setStatusFilter('active')}>
              Active
            </FilterPill>
            <FilterPill selected={statusFilter === 'concluded'} showCheck={false} count={concludedCount} onClick={() => setStatusFilter('concluded')}>
              Concluded
            </FilterPill>
          </div>
        </div>

        {tableRows.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              variant="subtle"
              title="No matches"
              description={
                isFiltering
                  ? 'No qualifier matches that search and filter. Clear them to see the full list.'
                  : 'No qualifiers to show.'
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-4">
              <QualifiersTable rows={tableShown} formatDate={formatDate} />
            </div>
            {tableRemaining > 0 ? (
              <PressTarget
                onClick={() => setTableVisible((n) => n + TABLE_PAGE_SIZE)}
                className="mt-4 inline-flex min-h-11 items-center font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
              >
                Show {Math.min(tableRemaining, TABLE_PAGE_SIZE)} more
              </PressTarget>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
