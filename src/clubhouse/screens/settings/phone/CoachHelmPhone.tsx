'use client';

import { useState } from 'react';
import { SIGNAL_CONTROL_RANGES, STATS_BENCHMARK_WINDOWS, THRESHOLD_RANGES, confidenceFloorForSensitivity } from '@/lib/coachhelm/constants';
import { ALERT_GROUPS, type CoachPhilosophy } from '@/lib/coachhelm/types';
import { orderToPriorities, priorityOrder, type ChCoachHelmSettings, type ChSettingsData, type ChSettingsWrites } from '../model';
import { usePhilosophy } from '../CoachHelm';
import { useCoachHelmPower } from '../hooks';
import { ReadFailed } from '../parts';
import { Reorder } from './Reorder';
import { ActionSheet } from './sheets';
import { Group, PickerRow, SliderRow, SwitchRow } from './ui';

/**
 * CoachHelm on the phone (coach): the power switches, the priorities with the native reorder handle, and every setting
 * the desktop page has, as grouped rows. Choices open a bottom sheet; sliders keep the full width under their label.
 * Same ordered save queue as desktop (CH-8022, CH-8405).
 */
export function CoachHelmPhone({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.coachhelm) return null;
  if (data.coachhelm.error) return <ReadFailed what="Your CoachHelm settings" code="CH-8211" onRetry={writes.refresh} />;
  return <CoachHelmBody initial={data.coachhelm.value} writes={writes} />;
}

