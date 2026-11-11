'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { publishPracticePlan } from '@/app/golf/actions/practice-publish';
import { savePracticePlan } from '@/app/golf/actions/practice-plans';
import { pathFor, type PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { formatWith } from '../../lib/dates';
import { plural } from '../../lib/plural';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { stepLength } from './builder/builder-model';

const QUARTER = 15 * 60_000;

/** From 15 minutes before the start until the end. */
export function runWindowOpen(now: number, start: Date, totalMin: number): boolean {
  return now >= start.getTime() - QUARTER && now <= start.getTime() + totalMin * 60_000;
}

/** Which block is under way, or the first one before it starts. */
export function currentBlockIndex(body: PlanBodyV2, start: Date, now: number): number {
  let at = start.getTime();
  const blocks = body.variants.main.blocks;
  for (let i = 0; i < blocks.length; i++) {
    at += blocks[i]!.len * 60_000;
    if (now < at) return i;
  }
  return Math.max(0, blocks.length - 1);
}

/** The shift itself: the block under way grows or shrinks by 5, which moves everything after it. */
export function shiftBody(body: PlanBodyV2, index: number, by: -5 | 5): PlanBodyV2 {
  const blocks = body.variants.main.blocks.map((b, i) => (i === index ? stepLength(b, by) : b));
  return { ...body, variants: { ...body.variants, main: { blocks } } };
}

/** Where a block is, in a word or two: its place, its stations, or its holes. */
function blockWhere(b: PlanBodyV2['variants']['main']['blocks'][number]): string {
  if (b.kind === 'stations') return plural(b.stations.length, 'station');
  if (b.kind === 'course') return `Holes ${b.holeFrom} to ${b.holeTo}`;
  return b.place;
}

/** What is left after the block under way: each block's start, name, where it is and how long. */
export function restOfPractice(body: PlanBodyV2, start: Date, index: number, clock: (d: Date) => string): Array<{ id: string; time: string; title: string; line: string }> {
  const blocks = body.variants.main.blocks;
  let at = start.getTime() + blocks.slice(0, index + 1).reduce((n, b) => n + b.len, 0) * 60_000;
  return blocks.slice(index + 1).map((b) => {
    // A block named for where it is ("Holes 1 to 6") says so once.
    const where = blockWhere(b);
    const row = { id: b.id, time: clock(new Date(at)), title: b.title, line: [where === b.title ? '' : where, `${b.len} min`].filter(Boolean).join(' · ') };
    at += b.len * 60_000;
    return row;
  });
}

/**
 * Run (N-00 4.12), a coach's during practice: where each group is now and next, two buttons that move the rest of
 * practice, and the rest of the day beside it (under it on a phone). A move saves and republishes in one step; telling
 * players is off by default, because players watching the page see it update.
 */
export function PlanRun({ planId, title, version, body, start, zone, serverNow }: { planId: string; title: string; version: number; body: PlanBodyV2; start: Date; zone: string; serverNow: number }) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(serverNow);
  const [moving, setMoving] = useState<-5 | 5 | null>(null);
  const [tell, setTell] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const total = body.variants.main.blocks.reduce((n, b) => n + b.len, 0);
  if (!runWindowOpen(now, start, total)) return null;
  const clock = (d: Date) => formatWith(d, { hour: 'numeric', minute: '2-digit', timeZone: zone });
  const groups = body.groups.filter((g) => g.players.length > 0);
  const rows = (groups.length ? groups : [{ id: 'all', name: 'Everyone', players: body.players.slice(0, 1) }]).map((g) => {
    const stops = g.players[0] ? pathFor(body, g.players[0], start) : [];
    const at = stops.findIndex((s) => now < s.end.getTime());
    return { id: g.id, letter: groups.length ? 'ABCDEF'[body.groups.indexOf(g as (typeof body.groups)[number])] : null, name: g.name, now: at >= 0 ? stops[at] : null, next: at >= 0 ? stops[at + 1] : null };
  });
  const blocks = body.variants.main.blocks;
  const index = currentBlockIndex(body, start, now);
  const startsAt = start.getTime() + blocks.slice(0, index).reduce((n, b) => n + b.len, 0) * 60_000;
  const nextEnd = Math.min(...rows.flatMap((r) => (r.now ? [r.now.end.getTime()] : [])));
  const inMin = Number.isFinite(nextEnd) ? Math.max(1, Math.ceil((nextEnd - now) / 60_000)) : null;
  // The column's clock, as the sheet prints it: no AM or PM. The end of practice says the period once.
  const rest = restOfPractice(body, start, index, (d) => clock(d).replace(/\s?[AP]M$/, ''));
  const endsAt = clock(new Date(start.getTime() + total * 60_000));
  const move = async () => {
    if (!moving) return;
    setBusy(true);
    const next = shiftBody(body, currentBlockIndex(body, start, now), moving);
    const saved = await savePracticePlan({ planId, expectedVersion: version, title, step: 'blocks', body: next }).catch(() => ({ success: false as const, error: 'That didn’t move.' }));
    if (!saved.success) {
      setBusy(false);
      setMoving(null);
      return toast({ tone: 'error', title: saved.error ?? 'That didn’t move.' });
    }
    const published = await publishPracticePlan({ planId, expectedVersion: saved.version, notify: tell ? 'now' : 'none' }).catch(() => ({ success: false as const, error: 'Saved, but players still see the old times.' }));
    setBusy(false);
    setMoving(null);
    if (!published.success) return toast({ tone: 'error', title: published.error ?? 'Saved, but players still see the old times.' });
    router.refresh();
  };
  return (
    <section className="ch-prc-run" aria-label="Run practice">
      <div className="ch-prc-run__card">
        <header className="ch-prc-run__h">
          <h2>Now</h2>
          {inMin !== null && now >= start.getTime() && <span className="ch-num">{blocks[index]?.kind === 'stations' ? 'Rotate' : 'Next'} in {inMin} min</span>}
        </header>
        <div className="ch-prc-run__now">
          <b>{blocks[index]?.title}</b>
          <span className="ch-num">
            {clock(new Date(startsAt))} to {clock(new Date(startsAt + (blocks[index]?.len ?? 0) * 60_000))}
          </span>
        </div>
        <ul className="ch-prc-run__groups">
          {rows.map((r) => (
            <li key={r.id}>
              {r.letter ? <i className={`ch-prc-disc g-${r.letter}`} role="img" aria-label={`Group ${r.letter}`}>{r.letter}</i> : <span />}
              <span>
                <b>{r.now?.place ?? 'Done'}</b>
                {r.now && <small className="ch-num">Now, until {clock(r.now.end)}</small>}
                {!r.now && <small>For today</small>}
              </span>
              <span>
                {r.next && (
                  <>
                    <b>{r.next.place}</b>
                    {/* The next stop starts as this one ends: the clock is said once, on Now. A gap between them is the only time Next has its own. */}
                    <small className="ch-num">{r.now && r.next.start.getTime() !== r.now.end.getTime() ? `Next, ${clock(r.next.start)}` : 'Next'}</small>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="ch-prc-run__a" role="group" aria-label="Shift the rest of practice">
          <span>Shift the rest</span>
          <Button onClick={() => setMoving(-5)} aria={{ label: '5 min earlier' }}>
            5 min earlier
          </Button>
          <Button onClick={() => setMoving(5)} aria={{ label: 'Shift the rest 5 min later' }}>
            5 min later
          </Button>
        </div>
      </div>
      <div className="ch-prc-run__rest" role="group" aria-labelledby="ch-prc-run-rest">
        <header className="ch-prc-run__h">
          <h2 id="ch-prc-run-rest">Up next</h2>
          <span className="ch-num">Ends {endsAt}</span>
        </header>
        {rest.length > 0 ? (
          <ol className="ch-prc-next__rows">
            {rest.map((r) => (
              <li key={r.id}>
                <span className="ch-num">{r.time}</span>
                <b>{r.title}</b>
                <span className="ch-num">{r.line}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ch-prc-none">This is the last block.</p>
        )}
      </div>
      <Modal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={`Move the rest of practice 5 min ${moving === -5 ? 'earlier' : 'later'}?`}
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void move()}>
              Move
            </Button>
          </>
        }
      >
        <Switch label="Tell players" checked={tell} onChange={setTell} />
      </Modal>
    </section>
  );
}
