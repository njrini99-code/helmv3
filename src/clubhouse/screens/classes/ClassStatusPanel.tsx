'use client';

import { BookOpen, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { refetchMyClassDay, useMyClassDay } from '../../lib/use-class-day';
import { classLabel } from '../../data/class-status';
import { haptic } from '../../lib/haptics';
import { normalise, useAction } from '../../lib/use-action';
import { useChClock } from '../../lib/use-clock';
import { Button } from '../../ui/Button';
import { ClassStatusLine } from '../../ui/ClassStatusLine';
import { ClassStatusRow } from '../../ui/ClassStatusRow';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { NoClassTodaySheet, type NoClassChoice } from './NoClassTodaySheet';
import { coachesSee, panelNotices, panelTop } from './panel-model';
import type { ChClassStatusWrites } from './class-status-writes';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: the player's Class status panel, at the top of Classes. What they are doing now, what coaches
 * see (the exact row a coach reads: same payload, same text function), the sharing switch, "No class today", and the
 * quiet notices (classes with no term, classes that cannot be used, calendar times that disagree). Players see exactly
 * what coaches see before anything is held.
 *
 * A card (--ch-radius-card, a full hairline ring, no left edge, no tint). Loading draws the panel with the top line
 * empty and a fixed height; an error says so with Try again; an RPC that is not there yet (the migrations are held), or a
 * player with no team, draws nothing. The caller draws it only with `class_awareness_v1` on.
 */
export function ClassStatusPanel({
  classes,
  writes,
  onTagged,
  onResync,
  onFix,
}: {
  classes: ReadonlyArray<{ id: string; code: string; name: string }>;
  writes: ChClassStatusWrites;
  /** The classes with no term now carry this one. */
  onTagged: (term: string) => void;
  onResync: (classId: string) => void;
  onFix: (classId: string) => void;
}) {
  const { day, status, now, refetch } = useMyClassDay();
  const clock = useChClock();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);
  const opts = useMemo(() => (day ? { clock, teamTz: day.teamTimeZone, classTz: day.classTimeZone } : null), [clock, day]);

  const share = useAction('classes.share', (on: boolean) => writes.setShare(on), (on: boolean) => ({
    done: '',
    failed: on ? 'Couldn’t share your class status' : 'Couldn’t stop sharing your class status',
    hint: 'Nothing was changed. Try again.',
    code: 'CH-12070',
  }));
  const noClass = useAction(
    'classes.noClass',
    async (choice: NoClassChoice) => {
      if (!day) return { success: false, error: 'not loaded' };
      return writes.markNoClass({ on: day.on, classId: choice.classId });
    },
    () => ({ done: '', failed: 'Couldn’t mark no class', hint: 'Nothing was changed. Try again.', code: 'CH-12071' }),
  );
  const undoNoClass = useAction('classes.noClassUndo', (ids: string[]) => writes.undoNoClass(ids), { done: '', failed: 'Couldn’t undo', hint: 'You are still marked as having no class. Try again.', code: 'CH-12072' });
  const tag = useAction('classes.tag', (term: string) => writes.tagUntagged(term), { done: '', failed: 'Couldn’t tag your classes', hint: 'Nothing was changed. Try again.', code: 'CH-12073' });

  if (!day || !opts || now == null) {
    if (status === 'error') {
      return (
        <section className="ch-ca-panel" aria-label="Class status" data-ch-code="CH-12270">
          <p className="ch-ca-panel__state">Class status didn’t load.</p>
          <Button size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </section>
      );
    }
    // Loading: nothing yet. An RPC that is not there, or a player with no team, also draws nothing.
    return status === 'loading' || status === 'idle' ? <section className="ch-ca-panel is-loading" aria-label="Class status" aria-busy="true" /> : null;
  }

  const top = panelTop(day, now, opts);
  const see = coachesSee(day, now, opts);
  const shown = override ?? day.settings.shareStatus;
  const notices = panelNotices(day, classes);

  const flip = async (next: boolean) => {
    setOverride(next);
    const r = await share.run(next);
    if (!r.success) {
      setOverride(null);
      return;
    }
    await refetchMyClassDay();
    setOverride(null);
    if (!next) {
      toast({
        title: 'Coaches no longer see when you’re in class',
        action: {
          label: 'Undo',
          run: () => {
            setOverride(true);
            void share.run(true).then(async (u) => {
              if (u.success) await refetchMyClassDay();
              setOverride(null);
            });
          },
        },
      });
    }
  };

  const mark = async (choice: NoClassChoice) => {
    const r = await noClass.run(choice);
    if (!r.success) return;
    haptic('success');
    setSheet(false);
    await refetchMyClassDay();
    const ids = (normalise(r).data as { ids?: string[] } | undefined)?.ids ?? [];
    toast({
      title: choice.classId ? `No class today for ${choice.label}` : 'No classes today',
      action: {
        label: 'Undo',
        run: () => {
          void undoNoClass.run(ids).then((u) => {
            if (u.success) void refetchMyClassDay();
          });
        },
      },
    });
  };

  return (
    <section className="ch-ca-panel" aria-labelledby="ch-ca-panel-h" data-ch-code="CH-12870">
      <h2 id="ch-ca-panel-h">Class status</h2>

      <div className="ch-ca-panel__top">
        <BookOpen size={14} aria-hidden="true" />
        <div>
          <p>{top.text}</p>
          {top.detail && <span>{top.detail}</span>}
        </div>
      </div>

      <div className="ch-ca-panel__sec">
        <h3>Coaches see</h3>
        <ClassStatusRow
          name={see.name}
          avatarId={day.player?.playerId ?? 'me'}
          line={see.text && see.status ? <ClassStatusLine kind={see.status.kind} text={see.text} /> : <span className="ch-ca-panel__none">No class status</span>}
          meta={see.status && (see.status.kind === 'in_class' || see.status.kind === 'exam' || see.status.kind === 'soon') ? classLabel(see.status.island.blocks[0]?.label ?? '') : null}
          label={`Coaches see ${see.name}: ${see.text ?? 'no class status'}`}
        />
      </div>

      <div className="ch-ca-panel__sec">
        <div className="ch-ca-panel__row">
          <div>
            <p>Share class status with coaches</p>
            <span>
              Coaches see the line above. Your classes, with their times and rooms, are on the team calendar, which your coaches and teammates can see.
            </span>
          </div>
          <Switch checked={shown} onChange={(on) => void flip(on)} label="Share class status with coaches" hideLabel busy={share.pending} />
        </div>
      </div>

      {day.term && (
        <button type="button" className="ch-ca-panel__link" onClick={() => setSheet(true)}>
          <span>No class today</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}

      {notices.length > 0 && (
        <ul className="ch-ca-panel__notices">
          {notices.map((n) => (
            <li key={n.kind === 'untagged' ? 'untagged' : `${n.kind}:${n.classId}`}>
              <span>{n.text}</span>
              <Button
                size="sm"
                variant="ghost"
                busy={n.kind === 'untagged' && tag.pending}
                onClick={() => {
                  if (n.kind === 'untagged') {
                    const term = day.term!.label;
                    void tag.run(term).then(async (r) => {
                      if (!r.success) return;
                      onTagged(term);
                      await refetchMyClassDay();
                    });
                  } else if (n.kind === 'calendar_mismatch') onResync(n.classId);
                  else onFix(n.classId);
                }}
              >
                {n.action}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <NoClassTodaySheet open={sheet} onClose={() => setSheet(false)} day={day} now={now} opts={opts} pending={noClass.pending} onMark={(c) => void mark(c)} />
    </section>
  );
}
