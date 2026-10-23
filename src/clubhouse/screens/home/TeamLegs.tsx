'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { ArrowRight, BarChart3 } from 'lucide-react';
import type { ChLegPeople, ChTeamLeg, ChTeamLegs } from '../../data/home';
import { filterFor, statsHref } from '../../data/stats-filter';
import { changeTone, formatFixed, formatPct, formatSigned, NO_DATA } from '../../lib/format';
import { sgBaseline } from '../../lib/sg';
import { deltaTone, deltaWords, needsText } from '../../lib/stats-signal';
import { rebuiltHref } from '../../shell/nav';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SideScroll } from '../../ui/SideScroll';
import { EmptyState } from '../../ui/States';
import { Button } from '../../ui/Button';

/** A player's Game tab on Stats, on the same Last 10 the figures read; null when Stats isn't rebuilt for coaches. */
export function legPlayerHref(id: string): string | null {
  return rebuiltHref(statsHref('/golf/dashboard/stats', filterFor('last10'), { player: id, tab: 'game' }), 'coach');
}

/** "Fairways 61% · Tour 66%", "Putts 30.4 · Tour 29.0"; without a Tour mark, "Fairways 61%". */
export function legStatText(stat: ChTeamLeg['stat']): string {
  const fmt = (v: number | null) => (stat.unit === '%' ? formatPct(v, 0) : formatFixed(v, stat.digits));
  return [`${stat.label} ${fmt(stat.value)}`, stat.tour != null ? `Tour ${fmt(stat.tour)}` : null].filter(Boolean).join(' · ');
}

/** The change's tone and words: inside its standard error it is "No clear change vs previous 10" in plain ink. */
export function legChange(leg: Pick<ChTeamLeg, 'sg' | 'delta' | 'se'>): { tone: '' | 'is-gain' | 'is-loss'; words: string } {
  if (leg.sg == null) return { tone: '', words: `${needsText('sgLong')} with hole scores` };
  if (leg.delta == null) return { tone: '', words: 'No earlier ten to compare' };
  const tone = deltaTone(leg.delta, leg.se, false);
  return { tone, words: deltaWords(leg.delta, tone, 'vs previous 10') };
}

const UNIT_DESK = 'Last 10 rounds · strokes gained per round';

/** "Theo M.", "Theo M. and Eli R.", "Theo M. and 2 others": the first one or two named players link to their Game tab. */
function People({ p, className }: { p: ChLegPeople; className: string }) {
  const named = p.names.length === 2 ? p.ids : p.ids.slice(0, 1);
  const name = (id: string) => {
    const href = legPlayerHref(id);
    const text = p.names[p.ids.indexOf(id)] ?? '';
    return href ? (
      <Link key={id} href={href} className={className}>
        {text}
      </Link>
    ) : (
      <Fragment key={id}>{text}</Fragment>
    );
  };
  return (
    <>
      {named.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ' and '}
          {name(id)}
        </Fragment>
      ))}
      {p.names.length > 2 && ` and ${p.names.length - 1} others`}
    </>
  );
}

function Notices({ legs, covered }: { legs: ChTeamLegs; covered: boolean }) {
  return (
    <>
      {legs.cacheError && <RefreshNotice code="CH-2218" title="Up-and-down figures didn’t load" body="Strokes gained is right." covered={covered} />}
      {legs.tourError && <RefreshNotice code="CH-2219" title="Tour marks didn’t load" body="Strokes gained and the changes are right." covered={covered} />}
    </>
  );
}

function NoHoleRounds() {
  return (
    <EmptyState
      compact
      code="CH-2314"
      icon={BarChart3}
      title="No hole-by-hole rounds in the last 10 yet."
      body="The four parts fill in once players post rounds with hole scores."
    />
  );
}

const NOBODY_RANKED = 'No player has 3 rounds with hole scores yet, so no one is ranked.';

/**
 * P002 (spec B §1): the team's four parts on the coach's desktop Home, a ruled ledger under the scoring stage on the
 * stage's own Last 10 rounds: each part's stat against the Tour's mark, the team's strokes gained per round, its change
 * against the previous ten, and who gains and loses most. Text in a table: no bars, no cards, no chart.
 */
