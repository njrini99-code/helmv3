'use client';

import Link from 'next/link';
import { ArrowRight, Flag, Medal, Play, Plus, Search } from 'lucide-react';
import { useMemo, type MouseEvent } from 'react';
import type { ChQList, ChQListItem } from '../../data/qualifiers';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { useChSessionState } from '../../lib/session-state';
import { useRefresh } from '../../lib/use-refresh';
import { chTrail } from '../../lib/track';
import { formatToPar } from '../../lib/format';
import { PhoneTop } from '../../shell/phone-chrome';
import { ctaLabel, endedLive, listLede } from './model';
import { Meta, Pos, StatusPill, ToParPlate } from './parts';
import { isPlainClick, noteOpenedFromList } from './return-state';
import { playRoundHref } from './RoundsShowcase';
import '../../styles/qualifiers.css';
import { SerifText } from '../../ui/SerifText';
import { usePressPrefetch } from '../../shell/use-prefetch-tabs';

type Filter = 'all' | 'active' | 'concluded';
const isActive = (i: ChQListItem) => i.status !== 'completed';
const LIST = '/golf/dashboard/qualifiers';
const detailHref = (id: string) => `${LIST}/${id}`;
/** Opening a qualifier leaves a note, so its Back steps back to the list as it is (return-state.ts); a new-tab click leaves none. */
const opened = (id: string, from: 'hero' | 'card') => (e: MouseEvent) => {
  chTrail('qualifiers open', { from });
  if (isPlainClick(e)) noteOpenedFromList(id);
};

