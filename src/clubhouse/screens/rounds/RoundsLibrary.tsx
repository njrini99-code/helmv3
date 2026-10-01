'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flag, Plus, Trash2, TriangleAlert } from 'lucide-react';
import type { ChLibraryRound, ChRoundsLibrary, ChUnfinishedRound } from '../../data/rounds-shape';
import { formatFixed } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { EmptyState } from '../../ui/States';
import { monthLabel, RoundRow, SeasonCard, shortDay, UnfinishedCard } from './parts';
import { LIVE_ROUNDS_WRITES, type ChRoundsWrites } from './writes';

type Group = 'month' | 'course';

/** Where each control goes. A target that isn't rebuilt yet isn't drawn (nav.rebuiltHref), never a dead button. */
export const roundsLinks = {
  newRound: () => rebuiltHref('/golf/dashboard/rounds/new', 'player'),
  continueRound: (id: string) => rebuiltHref(`/golf/dashboard/rounds/continue/${id}`, 'player'),
  review: (id: string) => rebuiltHref(`/golf/dashboard/rounds/${id}`, 'player'),
};

/** Groups in display order: months newest first, or courses by their newest round. */
export function groupRounds(list: ChLibraryRound[], by: Group, q: string): Array<{ key: string; rounds: ChLibraryRound[] }> {
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((r) => r.course.toLowerCase().includes(needle)) : list;
  const groups = new Map<string, ChLibraryRound[]>();
  for (const r of shown) {
    const k = by === 'month' ? monthLabel(r.date) : r.course;
    const xs = groups.get(k) ?? [];
    xs.push(r);
    groups.set(k, xs);
  }
  return [...groups].map(([key, rounds]) => ({ key, rounds }));
}

/**
 * Rounds (P011) library, for the player (design/handoff/Player - Rounds.html,
 * rounds-flow.jsx `Library`; spec docs/clubhouse/phone/rounds.md). The round
 * in progress, the season's scoring, then every posted round by month or by
 * course.
 */