export function TeamLegs({ legs, covered = false }: { legs: ChTeamLegs; covered?: boolean }) {
  const team = rebuiltHref('/golf/dashboard/stats', 'coach');
  const vs = sgBaseline(legs.tour).vs;
  return (
    <section className="ch-h-legs" aria-labelledby="ch-h-legs-t">
      <div className="ch-h-sec">
        <div>
          <h2 id="ch-h-legs-t">The team’s game</h2>
          <span>
            {UNIT_DESK} {vs} &middot; the same rounds as the average above
          </span>
        </div>
        {team && (
          <Button variant="ghost" size="sm" rightIcon={ArrowRight} href={team}>
            Team stats
          </Button>
        )}
      </div>
      <Notices legs={legs} covered={covered} />
      {legs.holeRounds === 0 ? (
        <NoHoleRounds />
      ) : (
        <>
          <SideScroll className="ch-h-legs__scroll">
            <table className="ch-h-legs__t" aria-labelledby="ch-h-legs-t">
              <colgroup>
                <col className="ch-h-legs__c1" />
                <col className="ch-h-legs__c2" />
                <col className="ch-h-legs__c3" />
                <col className="ch-h-legs__c4" />
                <col className="ch-h-legs__c5" />
                <col className="ch-h-legs__c6" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">{vs}</th>
                  <th scope="col" className="r">
                    SG / rd
                  </th>
                  <th scope="col">vs previous 10</th>
                  <th scope="col">Gains most</th>
                  <th scope="col">Loses most</th>
                </tr>
              </thead>
              <tbody>
                {legs.rows.map((leg) => {
                  const change = legChange(leg);
                  return (
                    <tr key={leg.key}>
                      <th scope="row">{leg.label}</th>
                      <td className="ch-num">{legStatText(leg.stat)}</td>
                      <td className={'r ch-num ch-h-legs__sg ' + changeTone(leg.sg, false)}>{formatSigned(leg.sg)}</td>
                      <td className={'ch-h-legs__chg ' + change.tone}>{change.words}</td>
                      <td className="ch-num">
                        <Cell p={leg.gains} />
                      </td>
                      <td className="ch-num">
                        {/* One ranked player gains most and nobody loses: the cell stays empty, not "—". */}
                        <Cell p={leg.loses} none={leg.gains ? '' : NO_DATA} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SideScroll>
          {!legs.ranked && (
            <p className="ch-h-legs__note" data-ch-code="CH-2315">
              {NOBODY_RANKED}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** A Gains most / Loses most cell: the players and the first one's figure; `none` (default "—") when nobody is there. */
function Cell({ p, none = NO_DATA }: { p: ChLegPeople | null; none?: string }) {
  if (!p) return <>{none}</>;
  return (
    <>
      <People p={p} className="ch-h-legs__who" /> <span className={changeTone(p.value, false)}>{formatSigned(p.value, 1)}</span>
    </>
  );
}

/** The phone's people line: "Theo M. gains most · Eli R. loses most" (plural verbs for a tie). */
function PeopleLine({ leg }: { leg: ChTeamLeg }) {
  const verb = (p: ChLegPeople, one: string, many: string) => (p.names.length > 1 ? many : one);
  if (!leg.gains) return null;
  return (
    <span className="ch-hm-legs__who">
      <People p={leg.gains} className="ch-hm-legs__a" /> {verb(leg.gains, 'gains most', 'gain most')}
      {leg.loses && (
        <>
          {' '}
          &middot; <People p={leg.loses} className="ch-hm-legs__a" /> {verb(leg.loses, 'loses most', 'lose most')}
        </>
      )}
    </span>
  );
}

/**
 * The same four parts on the phone (docs/clubhouse/phone/home.md, Q-66 drafting): rows between hairlines after Team
 * scoring. The row is not a link; the names are.
 */
export function TeamLegsPhone({ legs, covered = false }: { legs: ChTeamLegs; covered?: boolean }) {
  const team = rebuiltHref('/golf/dashboard/stats', 'coach');
  return (
    <section className="ch-hm-sec ch-hm-legs" aria-labelledby="ch-hm-legs-t">
      <div className="ch-hm-sec__h">
        <h2 id="ch-hm-legs-t">The team’s game</h2>
        {team && (
          <Link href={team} className="ch-hm-link">
            Team stats
          </Link>
        )}
      </div>
      <Notices legs={legs} covered={covered} />
      {legs.holeRounds === 0 ? (
        <NoHoleRounds />
      ) : (
        <>
          <ul className="ch-hm-legs__list" aria-label={`Strokes gained per round ${sgBaseline(legs.tour).vs}, last 10 rounds`}>
            {legs.rows.map((leg) => {
              const change = legChange(leg);
              return (
                <li key={leg.key} className="ch-hm-legs__r">
                  <b className="ch-hm-legs__l">{leg.label}</b>
                  <b className={'ch-hm-legs__sg ch-num ' + changeTone(leg.sg, false)}>{formatSigned(leg.sg)}</b>
                  <span className="ch-hm-legs__s ch-num">{legStatText(leg.stat)}</span>
                  <em className={'ch-hm-legs__c ' + change.tone}>{change.words}</em>
                  <PeopleLine leg={leg} />
                </li>
              );
            })}
          </ul>
          {!legs.ranked && (
            <p className="ch-hm-legs__note" data-ch-code="CH-2315">
              {NOBODY_RANKED}
            </p>
          )}
        </>
      )}
    </section>
  );
}