/** Qualifiers list, coach and player. `mine` is a player's own entries (/my-qualifiers). */
export function QualifiersList({ data }: { data: ChQList }) {
  const { refresh, refreshing } = useRefresh();
  const coach = data.role === 'coach';
  // A player's own list is only as good as the entries read: without it nothing says who they are entered in.
  const mineUnknown = data.mode === 'mine' && !!data.entriesError;
  // The filter and the search come back when the coach returns to the list (Back from a qualifier, the sidebar, a tab): the shell keeps
  // them for this tab under the page and the team (`useChSessionState`), and the list's place comes back through RouteFrame (owner rule 8).
  const [filter, setFilter] = useChSessionState<Filter>('filter', 'all');
  const [q, setQ] = useChSessionState('q', '');

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
  const lede = listLede(coach, data.mode);

  return (
    <main className="ch-qf ch-qf--list" data-canopy="">
      {/* Phone (board 01): Qualifiers opens from More (D-66), so the top bar goes back there. */}
      <PhoneTop heading={false} title={data.mode === 'mine' ? 'My qualifiers' : 'Qualifiers'} start />
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          {/* The filter pills below carry the active and concluded counts, so the eyebrow is the page's name alone (no second copy
              of the counts, and no dashes when they failed to load). The phone's top bar already names the page, so it has none. */}
          <span className="ch-qf-eyebrow ch-num is-bare">
            <span className="ch-qf-eyebrow__k">{data.mode === 'mine' ? 'My qualifiers' : 'Qualifiers'}</span>
          </span>
          <h1>{title}</h1>
          <p>{lede}</p>
        </div>
        {/* One primary per screen: with no qualifiers the page empty state (CH-09301) carries Create qualifier. */}
        {coach && (data.listError || data.items.length > 0) && (
          <div className="ch-qf-head__act">
            <Button variant="primary" leftIcon={Plus} href={`${LIST}/new`}>
              New qualifier
            </Button>
          </div>
        )}
      </header>

      {data.listError ? (
        <InlineNotice
          code="CH-09201"
          title="The qualifiers didn’t load"
          body="Nothing has changed. Try again."
          onRetry={refresh}
          retrying={refreshing}
        />
      ) : mineUnknown ? (
        <InlineNotice
          code="CH-09222"
          title="Your qualifiers didn’t load"
          body="Which qualifiers you’re entered in didn’t load, so none are shown rather than a wrong list. Nothing has changed. Try again."
          onRetry={refresh}
          retrying={refreshing}
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
                  New qualifier
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <div className="ch-qf-tools">
            {/* CH-09601: a status pill, a card or the hero answers a press with a deeper tint over the press beat, never a
                scale (the shell's CH-1606): pills and the phone's live card darken, the Ledger's rows take the row press
                tint, and the desktop hero's title deepens. */}
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
            <SearchField className="ch-qf-search" value={q} onChange={setQ} placeholder="Search qualifiers" label="Search qualifiers" />
          </div>

          {data.standingsError && (
            <InlineNotice
              code="CH-09202"
              title="Standings didn’t load"
              body="The qualifiers are listed, but entrants, rounds in and leaders are missing until they load."
              onRetry={refresh}
              retrying={refreshing}
            />
          )}

          <SectionBoundary surface="qualifiers.list" label="The qualifiers" code="CH-09211">
            {!active.length && !concluded.length ? (
              <div className="ch-qf-empty ch-sheet">
                <EmptyState
                  kind="filtered"
                  compact
                  code="CH-09302"
                  icon={Search}
                  title="No qualifiers match your filters"
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
                {/* The active qualifier is the page's focus (owner, 2026-10-16): its own raised sheet under its own head. */}
                {hero && (
                  <section className="ch-qf-sec is-focus" aria-labelledby="ch-qf-now">
                    <h2 id="ch-qf-now">Active</h2>
                    <Hero item={hero} standingsError={data.standingsError} today={data.today} />
                    <PlayNext item={hero} standingsError={data.standingsError} today={data.today} />
                  </section>
                )}
                {rest.length > 0 && (
                  <section className="ch-qf-sec" aria-labelledby="ch-qf-active">
                    {/* P009-D14: the section holds upcoming qualifiers as well as live ones; under the Active hero, the rest. */}
                    <h2 id="ch-qf-active">{hero ? 'Also active' : 'Upcoming and live'}</h2>
                    <div className="ch-qf-grid is-ledger">
                      {rest.map((i) => (
                        <Card key={i.id} item={i} standingsError={data.standingsError} today={data.today} />
                      ))}
                    </div>
                  </section>
                )}
                {filter !== 'active' && (
                  <section className="ch-qf-sec is-done" aria-labelledby="ch-qf-concluded">
                    <h2 id="ch-qf-concluded">Concluded</h2>
                    {concluded.length ? (
                      <div className="ch-qf-grid is-ledger">
                        {concluded.map((i) => (
                          <Card key={i.id} item={i} standingsError={data.standingsError} today={data.today} />
                        ))}
                      </div>
                    ) : (
                      <div className="ch-qf-empty ch-sheet">
                        <EmptyState compact code="CH-09303" icon={Flag} title="No concluded qualifiers yet" body="Qualifiers move here once they’re completed." />
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

/** A standing as the Hub says it: "3" reads "3rd", a tie "T3" reads "tied 3rd". */
const placeOf = (position: string | null) => {
  const m = /^(T?)(\d+)$/.exec(position ?? '');
  if (!m) return position;
  const n = Number(m[2]);
  return `${m[1] ? 'tied ' : ''}${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
};

function Mine({ item }: { item: ChQListItem }) {
  if (!item.mine) return null;
  if (!item.mine.entered) return <span className="ch-qf-mine is-out">You aren’t entered</span>;
  if (!item.mine.played) return <span className="ch-qf-mine">You’re entered · no rounds in yet</span>;
  // Once the coach confirms the squad, the line says whether you made it (wave 7); before that, or with the read failed, the standing.
  if (item.mine.squad === true) {
    return (
      <span className="ch-qf-mine">
        You made the squad · {placeOf(item.mine.position)} · {formatToPar(item.mine.toPar)}
      </span>
    );
  }
  if (item.mine.squad === false) {
    return (
      <span className="ch-qf-mine">
        You’re {placeOf(item.mine.position)} · {formatToPar(item.mine.toPar)} · not selected
      </span>
    );
  }
  return (
    <span className="ch-qf-mine">
      You’re {placeOf(item.mine.position)} · {formatToPar(item.mine.toPar)} · {item.mine.played} of {item.numRounds} {item.numRounds === 1 ? 'round' : 'rounds'}
    </span>
  );
}

/**
 * A live qualifier's next round for you, as its own link under the card (the card is one link already): round setup with this
 * qualifier chosen. Not past the qualifier's last day, and not before round setup is rebuilt for players.
 */
function PlayNext({ item, standingsError, today }: { item: ChQListItem; standingsError: boolean; today?: string }) {
  const next = item.mine?.next;
  const href = playRoundHref(item.id);
  if (!next || !href || standingsError || endedOf(item, standingsError, today)) return null;
  return (
    <div className="ch-qf-play" data-ch-code="CH-09906">
      <Button size="sm" variant="secondary" leftIcon={Play} href={href}>
        {[`Play round ${next.round}`, next.course].filter(Boolean).join(' · ')}
      </Button>
    </div>
  );
}

/** P009-D3: a live qualifier past its last day; its outstanding rounds are unknown when the standings didn't load. */
const endedOf = (item: ChQListItem, standingsError: boolean, today: string | undefined) =>
  endedLive({ status: item.status, endDate: item.endDate, today, entrants: item.entrants, numRounds: item.numRounds, submitted: standingsError ? null : item.submitted });

function Hero({ item, standingsError, today }: { item: ChQListItem; standingsError: boolean; today?: string }) {
  const press = usePressPrefetch();
  const live = item.status === 'in_progress' && !standingsError && item.leaders.length > 0;
  const ended = endedOf(item, standingsError, today);
  return (
    <Link href={detailHref(item.id)} className="ch-qf-hero" onClick={opened(item.id, 'hero')} {...press(detailHref(item.id))}>
      <div className="ch-qf-hero__main">
        <StatusPill status={item.status} ended={ended} />
        <h2>
          <SerifText text={item.name} />
        </h2>
        {item.description && <p>{item.description}</p>}
        <Meta startDate={item.startDate} endDate={item.endDate} squad={item.squad} course={item.course} today={today} />
        {!standingsError && <Mine item={item} />}
        <span className="ch-qf-cta">
          {ctaLabel(item.status)}
          <Icon icon={ArrowRight} size={16} />
        </span>
      </div>
      {live && (
        <div className="ch-qf-lead ch-scoreboard">
          <div className="ch-qf-lead__h ch-num">
            {/* This qualifier's standings, its top few (only the active qualifier shows a board). */}
            <span>Standings · top {item.leaders.length}</span>
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
              {/* P009-A1: the leaders hang on plates, as on the board, with their movement since the previous round. */}
              <div className={'ch-qf-lead__r' + (r.isYou ? ' is-me' : '')}>
                <Pos position={r.position} tied={r.position.startsWith('T')} move={r.move} />
                <span className="ch-qf-lead__n">
                  {r.name}
                  {r.isYou && <span className="ch-qf-you">You</span>}
                </span>
                <span className="ch-qf-lead__th">
                  {r.played}/{item.numRounds}
                </span>
                <ToParPlate value={r.toPar} size="card" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

function Card({ item, standingsError, today }: { item: ChQListItem; standingsError: boolean; today?: string }) {
  const press = usePressPrefetch();
  return (
    <Link href={detailHref(item.id)} className="ch-qf-card" onClick={opened(item.id, 'card')} {...press(detailHref(item.id))}>
      <div className="ch-qf-card__h">
        <div>
          <h3>{item.name}</h3>
          {item.description && <p>{item.description}</p>}
        </div>
        <StatusPill status={item.status} ended={endedOf(item, standingsError, today)} />
      </div>
      <Meta startDate={item.startDate} endDate={item.endDate} squad={item.squad} course={item.course} today={today} />
      {!standingsError && <Mine item={item} />}
      <span className="ch-qf-cta is-quiet">
        {ctaLabel(item.status)}
        <Icon icon={ArrowRight} size={15} />
      </span>
    </Link>
  );
}