export function RoundsLibrary({ data, playerId, writes = LIVE_ROUNDS_WRITES }: { data: ChRoundsLibrary; playerId: string; writes?: ChRoundsWrites }) {
  const phone = useChPhone();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group>('month');
  const [unfinished, setUnfinished] = useState(data.unfinished.list);
  const [asking, setAsking] = useState<ChUnfinishedRound | null>(null);

  const list = data.rounds.list;
  const groups = useMemo(() => groupRounds(list, group, q), [list, group, q]);
  const newHref = roundsLinks.newRound();
  const counted = data.season.rounds;
  const refresh = () => router.refresh();

  // The card leaves on success wherever the call came from, the toast's Retry included.
  const discardRound = async (r: ChUnfinishedRound) => {
    const res = await writes.discard(r.id, playerId);
    if (normalise(res).success) {
      setUnfinished((xs) => xs.filter((x) => x.id !== r.id));
      setAsking((a) => (a?.id === r.id ? null : a));
    }
    return res;
  };
  const discard = useAction('rounds.discard', discardRound, (r: ChUnfinishedRound) => ({
    done: 'Round discarded',
    failed: `Couldn't discard the round at ${r.course}`,
    hint: 'It is still saved. Try again, or continue it instead.',
    code: 'CH-11001',
  }));
  // CH-11701: the warning comes before the question.
  const askDiscard = (r: ChUnfinishedRound) => {
    haptic('warning');
    setAsking(r);
  };
  const confirmDiscard = async () => {
    const r = asking;
    if (!r) return;
    await discard.run(r);
  };

  const nothing = !data.rounds.error && list.length === 0 && unfinished.length === 0 && !data.unfinished.error;
  const [current, ...more] = unfinished;

  return (
    <main className={'ch-rd' + (phone ? ' is-phone' : '')} aria-labelledby="ch-rd-title">
      {phone && <PhoneTop start title="Rounds" />}
      <header className="ch-rd-h">
        <div>
          <span className="ch-rd-k">{counted ? `Since August 1 · ${counted} counted ${counted === 1 ? 'round' : 'rounds'}` : 'Since August 1'}</span>
          <h1 id="ch-rd-title">Your rounds</h1>
        </div>
        {newHref && !nothing && (
          <Button variant="primary" leftIcon={Plus} href={newHref}>
            New round
          </Button>
        )}
      </header>

      {nothing ? (
        <EmptyState
          size="page"
          code="CH-11301"
          icon={Flag}
          title="No rounds yet"
          body="Track your first round shot by shot. Your scores, stats and every round you post show up here."
          action={
            newHref ? (
              <Button variant="primary" leftIcon={Plus} href={newHref}>
                Start a round
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="ch-rd-hero">
            <SectionBoundary surface="rounds.unfinished" label="Your round in progress" code="CH-11203">
              <UnfinishedCard
                round={current ?? null}
                error={data.unfinished.error}
                todayIso={data.todayIso}
                last={list[0] ?? null}
                continueHref={current ? roundsLinks.continueRound(current.id) : null}
                startHref={newHref}
                onRetry={refresh}
                onDiscard={askDiscard}
              />
            </SectionBoundary>
            {data.rounds.error ? (
              <InlineNotice code="CH-11201" title="Your rounds didn't load" body="Nothing is lost. Your posted rounds are still saved; try again in a moment." onRetry={refresh} />
            ) : (
              <SectionBoundary surface="rounds.season" label="Season scoring" code="CH-11203">
                <SeasonCard season={data.season} phone={phone} />
              </SectionBoundary>
            )}
          </div>

          {more.length > 0 && (
            <section className="ch-rd-more" aria-labelledby="ch-rd-more-h">
              <h2 id="ch-rd-more-h">
                {more.length} more unfinished {more.length === 1 ? 'round' : 'rounds'}
              </h2>
              <ul>
                {more.map((r) => {
                  const href = roundsLinks.continueRound(r.id);
                  return (
                    <li key={r.id}>
                      <span>
                        <b>{r.course}</b>
                        <em className="ch-num">
                          {shortDay(r.date)} · {r.played.length ? `through ${r.played.length}` : 'not started'}
                        </em>
                      </span>
                      <button type="button" className="ch-rd-more__discard" onClick={() => askDiscard(r)} aria-label={`Discard the round at ${r.course}`}>
                        <Icon icon={Trash2} size={14} />
                      </button>
                      {href && (
                        <Link href={href} className="ch-rd-more__go" onClick={() => haptic('press')}>
                          {r.readyToSubmit ? 'Submit' : 'Continue'}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!data.rounds.error && list.length > 0 && (
            <SectionBoundary surface="rounds.book" label="Your rounds" code="CH-11203">
              <div className="ch-rd-tools">
                <SearchField value={q} onChange={setQ} placeholder="Search course…" label="Search rounds by course" />
                <Segmented
                  label="Group rounds"
                  size="sm"
                  value={group}
                  onChange={setGroup}
                  options={[
                    { value: 'month', label: 'By month' },
                    { value: 'course', label: 'By course' },
                  ]}
                />
              </div>
              {groups.length === 0 ? (
                <EmptyState code="CH-11303" compact title={`No rounds at “${q.trim()}”`} body="Check the spelling, or search part of the course name." />
              ) : (
                groups.map((g) => {
                  const scores = g.rounds.map((r) => r.score);
                  const full = g.rounds.filter((r) => r.holes === 18);
                  return (
                    <section key={g.key} className="ch-rd-grp" aria-label={g.key}>
                      <div className="ch-rd-grp__h">
                        <h3>{g.key}</h3>
                        <span className="ch-rd-grp__rule" />
                        <span className="ch-num">
                          {g.rounds.length} {g.rounds.length === 1 ? 'round' : 'rounds'}
                        </span>
                        {full.length > 0 && (
                          <span className="ch-num">
                            avg <b>{formatFixed(full.reduce((a, r) => a + r.score, 0) / full.length, 1)}</b>
                          </span>
                        )}
                        <span className="ch-num">
                          low <b>{Math.min(...scores)}</b>
                        </span>
                      </div>
                      <div className="ch-rd-book">
                        {g.rounds.map((r) => (
                          <RoundRow key={r.id} r={r} href={roundsLinks.review(r.id)} />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </SectionBoundary>
          )}
        </>
      )}

      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        icon={TriangleAlert}
        code="CH-11501"
        title="Discard this round?"
        description={asking ? `Every shot from ${asking.course} on ${shortDay(asking.date)} is deleted. This can't be undone.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={discard.pending} feel={null} onClick={() => void confirmDiscard()}>
              {discard.pending ? 'Discarding' : 'Discard round'}
            </Button>
          </>
        }
      />
    </main>
  );
}
