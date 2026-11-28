'use client';

import { CircleAlert, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Card, CardBody, CardFooter, CardHeader, CardMetric } from '../ui/Card';
import { DeltaChip } from '../ui/DeltaChip';
import { Icon } from '../ui/Icon';
import { formatFixed, formatSigned } from '../lib/format';
import { RosterLeaders } from '../screens/roster/RosterLeaders';
import { leaderPicks, ROSTER_EARLY_FLOOR, yearKeyOf, type RosterLeader } from '../screens/roster/format';
import { PREVIEW_ROSTER_CRH as PREVIEW_ROSTER } from './fixtures-roster';

const KIND: Record<RosterLeader['kind'], { label: string; icon: LucideIcon; unit: string }> = {
  low: { label: 'Lowest average', icon: Trophy, unit: 'season' },
  heater: { label: 'Best last 3', icon: TrendingUp, unit: 'last 3 avg' },
  look: { label: 'Needs a look', icon: CircleAlert, unit: 'SG a round' },
};

const noop = () => {};

/**
 * The card lab (design lab pilot P1, dsx-02): today's Roster leader cards beside the same fixture players drawn with the
 * card kernel (`ui/Card.tsx`), then the kernel's roles and states. Fixture data only; layout evidence, never shown as the
 * product (the real-data rule): the shipped change is shot on staging.
 */
export function CardLab() {
  const players = PREVIEW_ROSTER.players;
  const clock = PREVIEW_ROSTER.clock;
  const picks = leaderPicks(players);
  return (
    <main className="ch-card-lab" data-ready="true">
      <header className="ch-card-lab__head">
        <h1>Card lab</h1>
        <p>Fixture players. Current on the left of each pair, the card kernel on the right.</p>
      </header>

      <section className="ch-card-lab__sec" aria-labelledby="cl-current">
        <h2 id="cl-current">Roster leaders, current</h2>
        <div className="ch-rs ch-rsd ch-card-lab__current" data-ch-crh="on">
          <div className="ch-rs-top">
            <RosterLeaders players={players} statsError={false} clock={clock} onOpen={noop} />
          </div>
        </div>
      </section>

      <section className="ch-card-lab__sec" aria-labelledby="cl-kernel">
        <h2 id="cl-kernel">Roster leaders, card kernel (option F bar)</h2>
        <div className="ch-card-lab__row">
          {picks.map(({ kind, player: p, value }) => {
            const k = KIND[kind];
            const reason = kind === 'look' ? p.attention?.text ?? null : null;
            return (
              <Card key={kind} kind="metric" bar="green" onPress={noop}>
                <CardHeader eyebrow={k.label} icon={<Icon icon={k.icon} size={15} />} />
                <CardMetric value={kind === 'look' ? formatSigned(value) : formatFixed(value)} unit={k.unit} tone={kind === 'look' ? 'loss' : undefined} />
                <CardBody>
                  <span className="ch-card-lab__who">
                    <Avatar name={p.name} id={p.id} size="sm" year={yearKeyOf(p.gradYear, clock)} />
                    <b>{p.name}</b>
                  </span>
                  {reason && <span className="ch-card-lab__why">{reason}</span>}
                </CardBody>
              </Card>
            );
          })}
        </div>
        <p className="ch-card-lab__rule">Leaders count active players with {ROSTER_EARLY_FLOOR}+ counting rounds.</p>
      </section>

      <section className="ch-card-lab__sec" aria-labelledby="cl-roles">
        <h2 id="cl-roles">Roles</h2>
        <div className="ch-card-lab__row">
          <Card kind="comparison">
            <CardHeader eyebrow="Scoring average" meta="Last 10 rounds" />
            <CardMetric value="72.4" delta={<DeltaChip value={-1.8} se={0.6} better="lower" />} />
            <CardFooter>vs previous 10 rounds, 74.2</CardFooter>
          </Card>
          <Card kind="metric" tone="feature">
            <CardHeader eyebrow="Team scoring" meta="This season" />
            <CardMetric value="74.9" unit="per 18" size="hero" />
            <CardFooter>7 active · 1 injured</CardFooter>
          </Card>
          <Card kind="entity">
            <CardHeader title="Next qualifier" meta="Thursday · Pinehurst No. 2" />
            <CardBody>5 of 6 players confirmed.</CardBody>
          </Card>
        </div>
      </section>

      <section className="ch-card-lab__sec" aria-labelledby="cl-states">
        <h2 id="cl-states">States</h2>
        <div className="ch-card-lab__row">
          <Card kind="metric" state="loading" label="Loading lowest average" />
          <Card kind="metric" bar="green" state="empty" message="No player has 3 counting rounds yet.">
            <CardHeader eyebrow="Lowest average" />
          </Card>
          <Card kind="metric" bar="green" state="failed" message="Could not load scores. Pull to try again.">
            <CardHeader eyebrow="Best last 3" />
          </Card>
        </div>
      </section>
    </main>
  );
}
