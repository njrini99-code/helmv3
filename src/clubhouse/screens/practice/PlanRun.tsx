'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { publishPracticePlan } from '@/app/golf/actions/practice-publish';
import { savePracticePlan } from '@/app/golf/actions/practice-plans';
import { pathFor, type PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { formatWith } from '../../lib/dates';
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

/**
 * The Run card (N-00 4.12), a coach's during practice: where each group is now and next, and two buttons that move the
 * rest of practice. A move saves and republishes in one step; telling players is off by default, because players
 * watching the page see it update.
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
    return { id: g.id, name: g.name, now: at >= 0 ? stops[at] : null, next: at >= 0 ? stops[at + 1] : null };
  });
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
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <b>{r.name}</b>
            <span>{r.now ? `Now: ${r.now.place}, until ${clock(r.now.end)}` : 'Done'}</span>
            {r.next && <small>Next: {r.next.place}, {clock(r.next.start)}</small>}
          </li>
        ))}
      </ul>
      <div className="ch-prc-run__a">
        <Button onClick={() => setMoving(-5)}>5 min earlier</Button>
        <Button onClick={() => setMoving(5)}>Shift the rest 5 min later</Button>
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
