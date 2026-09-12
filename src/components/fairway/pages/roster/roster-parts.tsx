'use client';

/**
 * Roster parts (LANGUAGE.md): the two ledger columns and the dense player
 * table. Bare typography on the canvas; the only Surface on the page is
 * the stage in FairwayCoachRoster.tsx. `VerdictLine`/`FieldReadouts`/
 * `SectionHead` are reused directly from the Home build (they're generic
 * over their own prop types — roster.v3.md Risks blesses this cross-page
 * import rather than forking three identical components).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/fairway/controls/button';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { SectionHead } from '@/components/fairway/pages/dashboard/coach-home-parts';
import type { NeedRow } from '@/components/fairway/pages/coachhelm/roster-health';
import type { ScoreFieldTrend } from '@/components/fairway/modules/types';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import { cn } from '@/lib/utils';
import { formatHandicap } from './roster-helpers';
import { playerName, type FocusOutcomeRow, type FocusOutcomeTone } from './roster-logic';
import { formatSgTotal, sgTone, type RosterPlayer } from './FairwayPlayerCard';
import { FairwayYearBadge } from './FairwayYearBadge';
import { FairwayIntentControl } from './FairwayIntentControl';
import { FairwayPlayerActionsMenu } from './FairwayPlayerActionsMenu';

/* ── Trend cell — same ▲/▼/flat/no-read convention as the stage's TrendMark
   and Home's TrendCell, applied to the table's Trend column. ─────────────── */

export function RosterTrendCell({ trend }: { trend: ScoreFieldTrend | null }) {
  if (!trend) return <span className={cn('font-fw-sans text-caption', 'text-text-tertiary')}>no read</span>;
  const magnitude = Math.abs(trend.delta).toFixed(1);
  if (trend.direction === 'improving') {
    return (
      <span className="font-fw-mono text-caption font-medium tabular-nums text-accent-700">
        <span aria-hidden="true">▲</span> {magnitude}
      </span>
    );
  }
  if (trend.direction === 'declining') {
    return (
      <span className="font-fw-mono text-caption font-medium tabular-nums text-fw-warning-ink">
        <span aria-hidden="true">▼</span> {magnitude}
      </span>
    );
  }
  return <span className="font-fw-sans text-caption text-text-tertiary">flat</span>;
}

/* ── Ledger column 1 — Attention ──────────────────────────────────────────── */

const ATTENTION_CAP = 6;