function CoachHelmBody({ initial, writes }: { initial: ChCoachHelmSettings; writes: ChSettingsWrites }) {
  const { p, change, status } = usePhilosophy(initial.philosophy, writes);
  const floor = confidenceFloorForSensitivity(p.alertSensitivity);
  const alertsOn = ALERT_GROUPS.reduce((n, g) => n + g.alerts.filter((a) => p[a.key as keyof CoachPhilosophy]).length, 0);
  const alertsTotal = ALERT_GROUPS.reduce((n, g) => n + g.alerts.length, 0);
  const statusText = status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'failed' ? "A change didn't save" : 'Changes save as you make them';
  const days = p.statsBenchmarkWindowDays;

  return (
    <>
      <p className={'ch-setm-lead' + (status === 'failed' ? ' is-failed' : '')} aria-live="polite" data-ch-code="CH-8405">
        {statusText}
      </p>
      <PowerGroup initial={initial} writes={writes} />

      <Group
        title="Priorities, most important first"
        note="CoachHelm weighs player ratings and needs-attention flags in this order. Touch and hold a row, then drag. Each step ticks."
      >
        <Reorder order={priorityOrder(p)} onCommit={(order) => change(orderToPriorities(order))} />
      </Group>

      <Group title="How readily CoachHelm speaks up" note={`The preset sets a confidence floor: it needs at least ${Math.round(floor * 100)}% confidence. The thresholds are the numbers that trip each kind of alert.`}>
        <PickerRow
          label="Alert sensitivity"
          value={p.alertSensitivity}
          options={[
            { value: 'aggressive', label: 'More alerts' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'conservative', label: 'Fewer alerts' },
          ]}
          onPick={(v) => change({ alertSensitivity: v })}
        />
        <SliderRow
          label="Decline threshold"
          description="Strokes gained lost over five rounds before a decline is flagged."
          value={p.declineThreshold}
          {...THRESHOLD_RANGES.declineThreshold}
          format={(v) => `${v.toFixed(1)} SG`}
          onChange={(v) => change({ declineThreshold: v }, { debounce: 'declineThreshold' })}
        />
        <SliderRow
          label="Pressure gap"
          description="Practice-to-tournament scoring gap that raises a mental-game alert."
          value={p.pressureGapThreshold}
          {...THRESHOLD_RANGES.pressureGapThreshold}
          format={(v) => `${v.toFixed(1)} strokes`}
          onChange={(v) => change({ pressureGapThreshold: v }, { debounce: 'pressureGapThreshold' })}
        />
        <SliderRow
          label="Bubble zone"
          description="Strokes-gained range around the qualifying cutoff that marks a player as on the bubble."
          value={p.bubbleZoneRange}
          {...THRESHOLD_RANGES.bubbleZoneRange}
          format={(v) => `${v.toFixed(1)} SG`}
          onChange={(v) => change({ bubbleZoneRange: v }, { debounce: 'bubbleZoneRange' })}
        />
      </Group>

      <p className="ch-setm-lead ch-num">
        {alertsOn} of {alertsTotal} alerts on. The kinds of alert CoachHelm raises.
      </p>
      {ALERT_GROUPS.map((g) => (
        <Group key={g.title} title={g.title === 'Roster & Qualifying' ? 'Roster and qualifying' : g.title}>
          {g.alerts.map((a) => {
            const k = a.key as keyof CoachPhilosophy;
            const label = a.label.replace('Hot/cold', 'Hot and cold');
            return <SwitchRow key={a.key} label={label} checked={!!p[k]} onChange={(v) => change({ [k]: v } as Partial<CoachPhilosophy>)} />;
          })}
        </Group>
      ))}

      <Group title="How much evidence CoachHelm needs">
        <SliderRow
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
        <SliderRow
          label="Minimum rounds"
          description="Rounds a player needs before CoachHelm says anything about them."
          value={p.minRoundsForSignal}
          {...SIGNAL_CONTROL_RANGES.minRoundsForSignal}
          format={(v) => `${v} ${v === 1 ? 'round' : 'rounds'}`}
          onChange={(v) => change({ minRoundsForSignal: v }, { debounce: 'minRoundsForSignal' })}
        />
        <PickerRow
          label="Alert delivery"
          value={p.alertDigest}
          options={[
            { value: 'immediate', label: 'As they happen' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ]}
          onPick={(v) => change({ alertDigest: v })}
        />
      </Group>

      <Group title="Analysis windows" note={`How far back CoachHelm and Stats look. Stats compares the last ${days} days with the ${days} before them.`}>
        <SliderRow
          label="Hole ranking"
          description="Times a hole must be played before it can rank as toughest or easiest."
          value={p.minHolePlaysForRanking}
          {...SIGNAL_CONTROL_RANGES.minHolePlaysForRanking}
          format={(v) => `${v} plays`}
          onChange={(v) => change({ minHolePlaysForRanking: v }, { debounce: 'minHolePlaysForRanking' })}
        />
        <SliderRow
          label="Pattern lookback"
          description="The window CoachHelm mines for repeating patterns."
          value={p.patternLookbackDays}
          {...SIGNAL_CONTROL_RANGES.patternLookbackDays}
          format={(v) => `${v} days`}
          onChange={(v) => change({ patternLookbackDays: v }, { debounce: 'patternLookbackDays' })}
        />
        <PickerRow
          label="Stats comparison"
          value={String(days)}
          options={STATS_BENCHMARK_WINDOWS.map((d) => ({ value: String(d), label: `${d} days` }))}
          onPick={(v) => change({ statsBenchmarkWindowDays: Number(v) })}
        />
      </Group>

      <Group title="Display" note="What CoachHelm shows on your dashboards. The strokes-gained baseline follows your team: the Tour for men's teams, the women's tour for women's.">
        <SwitchRow label="Show strokes gained" checked={p.showStrokesGained} onChange={(v) => change({ showStrokesGained: v })} />
        <SwitchRow label="Show advanced statistics" checked={p.showAdvancedStats} onChange={(v) => change({ showAdvancedStats: v })} />
        <PickerRow
          label="Insight detail"
          value={p.insightVerbosity}
          options={[
            { value: 'brief', label: 'Brief' },
            { value: 'detailed', label: 'Detailed' },
          ]}
          onPick={(v) => change({ insightVerbosity: v })}
        />
      </Group>
    </>
  );
}

/**
 * The power switches: the team switch (head coach only), the dashboards switch, and what shows on them. Turning
 * CoachHelm off asks in an action sheet first (CH-8505).
 */
function PowerGroup({ initial, writes }: { initial: ChCoachHelmSettings; writes: ChSettingsWrites }) {
  const { coach, team, pending, setC, setTeamOn } = useCoachHelmPower(initial, writes);
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Group title="CoachHelm" note="The AI coaching assistant on your dashboards.">
        {team && (
          <SwitchRow
            label="CoachHelm for the whole team"
            help={team.isHeadCoach ? (team.enabled ? 'On for every coach on this team.' : 'Paused for everyone on this team.') : 'Only the head coach can change this.'}
            checked={team.enabled}
            disabled={!team.isHeadCoach}
            busy={pending.has('team')}
            onChange={setTeamOn}
          />
        )}
        <SwitchRow
          label="CoachHelm on your dashboards"
          help={coach.enabled ? 'Insights, predictions and patterns appear on your pages.' : 'Hidden on your pages. Your settings below are kept.'}
          checked={coach.enabled}
          busy={pending.has('enabled')}
          onChange={(v) => (v ? void setC({ enabled: true }, "Couldn't turn CoachHelm on") : setAsking(true))}
        />
        {coach.enabled && (
          <>
            <SwitchRow label="Insights" help="Coaching notes on what changed and why." checked={coach.showInsights} busy={pending.has('showInsights')} onChange={(v) => void setC({ showInsights: v }, "Couldn't change insights")} />
            <SwitchRow label="Predictions" help="Where each player's scoring is heading." checked={coach.showPredictions} busy={pending.has('showPredictions')} onChange={(v) => void setC({ showPredictions: v }, "Couldn't change predictions")} />
            <SwitchRow label="Patterns" help="Leaks and habits that repeat across rounds." checked={coach.showPatterns} busy={pending.has('showPatterns')} onChange={(v) => void setC({ showPatterns: v }, "Couldn't change patterns")} />
          </>
        )}
      </Group>
      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        code="CH-8505"
        title="Turn off CoachHelm on your dashboards?"
        message="Insights, predictions and patterns stop appearing on your pages. You can turn it back on here any time."
        actions={[
          {
            label: 'Turn off CoachHelm',
            onClick: () => {
              setAsking(false);
              void setC({ enabled: false }, "Couldn't turn CoachHelm off");
            },
          },
        ]}
      />
    </>
  );
}
