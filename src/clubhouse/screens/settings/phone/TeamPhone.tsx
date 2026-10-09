'use client';

import { useId, useRef, useState } from 'react';
import { EmptyState } from '../../../ui/States';
import { haptic } from '../../../lib/haptics';
import {
  HANDICAP_OPTIONS,
  hoursLabel,
  minutesLabel,
  REMINDER_RANGES,
  remindersProblem,
  teamProblem,
  TIMEZONE_OPTIONS,
  type ChProblem,
  type ChReminders,
  type ChScoring,
  type ChSettingsData,
  type ChSettingsWrites,
  type ChTeamInfo,
} from '../model';
import { SAVE_COPY, useInvite } from '../hooks';
import { ReadFailed, ReadsFailed, useInstantSave, useSaveAction } from '../parts';
import { teamReadsFailed } from '../Team';
import { TEES } from '../Team';
import { ActionSheet, FormSheet, useSheetDraft } from './sheets';
import { StaffPhone } from './StaffPhone';
import { CourseLocationPhone } from '../course-location';
import { FieldRow, Group, NavRow, PickerRow, Problem, SliderRow, SwitchRow } from './ui';

/**
 * Team on the phone (coach): the invite code, team details, scoring and reminders. Text edits open a sheet; choices
 * open a bottom sheet and save as they are picked (the same writes as desktop's Save).
 */
export function TeamPhone({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.teamId) {
    return (
      <EmptyState code="CH-8301" title="You aren’t on a team yet" body="Team settings appear once your program is set up and you’re on its staff." />
    );
  }
  return <TeamBody data={data} writes={writes} />;
}

function TeamBody({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  const team = data.team && !data.team.error ? data.team.value : null;
  // The timezone and the scoring choices are one saved record, so they share one state: a pick never sends a stale copy of the others.
  const scoring = useScoring(data.scoring && !data.scoring.error ? data.scoring.value : null, writes);
  const failed = teamReadsFailed(data);
  const covered = failed.length > 1;
  return (
    <>
      <ReadsFailed parts={failed} onRetry={writes.refresh} />
      {data.joinCode?.error ? (
        <Group title="Invite players">
          <ReadFailed bare what="Your invite code" code="CH-8206" onRetry={writes.refresh} covered={covered} />
        </Group>
      ) : (
        data.joinCode && <InvitePhone code={data.joinCode.value} writes={writes} />
      )}
      <StaffPhone coachId={data.coachId} writes={writes} />
      {data.team?.error && (
        <Group title="Team details">
          <ReadFailed bare what="Team details" code="CH-8205" onRetry={writes.refresh} covered={covered} />
        </Group>
      )}
      {(team || scoring.s) && <DetailsPhone team={team} scoring={scoring} writes={writes} />}
      {data.scoring?.error ? (
        <Group title="Scoring and format">
          <ReadFailed bare what="Scoring settings" code="CH-8207" onRetry={writes.refresh} covered={covered} />
        </Group>
      ) : (
        scoring.s && <ScoringPhone scoring={scoring} />
      )}
      {data.reminders?.error ? (
        <Group title="Event reminders">
          <ReadFailed bare what="Event reminders" code="CH-8208" onRetry={writes.refresh} covered={covered} />
        </Group>
      ) : (
        data.reminders && <RemindersPhone reminders={data.reminders.value} writes={writes} />
      )}
      {data.teamId && <CourseLocationPhone teamId={data.teamId} />}
    </>
  );
}

/**
 * The invite code with Share, and New code, which asks in an action sheet first (CH-8503). It is Team's one feature card
 * (the Mobile clubhouse pass, owner 2026-10-08): the code is what a coach most often opens Team for, so it sits first,
 * on the frame's green, with Share as its action and New code as the quiet way to replace it.
 */
function InvitePhone({ code: initial, writes }: { code: string; writes: ChSettingsWrites }) {
  const { code, canShare, regen, copy, share } = useInvite(initial, writes);
  const [asking, setAsking] = useState(false);
  const labelId = useId();
  return (
    <>
      <section className="ch-feat ch-setm-code" aria-labelledby={labelId}>
        <span className="ch-feat__k">
          <span className="ch-feat__kicker" id={labelId}>
            Invite players
          </span>
          {/* Where the device has no share sheet, Share copies the join link instead. */}
          <button type="button" className="ch-setm-pill is-on-green" onClick={() => void (canShare ? share() : copy('link'))}>
            Share
          </button>
        </span>
        <b className="ch-feat__title ch-setm-code__v ch-num" aria-live="polite">
          {code}
        </b>
        <span className="ch-feat__line">Players join with this code, then you approve them from Roster.</span>
        <span className="ch-feat__foot">
          <button type="button" className="ch-setm-link is-on-green" disabled={regen.pending} onClick={() => setAsking(true)}>
            {regen.pending ? 'Making…' : 'New code'}
          </button>
        </span>
      </section>
      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        code="CH-8503"
        title="Replace your invite code?"
        message={`${code} stops working right away. Players who haven’t joined yet will need the new code.`}
        actions={[
          {
            label: 'Replace code',
            onClick: () => {
              setAsking(false);
              void regen.run();
            },
          },
        ]}
      />
    </>
  );
}

/** The scoring choices, each saved as it is picked: the new one shows at once, and goes back if the save fails (CH-8014). */
function useScoring(initial: ChScoring | null, writes: ChSettingsWrites) {
  const [s, setS] = useState(initial);
  const latest = useRef(s);
  latest.current = s;
  const save = useInstantSave('scoring');
  const pick = <K extends keyof ChScoring>(key: K, v: ChScoring[K]) => {
    const now = latest.current;
    if (!now) return;
    const before = now[key];
    const next = { ...now, [key]: v };
    void save.run({
      key,
      apply: () => setS((x) => (x ? { ...x, [key]: v } : x)),
      rollback: () => setS((x) => (x ? { ...x, [key]: before } : x)),
      write: () => writes.saveScoring(next),
      failed: SAVE_COPY.scoring.failed,
      code: SAVE_COPY.scoring.code,
    });
  };
  // One save at a time: a second choice would be sent on top of one that hasn't landed (or may not).
  return { s, pick, busy: save.pending.size > 0 };
}

type Scoring = ReturnType<typeof useScoring>;

/**
 * Team details: the name (which opens the details sheet: name, season and school) and the team timezone, which lives
 * with the scoring settings, so it needs their read too.
 */
function DetailsPhone({ team, scoring, writes }: { team: ChTeamInfo | null; scoring: Scoring; writes: ChSettingsWrites }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Group title="Team details">
        {team && <NavRow label="Team name" value={team.name} onClick={() => setEditing(true)} />}
        {scoring.s && <PickerRow label="Team timezone" value={scoring.s.timezone} options={TIMEZONE_OPTIONS} disabled={scoring.busy} onPick={(v) => scoring.pick('timezone', v)} />}
      </Group>
      {team && <TeamSheet open={editing} onClose={() => setEditing(false)} team={team} writes={writes} />}
    </>
  );
}