export function RosterAttentionColumn({
  needs,
  playersWithRounds,
  onAdd,
  onShowMore,
}: {
  needs: ReadonlyArray<NeedRow>;
  playersWithRounds: number;
  onAdd: (playerId?: string) => void;
  onShowMore: () => void;
}) {
  const shown = needs.slice(0, ATTENTION_CAP);
  const remaining = needs.length - shown.length;
  return (
    <section aria-label="Attention" className="flex flex-col gap-3">
      <SectionHead title="Attention" />
      {needs.length === 0 ? (
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
          {playersWithRounds === 0
            ? 'Nothing to assess yet. Attention flags appear once players start logging rounds.'
            : "Roster's covered. Everyone with rounds has a focus area and no one's trending down."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {shown.map(({ row, reason }) => (
              <li key={row.player.id} className="border-t border-border-subtle py-2.5 first:border-t-0">
                <div data-sentry-mask="">
                  <PlayerIdentity
                    name={playerName(row.player)}
                    avatarUrl={row.player.avatar_url}
                    size="sm"
                    meta={<span className="font-fw-sans text-caption font-medium text-fw-warning-ink">{reason}</span>}
                    trailing={
                      <Button variant="ghost" size="sm" onClick={() => onAdd(row.player.id)}>
                        Add focus area
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowMore}
              className="mt-1 h-auto justify-start px-0 py-0 font-fw-sans text-caption font-medium text-accent-700 hover:underline"
            >
              +{remaining} more player{remaining === 1 ? '' : 's'}. Filter the board.
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── Ledger column 2 — Focus outcomes ─────────────────────────────────────── */

const OUTCOME_CAP = 6;
const OUTCOME_LABEL: Record<FocusOutcomeTone, string> = { improved: 'Improved', no_change: 'No change', worsened: 'Worsened' };
const OUTCOME_TONE: Record<FocusOutcomeTone, string> = {
  improved: 'text-accent-700',
  no_change: 'text-text-tertiary',
  worsened: 'text-fw-warning-ink',
};

export function RosterFocusOutcomesColumn({ outcomes }: { outcomes: ReadonlyArray<FocusOutcomeRow> }) {
  const shown = outcomes.slice(0, OUTCOME_CAP);
  const remaining = outcomes.length - shown.length;
  return (
    <section aria-label="Focus outcomes" className="flex flex-col gap-3">
      <SectionHead title="Focus outcomes" count={outcomes.length} />
      {outcomes.length === 0 ? (
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">No focus areas have a recorded outcome yet.</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {shown.map((o) => (
              <li key={`${o.playerId}`} className="flex items-baseline justify-between gap-3 border-t border-border-subtle py-2 first:border-t-0">
                <Link href={o.href} className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
                  {o.name}
                </Link>
                <span className={cn('shrink-0 font-fw-sans text-caption font-medium', OUTCOME_TONE[o.tone])}>{OUTCOME_LABEL[o.tone]}</span>
              </li>
            ))}
          </ul>
          {remaining > 0 ? <p className="font-fw-sans text-caption text-text-tertiary">+{remaining} more outcomes recorded</p> : null}
        </>
      )}
    </section>
  );
}

/* ── The table ─────────────────────────────────────────────────────────────── */

const TH = 'py-2 text-left font-fw-sans text-eyebrow font-medium uppercase tracking-[0.07em] text-text-tertiary';
const TD = 'py-2.5 align-middle font-fw-sans text-body-sm text-text-secondary';
const NUM = 'text-right font-fw-mono tabular-nums';

export function RosterTable({
  players,
  intents,
  onIntentSaved,
}: {
  players: ReadonlyArray<RosterPlayer>;
  intents: Record<string, CoachPlayerIntent>;
  onIntentSaved: () => void;
}) {
  const router = useRouter();
  return (
    <>
      {/* Phone: the same rows, stacked, not a truncated table. A table narrow
          enough to fit a phone either scrolls its own overflow-x-auto sideways
          or drops the one control (intent) that has no other home anywhere in
          the product — FairwayPlayerCard no longer renders and the player
          profile carries no intent control either, so hiding this below `md`
          (as an earlier pass here did) removed the feature outright. Both
          branches stay in the DOM with CSS choosing between them, so nothing
          reads a breakpoint at runtime and the server/client markup agree —
          same shape as QualifiersTable (qualifiers-parts.tsx). */}
      <ul data-slot="roster-ledger-compact" className="flex flex-col md:hidden">
        {players.map((p) => {
          const name = playerName(p);
          const href = `/golf/dashboard/roster/${p.id}`;
          const hasScore = Boolean(p.avg_score && p.avg_score > 0);
          const trend: ScoreFieldTrend | null = p.recent_trend ? { direction: p.recent_trend, delta: p.recent_trend_delta ?? 0 } : null;
          return (
            <li key={p.id} className="flex flex-col gap-2 border-b border-border-subtle py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2" data-sentry-mask="">
                  {/* Badge stays outside the anchor — see the desktop row
                      below for why (its own text would fold into the link's
                      accessible name alongside the player's). */}
                  <Link href={href} className="min-w-0 hover:text-accent-700">
                    <PlayerIdentity name={name} avatarUrl={p.avatar_url} size="sm" />
                  </Link>
                  <FairwayYearBadge year={p.graduation_year} />
                </div>
                <RosterTrendCell trend={trend} />
              </div>
              <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {hasScore ? (p.avg_score ?? 0).toFixed(1) : '—'} avg
                {' · '}
                {p.rounds_count ?? 0} {p.rounds_count === 1 ? 'round' : 'rounds'}
                {' · '}
                SG {p.sg_total != null ? formatSgTotal(p.sg_total) : '—'}
              </p>
              {/* Real touch targets, not nested inside the identity Link —
                  same reason the desktop row keeps them out of its own <tr>
                  onClick (a control inside an anchor/clickable row is invalid
                  and unreliable on touch either way). */}
              <div className="flex items-center justify-between gap-3">
                <FairwayIntentControl playerId={p.id} playerName={name} current={intents[p.id] ?? null} size="sm" onSaved={onIntentSaved} />
                <FairwayPlayerActionsMenu playerId={p.id} playerName={name} currentStatus={p.status} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table data-slot="roster-table" className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border-strong">
              <th scope="col" className={TH}>Player</th>
              {/* The stage above also heads a column "Avg", and it is a
                  DIFFERENT number: the stage averages only the selected window
                  while this column is the player's whole career. Two columns
                  with one word between them, disagreeing by three strokes, is
                  a reading hazard the stage's eyebrow cannot fix from up
                  there. This table only ever renders at `md` and up (the list
                  above covers phone), where "Avg all-time" always has room —
                  no phone-width span/aria-label workaround needed here. */}
              <th scope="col" className={cn(TH, NUM, 'whitespace-nowrap')}>Avg all-time</th>
              <th scope="col" className={cn(TH, NUM)}>Trend</th>
              <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>Rounds</th>
              <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>SG:Total</th>
              <th scope="col" className={cn(TH, NUM, 'hidden md:table-cell')}>Focus</th>
              <th scope="col" className={cn(TH, NUM, 'hidden lg:table-cell')}>Handicap</th>
              <th scope="col" className={cn(TH, 'w-10')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const name = playerName(p);
              const href = `/golf/dashboard/roster/${p.id}`;
              const hasScore = Boolean(p.avg_score && p.avg_score > 0);
              const trend: ScoreFieldTrend | null = p.recent_trend ? { direction: p.recent_trend, delta: p.recent_trend_delta ?? 0 } : null;
              return (
                <tr
                  key={p.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer border-b border-border-subtle transition-colors duration-150 hover:bg-surface-hover"
                >
                  <td className={cn(TD, 'min-w-0')}>
                    <div className="flex min-w-0 items-center gap-2" data-sentry-mask="">
                      {/* The identity block (avatar + name) is a real Link —
                          PlayerIdentity itself renders no link of its own
                          (it's deliberately non-interactive; a parent owns the
                          interaction), so this is the closest keyboard/no-JS
                          equivalent to RoundsLedgerTable's linked-name cell.
                          The year badge sits OUTSIDE the anchor (not passed as
                          `nameAddon`) so its own text doesn't get folded into
                          the link's accessible name alongside the player's. */}
                      <Link href={href} className="min-w-0 hover:text-accent-700">
                        <PlayerIdentity name={name} avatarUrl={p.avatar_url} size="sm" />
                      </Link>
                      <FairwayYearBadge year={p.graduation_year} />
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents the intent pill's own click from also firing the row link */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <FairwayIntentControl playerId={p.id} playerName={name} current={intents[p.id] ?? null} size="sm" onSaved={onIntentSaved} />
                      </div>
                    </div>
                  </td>
                  <td className={cn(TD, NUM, 'font-medium', hasScore ? 'text-text-primary' : 'text-text-tertiary')}>
                    {hasScore ? (p.avg_score ?? 0).toFixed(1) : '—'}
                  </td>
                  <td className={cn(TD, NUM)}>
                    <RosterTrendCell trend={trend} />
                  </td>
                  <td className={cn(TD, NUM, 'hidden md:table-cell')}>{p.rounds_count ?? 0}</td>
                  <td className={cn(TD, NUM, 'hidden md:table-cell', 'font-medium', p.sg_total != null ? sgTone(p.sg_total) : 'text-text-tertiary')}>
                    {p.sg_total != null ? formatSgTotal(p.sg_total) : '—'}
                  </td>
                  <td className={cn(TD, NUM, 'hidden md:table-cell', p.active_focus_areas ? 'text-accent-700' : 'text-text-tertiary')}>
                    {p.active_focus_areas ? p.active_focus_areas : '—'}
                  </td>
                  <td className={cn(TD, NUM, 'hidden lg:table-cell')}>{formatHandicap(p.handicap)}</td>
                  <td className={cn(TD, 'text-right')} onClick={(e) => e.stopPropagation()}>
                    <FairwayPlayerActionsMenu playerId={p.id} playerName={name} currentStatus={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
