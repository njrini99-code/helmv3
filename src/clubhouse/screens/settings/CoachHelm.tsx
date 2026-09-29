'use client';

import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SIGNAL_CONTROL_RANGES, STATS_BENCHMARK_WINDOWS, THRESHOLD_RANGES, confidenceFloorForSensitivity } from '@/lib/coachhelm/constants';
import { ALERT_GROUPS, type CoachPhilosophy } from '@/lib/coachhelm/types';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { moveOrder, orderToPriorities, PRIORITY_LABEL, priorityOrder, type ChCoachHelmSettings, type ChSettingsData, type ChSettingsWrites, type PriorityKey } from './model';
import { Card, ReadFailed, Row, useInstantSave } from './parts';

type Phil = CoachPhilosophy & { id: string | null };

export function CoachHelmSection({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.coachhelm) return null;
  if (data.coachhelm.error) return <ReadFailed what="Your CoachHelm settings" onRetry={writes.refresh} />;
  return <CoachHelmBody initial={data.coachhelm.value} writes={writes} />;
}

/**
 * Philosophy saves run one at a time, in order: the first save creates the
 * row and later ones must use its id, and in-order writes mean an older
 * response can never land on top of a newer edit. Sliders wait 600ms after
 * the last move; everything else saves at once. A failed save puts that
 * field back and says so.
 */
function usePhilosophy(initial: Phil, writes: ChSettingsWrites) {
  const [p, setP] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const idRef = useRef(initial.id);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timers = useRef(new Map<string, number>());
  const inflight = useRef(0);
  // The value before a debounced run of slider moves, so a failure restores where the drag began.
  const snapshots = useRef(new Map<string, Partial<CoachPhilosophy>>());
  const current = useRef(p);
  current.current = p;
  const initialOrCurrent = (k: string) => (current.current as unknown as Record<string, unknown>)[k];
  const toast = useToast();

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  const send = (patch: Partial<CoachPhilosophy>, before: Partial<CoachPhilosophy>) => {
    inflight.current += 1;
    setStatus('saving');
    chTrail(`settings coachhelm ${Object.keys(patch).join(',')}`);
    queue.current = queue.current.then(async () => {
      let ok = false;
      let error: string | undefined;
      try {
        const r = await writes.savePhilosophy(idRef.current, patch);
        ok = !!(r.success || r.ok);
        error = r.error;
        if (ok && r.data?.id) idRef.current = r.data.id;
      } catch (err) {
        chReport(err, { surface: 'settings.coachhelm', action: 'savePhilosophy' });
      }
      inflight.current -= 1;
      if (ok) {
        haptic('commit');
        if (inflight.current === 0) setStatus('saved');
        return;
      }
      setP((x) => ({ ...x, ...before }));
      setStatus('failed');
      haptic('error');
      if (error) chReport(new Error(error), { surface: 'settings.coachhelm', action: 'savePhilosophy', severity: 'low' });
      toast({ tone: 'error', title: "Couldn't save that CoachHelm setting", body: "It's back where it was. Check your connection and try again." });
    });
  };

  const change = (patch: Partial<CoachPhilosophy>, opts: { debounce?: string } = {}) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, initialOrCurrent(k)])) as Partial<CoachPhilosophy>;
    setP((x) => ({ ...x, ...patch }));
    if (!opts.debounce) return send(patch, before);
    const t = timers.current;
    const prev = t.get(opts.debounce);
    if (prev) window.clearTimeout(prev);
    else snapshots.current.set(opts.debounce, before);
    t.set(
      opts.debounce,
      window.setTimeout(() => {
        t.delete(opts.debounce!);
        const snap = snapshots.current.get(opts.debounce!) ?? before;
        snapshots.current.delete(opts.debounce!);
        send(patch, snap);
      }, 600),
    );
  };
  return { p, change, status };
}

