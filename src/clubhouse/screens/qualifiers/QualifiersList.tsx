'use client';

import Link from 'next/link';
import { ArrowRight, Flag, Medal, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQList, ChQListItem } from '../../data/qualifiers';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { formatToPar } from '../../lib/format';
import { ctaLabel } from './model';
import { Meta, StatusPill, ToPar } from './parts';
import '../../styles/qualifiers.css';

type Filter = 'all' | 'active' | 'concluded';
const isActive = (i: ChQListItem) => i.status !== 'completed';
const LIST = '/golf/dashboard/qualifiers';
const detailHref = (id: string) => `${LIST}/${id}`;

/** Qualifiers list, coach and player. `mine` is a player's own entries (/my-qualifiers). */
export function QualifiersList({ data }: { data: ChQList }) {
  const router = useRouter();
  const coach = data.role === 'coach';
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const act = data.items.filter(isActive);
  const con = data.items.filter((i) => !isActive(i));
  const { active, concluded } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (i: ChQListItem) => !needle || [i.name, i.description ?? '', i.course ?? ''].join(' ').toLowerCase().includes(needle);
    return {
      active: filter !== 'concluded' ? data.items.filter(isActive).filter(match) : [],
      concluded: filter !== 'active' ? data.items.filter((i) => !isActive(i)).filter(match) : [],
    };
  }, [data.items, filter, q]);
  const hero = active.find((i) => i.status === 'in_progress') ?? active[active.length - 1];
  const rest = active.filter((i) => i !== hero);
  const choose = (f: Filter) => {
    if (f !== filter) {
      haptic('select');
      chTrail('qualifiers filter', { filter: f });
    }
    setFilter(f);
  };

  const title = coach ? 'Lineup decisions' : data.mode === 'mine' ? 'My qualifiers' : 'Qualifiers';
  const lede = coach
    ? 'Run head-to-head qualifiers to decide who plays this week.'
    : data.mode === 'mine'
      ? 'The qualifiers you’re entered in, and where you stand.'
      : 'Your team’s qualifiers, and where you stand in the ones you’re entered in.';

  return (
    <main className="ch-qf">
      <header className="ch-qf-head">
        <div>
          <span className="ch-qf-eyebrow ch-num">
            {data.mode === 'mine' ? 'My qualifiers' : 'Qualifiers'}
            {!data.listError && ` · ${act.length} active · ${con.length} concluded`}
          </span>
          <h1>{title}</h1>
          <p>{lede}</p>
        </div>
        {/* One primary per screen: with no qualifiers the page empty state (CH-09301) carries Create qualifier. */}
        {coach && (data.listError || data.items.length > 0) && (
          <div className="ch-qf-head__act">
            <Button variant="primary" leftIcon={Plus} href={`${LIST}/new`}>
              Create qualifier
            </Button>
          </div>
        )}
      </header>

      {data.listError ? (
        <InlineNotice
          code="CH-09201"
          title="The qualifiers didn’t load."
          body="Nothing has changed. Try again, and if it keeps happening the error has already been reported."
          onRetry={() => router.refresh()}
        />
      ) : data.items.length === 0 ? (
        data.mode === 'mine' ? (
          <EmptyState
            size="page"
            code="CH-09306"
            icon={Medal}
            title="You aren’t entered in any qualifiers"
            body="Qualifiers your coach enters you in show here, with your rounds and where you stand."
            action={<Button href={LIST}>See the team’s qualifiers</Button>}
          />
        ) : (
          <EmptyState
            size="page"
            code="CH-09301"
            icon={Medal}
            title="No qualifiers yet"
            body={coach ? 'Set up a qualifier to rank players across counted rounds and pick your lineup.' : 'Your coach’s qualifiers show here once they’re set up.'}
            action={
              coach ? (
                <Button variant="primary" leftIcon={Plus} href={`${LIST}/new`}>
                  Create qualifier
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <div className="ch-qf-tools">
            <div className="ch-qf-pills" role="group" aria-label="Filter qualifiers by status">
              {(
                [
                  ['all', 'All', data.items.length],
                  ['active', 'Active', act.length],
                  ['concluded', 'Concluded', con.length],
                ] as const
              ).map(([k, label, n]) => (
                <button key={k} type="button" className="ch-qf-pill" aria-pressed={filter === k} onClick={() => choose(k)}>
                  {label}
                  <span>{n}</span>
                </button>
              ))}
            </div>
            <SearchField className="ch-qf-search" value={q} onChange={setQ} placeholder="Search qualifiers by name, course, or detail" label="Search qualifiers" />
          </div>

          {data.standingsError && (
            <InlineNotice
              code="CH-09202"
              title="Standings didn’t load."
              body="The qualifiers are listed, but entrants, rounds in and leaders are missing until they load."
              onRetry={() => router.refresh()}
            />
          )}

          <SectionBoundary surface="qualifiers.list" label="The qualifiers" code="CH-09211">
            {!active.length && !concluded.length ? (
              <div className="ch-qf-empty ch-sheet">
                <EmptyState
                  compact
                  code="CH-09302"
                  icon={Search}
                  title="No qualifiers match your filters."
                  body="Try a different search, or clear the status filter."
                  action={
                    <Button
                      size="sm"
                      onClick={() => {
                        setFilter('all');
                        setQ('');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                {hero && <Hero item={hero} standingsError={data.standingsError} />}
                {rest.length > 0 && (
                  <section className="ch-qf-sec" aria-labelledby="ch-qf-active">
                    <h2 id="ch-qf-active">Active</h2>
                    <div className="ch-qf-grid">
                      {rest.map((i) => (
                        <Card key={i.id} item={i} standingsError={data.standingsError} />
                      ))}
                    </div>
                  </section>
                )}
                {filter !== 'active' && (
                  <section className="ch-qf-sec" aria-labelledby="ch-qf-concluded">
                    <h2 id="ch-qf-concluded">Concluded</h2>
                    {concluded.length ? (
                      <div className="ch-qf-grid">
                        {concluded.map((i) => (
                          <Card key={i.id} item={i} standingsError={data.standingsError} />
                        ))}
                      </div>
                    ) : (
                      <div className="ch-qf-empty ch-sheet">
                        <EmptyState compact code="CH-09303" icon={Flag} title="No concluded qualifiers yet." body="Qualifiers move here once they’re completed." />
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </SectionBoundary>
        </>
      )}
    </main>
  );
}

function Mine({ item }: { item: ChQListItem }) {
  if (!item.mine) return null;
  if (!item.mine.entered) return <span className="ch-qf-mine is-out">You aren’t entered</span>;
  if (!item.mine.played) return <span className="ch-qf-mine">You’re entered · no rounds in yet</span>;
  return (
    <span className="ch-qf-mine">
      You’re {item.mine.position} · {formatToPar(item.mine.toPar)} · {item.mine.played} of {item.numRounds} {item.numRounds === 1 ? 'round' : 'rounds'}
    </span>
  );
}

function Hero({ item, standingsError }: { item: ChQListItem; standingsError: boolean }) {
  const live = item.status === 'in_progress' && !standingsError && item.leaders.length > 0;
  return (
    <Link href={detailHref(item.id)} className="ch-qf-hero" onClick={() => chTrail('qualifiers open', { from: 'hero' })}>
      <div className="ch-qf-hero__main">
        <StatusPill status={item.status} />
        <h2>{item.name}</h2>
        {item.description && <p>{item.description}</p>}
        <Meta startDate={item.startDate} endDate={item.endDate} squad={item.squad} course={item.course} />
        <Mine item={item} />
        <span className="ch-qf-cta">
          {ctaLabel(item.status)}
          <Icon icon={ArrowRight} size={16} />
        </span>
      </div>
      {live && (
        <div className="ch-qf-lead ch-well-soft">
          <div className="ch-qf-lead__h ch-num">
            <span>Leaders</span>
            <span>
              {item.submitted} of {item.entrants * item.numRounds} rounds in
            </span>
          </div>
          {item.leaders.map((r, i) => (
            <div key={r.playerId}>
              {i === item.topScore && i > 0 && (
                <div className="ch-qf-line ch-qf-line--s">
                  <span>Top-score line</span>
                </div>
              )}
              <div className="ch-qf-lead__r">
                <span className="ch-qf-pos">{r.position}</span>
                <span className="ch-qf-lead__n">{r.name}</span>
                <span className="ch-qf-lead__th">
                  {r.played}/{item.numRounds}
                </span>
                <ToPar value={r.toPar} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

function Card({ item, standingsError }: { item: ChQListItem; standingsError: boolean }) {
  return (
    <Link href={detailHref(item.id)} className="ch-qf-card" onClick={() => chTrail('qualifiers open', { from: 'card' })}>
      <div className="ch-qf-card__h">
        <div>
          <h3>{item.name}</h3>
          {item.description && <p>{item.description}</p>}
        </div>
        <StatusPill status={item.status} />
      </div>
      <Meta startDate={item.startDate} endDate={item.endDate} squad={item.squad} course={item.course} />
      {!standingsError && <Mine item={item} />}
      <span className="ch-qf-cta is-quiet">
        {ctaLabel(item.status)}
        <Icon icon={ArrowRight} size={15} />
      </span>
    </Link>
  );
}