/** Team name, season and school, in a full-height sheet (CH-8011, CH-8108 to CH-8110). */
function TeamSheet({ open, onClose, team, writes }: { open: boolean; onClose: () => void; team: ChTeamInfo; writes: ChSettingsWrites }) {
  const { draft, setDraft, dirty } = useSheetDraft(team, open);
  const save = useSaveAction('settings.saveTeam', writes.saveTeam, SAVE_COPY.team, () => {
    writes.refresh();
    onClose();
  });
  const org = draft.org;
  const setOrg = (k: keyof NonNullable<ChTeamInfo['org']>, v: string) => setDraft((d) => (d.org ? { ...d, org: { ...d.org, [k]: v } } : d));
  const invalid = teamProblem(draft);
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      full
      title="Team details"
      actionLabel={save.pending ? 'Saving…' : 'Save'}
      busy={save.pending}
      dirty={dirty}
      actionDisabled={!dirty || !!invalid}
      onAction={() => void save.run(draft)}
      note="Shown to your players, and on invites and exports."
    >
      <div className="ch-setm-card">
        <FieldRow id="set-team-name" label="Team name" inline value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <FieldRow id="set-team-season" label="Season" inline placeholder="2026–27" value={draft.season} onChange={(e) => setDraft((d) => ({ ...d, season: e.target.value }))} />
      </div>
      {org && (
        <Group title="School">
          <FieldRow id="set-org-name" label="Name" inline value={org.name} onChange={(e) => setOrg('name', e.target.value)} />
          <FieldRow id="set-org-city" label="City" inline value={org.city} onChange={(e) => setOrg('city', e.target.value)} />
          <FieldRow id="set-org-state" label="State" inline maxLength={2} placeholder="NC" value={org.state} onChange={(e) => setOrg('state', e.target.value.toUpperCase())} />
          <FieldRow id="set-org-div" label="Division" inline placeholder="NCAA D1" value={org.division} onChange={(e) => setOrg('division', e.target.value)} />
          <FieldRow id="set-org-conf" label="Conference" inline placeholder="ACC" value={org.conference} onChange={(e) => setOrg('conference', e.target.value)} />
        </Group>
      )}
      {invalid && dirty && <Problem problem={invalid} />}
    </FormSheet>
  );
}