function CoachHelmBody({ initial, writes }: { initial: ChCoachHelmSettings; writes: ChSettingsWrites }) {
  const { p, change, status } = usePhilosophy(initial.philosophy, writes);
  const floor = confidenceFloorForSensitivity(p.alertSensitivity);
  const alertsOn = ALERT_GROUPS.reduce((n, g) => n + g.alerts.filter((a) => p[a.key as keyof CoachPhilosophy]).length, 0);
  const alertsTotal = ALERT_GROUPS.reduce((n, g) => n + g.alerts.length, 0);
  const statusText = status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'failed' ? "A change didn't save" : 'Changes save as you make them';

  return (
    <>
      <p className={'ch-set-autosave' + (status === 'failed' ? ' is-failed' : '')} aria-live="polite">
        {statusText}
      </p>
      <PowerCard initial={initial} writes={writes} />

      <Card id="set-priorities" title="What matters most" description="CoachHelm weighs player ratings and needs-attention flags in this order.">
        <Priorities p={p} onChange={(order) => change(orderToPriorities(order))} />
      </Card>

      <Card id="set-sensitivity" title="How readily CoachHelm speaks up" description="The preset sets a confidence floor. The thresholds are the numbers that trip each kind of alert.">
        <Row label="Alert sensitivity" help={`Needs at least ${Math.round(floor * 100)}% confidence.`}>
          <Segmented
            label="Alert sensitivity"
            size="sm"
            value={p.alertSensitivity}
            options={[
              { value: 'aggressive', label: 'More alerts' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'conservative', label: 'Fewer alerts' },
            ]}
            onChange={(v) => change({ alertSensitivity: v })}
          />
        </Row>
        <div className="ch-set-sliders">
          <Slider
            label="Decline threshold"
            description="Strokes gained lost over five rounds before a decline is flagged."
            value={p.declineThreshold}
            {...THRESHOLD_RANGES.declineThreshold}
            format={(v) => `${v.toFixed(1)} SG`}
            onChange={(v) => change({ declineThreshold: v }, { debounce: 'declineThreshold' })}
          />
          <Slider
            label="Pressure gap"
            description="Practice-to-tournament scoring gap that raises a mental-game alert."
            value={p.pressureGapThreshold}
            {...THRESHOLD_RANGES.pressureGapThreshold}
            format={(v) => `${v.toFixed(1)} strokes`}
            onChange={(v) => change({ pressureGapThreshold: v }, { debounce: 'pressureGapThreshold' })}
          />
          <Slider
            label="Bubble zone"
            description="Strokes-gained range around the qualifying cutoff that marks a player as on the bubble."
            value={p.bubbleZoneRange}
            {...THRESHOLD_RANGES.bubbleZoneRange}
            format={(v) => `${v.toFixed(1)} SG`}
            onChange={(v) => change({ bubbleZoneRange: v }, { debounce: 'bubbleZoneRange' })}
          />
        </div>
      </Card>

      <Card id="set-alerts" title="Alerts" description="The kinds of alert CoachHelm raises." aside={<span className="ch-set-count ch-num">{alertsOn} of {alertsTotal} on</span>}>
        {ALERT_GROUPS.map((g) => (
          <div key={g.title} className="ch-set-group">
            <div className="ch-set-sub">{g.title === 'Roster & Qualifying' ? 'Roster and qualifying' : g.title}</div>
            {g.alerts.map((a) => {
              const k = a.key as keyof CoachPhilosophy;
              const label = a.label.replace('Hot/cold', 'Hot and cold');
              return (
                <Row key={a.key} label={label}>
                  <Switch label={label} hideLabel checked={!!p[k]} onChange={(v) => change({ [k]: v } as Partial<CoachPhilosophy>)} />
                </Row>
              );
            })}
          </div>
        ))}
      </Card>

      <Card id="set-signal" title="Signal controls" description="How much evidence CoachHelm needs, and how alerts reach you.">
        <div className="ch-set-sliders">
          <Slider
            label="Minimum confidence"
            description={
              p.minInsightConfidence <= floor
                ? `Your sensitivity already requires ${Math.round(floor * 100)}%, so this only matters above that.`
                : `Above your sensitivity's ${Math.round(floor * 100)}% floor, so this is the number in effect.`
            }
            value={p.minInsightConfidence}
            {...SIGNAL_CONTROL_RANGES.minInsightConfidence}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => change({ minInsightConfidence: v }, { debounce: 'minInsightConfidence' })}
          />
          <Slider
            label="Minimum rounds"
            description="Rounds a player needs before CoachHelm says anything about them."
            value={p.minRoundsForSignal}
            {...SIGNAL_CONTROL_RANGES.minRoundsForSignal}
            format={(v) => `${v} ${v === 1 ? 'round' : 'rounds'}`}
            onChange={(v) => change({ minRoundsForSignal: v }, { debounce: 'minRoundsForSignal' })}
          />
        </div>
        <Row label="Alert delivery">
          <Segmented
            label="Alert delivery"
            size="sm"
            value={p.alertDigest}
            options={[
              { value: 'immediate', label: 'As they happen' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            onChange={(v) => change({ alertDigest: v })}
          />
        </Row>
      </Card>

      <Card id="set-windows" title="Analysis windows" description="How far back CoachHelm and Stats look.">
        <div className="ch-set-sliders">
          <Slider
            label="Hole ranking"
            description="Times a hole must be played before it can rank as toughest or easiest."
            value={p.minHolePlaysForRanking}
            {...SIGNAL_CONTROL_RANGES.minHolePlaysForRanking}
            format={(v) => `${v} plays`}
            onChange={(v) => change({ minHolePlaysForRanking: v }, { debounce: 'minHolePlaysForRanking' })}
          />
          <Slider
            label="Pattern lookback"
            description="The window CoachHelm mines for repeating patterns."
            value={p.patternLookbackDays}
            {...SIGNAL_CONTROL_RANGES.patternLookbackDays}
            format={(v) => `${v} days`}
            onChange={(v) => change({ patternLookbackDays: v }, { debounce: 'patternLookbackDays' })}
          />
        </div>
        <Row label="Stats comparison" help={`Stats compares the last ${p.statsBenchmarkWindowDays} days with the ${p.statsBenchmarkWindowDays} before them.`}>
          <Segmented
            label="Stats comparison window"
            size="sm"
            value={String(p.statsBenchmarkWindowDays)}
            options={STATS_BENCHMARK_WINDOWS.map((d) => ({ value: String(d), label: `${d} days` }))}
            onChange={(v) => change({ statsBenchmarkWindowDays: Number(v) })}
          />
        </Row>
      </Card>

      <Card id="set-display" title="Display" description="What CoachHelm shows on your dashboards. The strokes-gained baseline follows your team: the Tour for men's teams, the women's tour for women's.">
        <Row label="Strokes gained">
          <Switch label="Show strokes gained" hideLabel checked={p.showStrokesGained} onChange={(v) => change({ showStrokesGained: v })} />
        </Row>
        <Row label="Advanced statistics">
          <Switch label="Show advanced statistics" hideLabel checked={p.showAdvancedStats} onChange={(v) => change({ showAdvancedStats: v })} />
        </Row>
        <Row label="Insight detail">
          <Segmented
            label="Insight detail"
            size="sm"
            value={p.insightVerbosity}
            options={[
              { value: 'brief', label: 'Brief' },
              { value: 'detailed', label: 'Detailed' },
            ]}
            onChange={(v) => change({ insightVerbosity: v })}
          />
        </Row>
      </Card>
    </>
  );
}

function Priorities({ p, onChange }: { p: Phil; onChange: (order: PriorityKey[]) => void }) {
  const order = priorityOrder(p);
  const [moved, setMoved] = useState<PriorityKey | null>(null);
  const move = (k: PriorityKey, dir: -1 | 1) => {
    const next = moveOrder(order, k, dir);
    if (next === order) return;
    haptic('select');
    setMoved(k);
    onChange(next);
  };
  return (
    <ol className="ch-set-rank" aria-label="Priorities, most important first">
      {order.map((k, i) => (
        <li key={k} className={'ch-set-rank__i' + (moved === k ? ' is-moved' : '')} onAnimationEnd={() => setMoved(null)}>
          <span className="ch-set-rank__n ch-num">{i + 1}</span>
          <span className="ch-set-rank__txt">
            <b>{PRIORITY_LABEL[k].label}</b>
            <span>{PRIORITY_LABEL[k].hint}</span>
          </span>
          <span className="ch-set-rank__acts">
            <IconButton icon={ArrowUp} size="sm" label={`Move ${PRIORITY_LABEL[k].label} up`} disabled={i === 0} onClick={() => move(k, -1)} />
            <IconButton icon={ArrowDown} size="sm" label={`Move ${PRIORITY_LABEL[k].label} down`} disabled={i === order.length - 1} onClick={() => move(k, 1)} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function PowerCard({ initial, writes }: { initial: ChCoachHelmSettings; writes: ChSettingsWrites }) {
  const [coach, setCoach] = useState(initial.coach);
  const [team, setTeam] = useState(initial.team);
  const [confirmOff, setConfirmOff] = useState(false);
  const save = useInstantSave('coachhelm');
  const setC = (patch: Partial<ChCoachHelmSettings['coach']>, failed: string) => {
    const before = coach;
    return save.run({ key: Object.keys(patch).join(','), apply: () => setCoach((c) => ({ ...c, ...patch })), rollback: () => setCoach(before), write: () => writes.setCoachHelmCoach(patch), failed });
  };
  return (
    <Card id="set-power" title="CoachHelm" description="The AI coaching assistant on your dashboards." aside={<Icon icon={Sparkles} size={17} />}>
      {team && (
        <Row
          label="For the whole team"
          help={team.isHeadCoach ? (team.enabled ? 'On for every coach on this team.' : 'Paused for everyone on this team.') : 'Only the head coach can change this.'}
          dim={!team.isHeadCoach}
        >
          <Switch
            label="CoachHelm for the whole team"
            hideLabel
            checked={team.enabled}
            disabled={!team.isHeadCoach}
            busy={save.pending.has('team')}
            onChange={(v) =>
              void save.run({
                key: 'team',
                apply: () => setTeam((t) => (t ? { ...t, enabled: v } : t)),
                rollback: () => setTeam((t) => (t ? { ...t, enabled: !v } : t)),
                write: () => writes.setCoachHelmTeam(v),
                failed: "Couldn't change CoachHelm for the team",
              })
            }
          />
        </Row>
      )}
      <Row label="On your dashboards" help={coach.enabled ? 'Insights, predictions and patterns appear on your pages.' : 'Hidden on your pages. Your settings below are kept.'}>
        <Switch
          label="CoachHelm on your dashboards"
          hideLabel
          checked={coach.enabled}
          busy={save.pending.has('enabled')}
          onChange={(v) => (v ? void setC({ enabled: true }, "Couldn't turn CoachHelm on") : setConfirmOff(true))}
        />
      </Row>
      {coach.enabled && (
        <>
          <Row label="Insights" help="Coaching notes on what changed and why.">
            <Switch label="Insights" hideLabel checked={coach.showInsights} busy={save.pending.has('showInsights')} onChange={(v) => void setC({ showInsights: v }, "Couldn't change insights")} />
          </Row>
          <Row label="Predictions" help="Where each player's scoring is heading.">
            <Switch label="Predictions" hideLabel checked={coach.showPredictions} busy={save.pending.has('showPredictions')} onChange={(v) => void setC({ showPredictions: v }, "Couldn't change predictions")} />
          </Row>
          <Row label="Patterns" help="Leaks and habits that repeat across rounds.">
            <Switch label="Patterns" hideLabel checked={coach.showPatterns} busy={save.pending.has('showPatterns')} onChange={(v) => void setC({ showPatterns: v }, "Couldn't change patterns")} />
          </Row>
        </>
      )}
      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        icon={Sparkles}
        title="Turn off CoachHelm on your dashboards?"
        description="Insights, predictions and patterns stop appearing on your pages. You can turn it back on here any time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(false)}>
              Keep it on
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmOff(false);
                void setC({ enabled: false }, "Couldn't turn CoachHelm off");
              }}
            >
              Turn off
            </Button>
          </>
        }
      />
    </Card>
  );
}