/** Scoring and format: three choices, each saved as it is picked (CH-8014). */
function ScoringPhone({ scoring }: { scoring: Scoring }) {
  const { s, pick, busy } = scoring;
  if (!s) return null;
  return (
    <Group title="Scoring and format" note="Defaults for new rounds and events. The timezone sets when every event and reminder happens.">
      <PickerRow
        label="Scoring format"
        value={s.scoringFormat}
        options={[
          { value: 'stroke_play', label: 'Stroke play' },
          { value: 'match_play', label: 'Match play' },
        ]}
        disabled={busy}
        onPick={(v) => pick('scoringFormat', v)}
      />
      <PickerRow label="Handicap system" value={s.handicapSystem} options={HANDICAP_OPTIONS} disabled={busy} onPick={(v) => pick('handicapSystem', v)} />
      <PickerRow label="Default tees" value={s.defaultTees} options={TEES} disabled={busy} onPick={(v) => pick('defaultTees', v)} />
    </Group>
  );
}

type ReminderField = 'earlyHours' | 'lateMinutes';

/**
 * Event reminders: Send reminders saves as it flips; the two times open a sheet with a slider each. The first reminder
 * has to come before the final one (CH-8111), so a schedule that isn't valid is never sent.
 */
function RemindersPhone({ reminders, writes }: { reminders: ChReminders; writes: ChSettingsWrites }) {
  const [r, setR] = useState(reminders);
  const [field, setField] = useState<ReminderField | null>(null);
  const [refused, setRefused] = useState<ChProblem | null>(null);
  const save = useInstantSave('reminders');
  const flip = (enabled: boolean) => {
    const next = { ...r, enabled };
    const problem = remindersProblem(next);
    setRefused(problem);
    if (problem) {
      haptic('warning');
      return;
    }
    void save.run({
      key: 'enabled',
      apply: () => setR(next),
      rollback: () => setR((x) => ({ ...x, enabled: !enabled })),
      write: () => writes.saveReminders(next),
      failed: SAVE_COPY.reminders.failed,
      code: SAVE_COPY.reminders.code,
    });
  };
  return (
    <>
      <Group title="Event reminders" note="Players who haven’t replied get a nudge before each event.">
        <SwitchRow label="Send reminders" checked={r.enabled} busy={save.pending.has('enabled')} onChange={flip} />
        {r.enabled && (
          <>
            <NavRow label="First reminder" value={hoursLabel(r.earlyHours)} onClick={() => setField('earlyHours')} />
            <NavRow label="Final reminder" value={minutesLabel(r.lateMinutes)} onClick={() => setField('lateMinutes')} />
          </>
        )}
      </Group>
      {refused && <Problem problem={refused} />}
      <ReminderSheet
        field={field}
        reminders={r}
        writes={writes}
        onClose={() => setField(null)}
        onSaved={(next) => {
          setR(next);
          setRefused(null);
        }}
      />
    </>
  );
}

/** One reminder time on a slider, full width (CH-8015, CH-8111). */
function ReminderSheet({ field, reminders, writes, onClose, onSaved }: { field: ReminderField | null; reminders: ChReminders; writes: ChSettingsWrites; onClose: () => void; onSaved: (r: ChReminders) => void }) {
  const open = field != null;
  // Keep the last field while the sheet closes, so it doesn't change shape on the way out.
  const [last, setLast] = useState<ReminderField>('earlyHours');
  if (field && field !== last) setLast(field);
  const f = last;
  const { draft, setDraft, dirty } = useSheetDraft(reminders[f], open);
  const next: ChReminders = { ...reminders, [f]: draft };
  const invalid = remindersProblem(next);
  const save = useSaveAction('settings.saveReminders', writes.saveReminders, SAVE_COPY.reminders, (_r, saved) => {
    onSaved(saved);
    onClose();
  });
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={f === 'earlyHours' ? 'First reminder' : 'Final reminder'}
      actionLabel={save.pending ? 'Saving…' : 'Save'}
      busy={save.pending}
      dirty={dirty}
      actionDisabled={!dirty || !!invalid}
      onAction={() => void save.run(next)}
      note={f === 'earlyHours' ? 'How long before an event players who haven’t replied get the first nudge.' : 'How long before an event the last nudge goes out.'}
    >
      <div className="ch-setm-card">
        {f === 'earlyHours' ? (
          <SliderRow label="First reminder" value={draft} {...REMINDER_RANGES.earlyHours} format={hoursLabel} onChange={setDraft} />
        ) : (
          <SliderRow label="Final reminder" value={draft} {...REMINDER_RANGES.lateMinutes} format={minutesLabel} onChange={setDraft} />
        )}
      </div>
      {invalid && <Problem problem={invalid} />}
    </FormSheet>
  );
}
