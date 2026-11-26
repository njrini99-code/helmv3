'use client';

import { Clock, SlidersHorizontal } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { saveHoursAdjustment, saveHoursSettings } from '@/app/golf/actions/hours';
import { Button } from '../../../ui/Button';
import { DateField } from '../../../ui/DateField';
import { useSheetDraft } from '../../../ui/FormSheet';
import { Modal } from '../../../ui/Modal';
import { Segmented } from '../../../ui/Segmented';
import { Select } from '../../../ui/Select';
import { Switch } from '../../../ui/Switch';
import { haptic } from '../../../lib/haptics';
import { plural } from '../../../lib/plural';
import { useAction } from '../../../lib/use-action';
import { shortDay, type ChHoursLine } from './model';
import {
  checkHoursAdjustment,
  checkHoursSettings,
  fmtHours,
  HOURS_DIVISIONS,
  weekdayName,
  type ChHoursDivision,
  type ChHoursField,
  type ChHoursProblem,
  type ChHoursSettings,
} from './rules';

/**
 * Launch readiness F-03: the Practice hours page's two sheets, a coach's only. Limits: the association, the team's week,
 * the declared seasons, Custom's own limits and the hours an untimed practice counts. Change: how one event counts for
 * every player on it. Both check what the save checks (rules.ts) before sending, and say the first problem under its field.
 */

/** A number field's text as a figure, or null when empty; NaN when it isn't a number. */
const figure = (text: string): number | null => (text.trim() === '' ? null : Number(text.replace(',', '.')));

function Problem({ problem, field, id }: { problem: ChHoursProblem<string> | null; field: string; id?: string }) {
  if (problem?.field !== field) return null;
  return (
    <span id={id} className="ch-field__help is-error" role="alert" data-ch-code={field === 'hours' || field === 'note' ? 'CH-6181' : 'CH-6180'}>
      {problem.message}
    </span>
  );
}

/** A field: its label names the control alone; the help and any problem are read after it (aria-describedby). */
function Field({
  id,
  label,
  help,
  problem,
  field,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  problem?: ChHoursProblem<string> | null;
  field?: string;
  children: ReactNode;
}) {
  return (
    <div className="ch-field">
      <label className="ch-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && (
        <span id={`${id}-help`} className="ch-field__help">
          {help}
        </span>
      )}
      {field && <Problem problem={problem ?? null} field={field} id={`${id}-err`} />}
    </div>
  );
}

/** What a control is described by: its help, and its problem while it has one. */
const describedBy = (id: string, help: boolean, bad: boolean) => [help ? `${id}-help` : '', bad ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;

interface LimitsDraft {
  division: ChHoursDivision;
  autonomy: boolean;
  weekStartsOn: number;
  fallFrom: string;
  fallTo: string;
  springFrom: string;
  springTo: string;
  day: string;
  week: string;
  daysOff: number;
  untimed: string;
}

const draftOf = (s: ChHoursSettings, untimed: number | null): LimitsDraft => ({
  division: s.division,
  autonomy: s.autonomy,
  weekStartsOn: s.weekStartsOn,
  fallFrom: s.fall?.from ?? '',
  fallTo: s.fall?.to ?? '',
  springFrom: s.spring?.from ?? '',
  springTo: s.spring?.to ?? '',
  day: s.custom.day != null ? fmtHours(s.custom.day) : '',
  week: s.custom.week != null ? fmtHours(s.custom.week) : '',
  daysOff: s.custom.daysOff,
  untimed: untimed != null ? fmtHours(untimed) : '',
});

/** A season from its two fields: both empty is none; one empty is kept as a half range so the check names it. */
const rangeOf = (from: string, to: string) => (!from && !to ? null : { from, to });

function settingsOf(d: LimitsDraft): { settings: ChHoursSettings; untimedHours: number | null; problem: ChHoursProblem | null } {
  const day = figure(d.day);
  const week = figure(d.week);
  const untimed = figure(d.untimed);
  const settings: ChHoursSettings = {
    division: d.division,
    autonomy: d.division === 'd1' && d.autonomy,
    weekStartsOn: d.weekStartsOn,
    fall: rangeOf(d.fallFrom, d.fallTo),
    spring: rangeOf(d.springFrom, d.springTo),
    custom: { day, week, daysOff: d.daysOff },
  };
  const nan = (v: number | null) => v != null && Number.isNaN(v);
  const problem: ChHoursProblem | null =
    d.division === 'custom' && nan(day)
      ? { field: 'day', message: 'Write the day’s limit as a number of hours.' }
      : d.division === 'custom' && nan(week)
        ? { field: 'week', message: 'Write the week’s limit as a number of hours.' }
        : nan(untimed)
          ? { field: 'untimed', message: 'Write the hours as a number, or leave it empty.' }
          : checkHoursSettings(settings, untimed);
  return { settings, untimedHours: untimed, problem };
}

const WEEKDAY_OPTIONS = Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: weekdayName(i) }));
const DAYS_OFF_OPTIONS = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: plural(i, 'day') }));

export function LimitsSheet({
  open,
  onClose,
  teamId,
  settings,
  untimedHours,
  today,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  settings: ChHoursSettings;
  untimedHours: number | null;
  today: string;
  onSaved: () => void;
}) {
  const ids = useId();
  const { draft, setDraft, dirty } = useSheetDraft(draftOf(settings, untimedHours), open);
  const [problem, setProblem] = useState<ChHoursProblem | null>(null);
  const set = (patch: Partial<LimitsDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblem(null);
  };
  const save = useAction(
    'calendar.hours.saveLimits',
    async (input: { settings: ChHoursSettings; untimedHours: number | null }) => {
      const res = await saveHoursSettings({ teamId, ...input });
      if (res.success) {
        onClose();
        onSaved();
      }
      return res;
    },
    () => ({ done: 'Limits saved', failed: 'Couldn’t save your limits', hint: 'Your changes are still here. Try again.', code: 'CH-6080' }),
  );
  const submit = () => {
    const next = settingsOf(draft);
    if (next.problem) {
      setProblem(next.problem);
      haptic('warning');
      return;
    }
    void save.run({ settings: next.settings, untimedHours: next.untimedHours });
  };
  const custom = draft.division === 'custom';
  const invalid = (f: ChHoursField) => problem?.field === f || undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={SlidersHorizontal}
      title="Practice hour limits"
      description="What each week is read against. Your players see the same limits."
      footer={
        <>
          <Button data-ctl="CTL-P006-112" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button data-ctl="CTL-P006-113" variant="primary" busy={save.pending} disabled={!dirty} onClick={submit}>
            {save.pending ? 'Saving…' : 'Save limits'}
          </Button>
        </>
      }
    >
      <div className="ch-hrs-form">
        <Field
          id={`${ids}-div`}
          label="Association"
          help={
            draft.division === 'naia'
              ? 'NAIA sets no weekly hour limits. Choose Custom to set your own.'
              : draft.division === 'custom'
                ? 'Your own limits, for a conference or an institution that sets its own.'
                : 'The NCAA limits for the playing season, the fall season and outside them.'
          }
        >
          <Select<ChHoursDivision> id={`${ids}-div`} value={draft.division} options={HOURS_DIVISIONS} onChange={(v) => set({ division: v })} />
        </Field>

        {draft.division === 'd1' && (
          <div className="ch-field">
            <Switch checked={draft.autonomy} onChange={(v) => set({ autonomy: v })} label="Autonomy conference rules" />
            <span className="ch-field__help">Under these rules a day spent travelling to or from a competition is never the day off (Bylaw 17.1.7.7.1).</span>
          </div>
        )}

        <Field id={`${ids}-wk`} label="The team’s week starts on" help="Any seven days in a row, kept the same for the whole season.">
          <Select<string> id={`${ids}-wk`} value={String(draft.weekStartsOn)} options={WEEKDAY_OPTIONS} onChange={(v) => set({ weekStartsOn: Number(v) })} />
        </Field>

        <fieldset className="ch-hrs-form__set">
          <legend className="ch-field__label">Fall season · optional</legend>
          <div className="ch-hrs-form__row">
            <DateField
              label="Fall season first day"
              value={draft.fallFrom}
              onChange={(v) => set({ fallFrom: v })}
              today={today}
              clearable
              aria-invalid={invalid('fall')}
              aria-describedby={invalid('fall') ? `${ids}-fall-err` : undefined}
            />
            <DateField
              label="Fall season last day"
              value={draft.fallTo}
              min={draft.fallFrom || undefined}
              anchor={draft.fallFrom || undefined}
              onChange={(v) => set({ fallTo: v })}
              today={today}
              clearable
              aria-invalid={invalid('fall')}
              aria-describedby={invalid('fall') ? `${ids}-fall-err` : undefined}
            />
          </div>
          <Problem problem={problem} field="fall" id={`${ids}-fall-err`} />
        </fieldset>

        <fieldset className="ch-hrs-form__set">
          <legend className="ch-field__label">Spring season · optional</legend>
          <div className="ch-hrs-form__row">
            <DateField
              label="Spring season first day"
              value={draft.springFrom}
              onChange={(v) => set({ springFrom: v })}
              today={today}
              clearable
              aria-invalid={invalid('spring')}
              aria-describedby={`${ids}-spring-help`}
            />
            <DateField
              label="Spring season last day"
              value={draft.springTo}
              min={draft.springFrom || undefined}
              anchor={draft.springFrom || undefined}
              onChange={(v) => set({ springTo: v })}
              today={today}
              clearable
              aria-invalid={invalid('spring')}
              aria-describedby={`${ids}-spring-help`}
            />
          </div>
          <span id={`${ids}-spring-help`} className="ch-field__help">
            The seasons you declared. A week outside both is read against the limits outside the season; with neither set, every week is read as in season.
          </span>
          <Problem problem={problem} field="spring" id={`${ids}-spring-err`} />
        </fieldset>

        {custom && (
          <div className="ch-hrs-form__row ch-hrs-form__row--3">
            <Field id={`${ids}-day`} label="Hours a day" problem={problem} field="day">
              <input
                id={`${ids}-day`}
                className="ch-input ch-num"
                inputMode="decimal"
                placeholder="None"
                value={draft.day}
                onChange={(e) => set({ day: e.target.value })}
                aria-invalid={invalid('day')}
                aria-describedby={describedBy(`${ids}-day`, false, !!invalid('day'))}
              />
            </Field>
            <Field id={`${ids}-week`} label="Hours a week" problem={problem} field="week">
              <input
                id={`${ids}-week`}
                className="ch-input ch-num"
                inputMode="decimal"
                placeholder="None"
                value={draft.week}
                onChange={(e) => set({ week: e.target.value })}
                aria-invalid={invalid('week')}
                aria-describedby={describedBy(`${ids}-week`, false, !!invalid('week'))}
              />
            </Field>
            <Field id={`${ids}-off`} label="Days off a week">
              <Select<string> id={`${ids}-off`} value={String(draft.daysOff)} options={DAYS_OFF_OPTIONS} onChange={(v) => set({ daysOff: Number(v) })} />
            </Field>
          </div>
        )}

        <Field
          id={`${ids}-unt`}
          label="Hours an untimed practice counts"
          help="Optional. For practices and meetings saved with no times (all day). Empty counts none, and the page says so."
          problem={problem}
          field="untimed"
        >
          <input
            id={`${ids}-unt`}
            className="ch-input ch-num"
            inputMode="decimal"
            placeholder="None"
            value={draft.untimed}
            onChange={(e) => set({ untimed: e.target.value })}
            aria-invalid={invalid('untimed')}
            aria-describedby={describedBy(`${ids}-unt`, true, !!invalid('untimed'))}
          />
        </Field>
      </div>
    </Modal>
  );
}

type Mode = 'draft' | 'hours' | 'out';

const modeOf = (l: ChHoursLine | null): Mode => (!l?.adjustment ? 'draft' : !l.adjustment.counted ? 'out' : l.adjustment.hours != null ? 'hours' : 'draft');

export function AdjustSheet({ line, onClose, teamId, onSaved }: { line: ChHoursLine | null; onClose: () => void; teamId: string; onSaved: () => void }) {
  const ids = useId();
  const open = !!line;
  // The last line, so the sheet keeps its words while it closes.
  const [shown, setShown] = useState<ChHoursLine | null>(line);
  if (line && line !== shown) setShown(line);
  const l = line ?? shown;
  const saved = {
    mode: modeOf(l),
    hours: l?.adjustment?.hours != null ? fmtHours(l.adjustment.hours) : l?.hours != null ? fmtHours(l.hours) : '',
    note: l?.adjustment?.note ?? '',
  };
  const { draft, setDraft, dirty } = useSheetDraft(saved, open);
  const [problem, setProblem] = useState<ChHoursProblem<'hours' | 'note'> | null>(null);
  const set = (patch: Partial<typeof saved>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblem(null);
  };
  const title = l?.title ?? 'the event';
  const save = useAction(
    'calendar.hours.saveAdjustment',
    async (input: { eventId: string; adjustment: { counted: boolean; hours: number | null; note: string | null } | null }) => {
      const res = await saveHoursAdjustment({ teamId, ...input });
      if (res.success) {
        onClose();
        onSaved();
      }
      return res;
    },
    (input) => ({
      done: !input.adjustment
        ? `${title} counts as drafted`
        : !input.adjustment.counted
          ? `${title} doesn’t count`
          : `${title} counts ${fmtHours(input.adjustment.hours ?? 0)} hours`,
      failed: `Couldn’t save the change to ${title}`,
      hint: 'Your change is still here. Try again.',
      code: 'CH-6081',
    }),
  );
  const submit = () => {
    if (!l) return;
    if (draft.mode === 'draft') {
      if (!l.adjustment) return onClose();
      void save.run({ eventId: l.eventId, adjustment: null });
      return;
    }
    const hours = draft.mode === 'hours' ? figure(draft.hours) : null;
    if (draft.mode === 'hours' && (hours == null || Number.isNaN(hours))) {
      setProblem({ field: 'hours', message: 'Write the hours it counts, from 0 to 24.' });
      haptic('warning');
      return;
    }
    const adjustment = { counted: draft.mode === 'hours', hours, note: draft.note.trim() || null };
    const bad = checkHoursAdjustment(adjustment);
    if (bad) {
      setProblem(bad);
      haptic('warning');
      return;
    }
    void save.run({ eventId: l.eventId, adjustment });
  };
  const span = !!l?.when.span && l.when.span.from !== l.when.span.to;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Clock}
      title={`How ${title} counts`}
      description={l ? `${shortDay(l.date)} · Drafted: ${l.adjustment ? 'changed by you' : l.why}` : undefined}
      footer={
        <>
          <Button data-ctl="CTL-P006-114" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button data-ctl="CTL-P006-115" variant="primary" busy={save.pending} disabled={!dirty} onClick={submit}>
            {save.pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="ch-hrs-form">
        <Segmented<Mode>
          label="How it counts"
          block
          value={draft.mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: 'draft', label: 'As drafted' },
            { value: 'hours', label: 'Set hours' },
            { value: 'out', label: 'Doesn’t count' },
          ]}
        />
        {draft.mode === 'hours' && (
          <Field id={`${ids}-h`} label={span ? 'Hours for each player, each day it runs' : 'Hours for each player on it'} problem={problem} field="hours">
            <input
              id={`${ids}-h`}
              className="ch-input ch-num"
              inputMode="decimal"
              value={draft.hours}
              onChange={(e) => set({ hours: e.target.value })}
              aria-invalid={problem?.field === 'hours' || undefined}
              aria-describedby={describedBy(`${ids}-h`, false, problem?.field === 'hours')}
            />
          </Field>
        )}
        {draft.mode !== 'draft' && (
          <Field id={`${ids}-n`} label="Note" help="Optional. Your players see it beside the event." problem={problem} field="note">
            <textarea
              id={`${ids}-n`}
              className="ch-textarea"
              rows={2}
              maxLength={280}
              placeholder={draft.mode === 'out' ? 'Academic meeting' : 'Ran short for the rain'}
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              aria-invalid={problem?.field === 'note' || undefined}
              aria-describedby={describedBy(`${ids}-n`, true, problem?.field === 'note')}
            />
          </Field>
        )}
        <p className="ch-field__help">
          {draft.mode === 'draft'
            ? l?.adjustment
              ? 'Takes your change off: it counts as the calendar and attendance draft it.'
              : 'It counts as the calendar and attendance draft it.'
            : draft.mode === 'out'
              ? 'For something that isn’t countable, such as an academic or compliance meeting. It counts for no one.'
              : 'For every player it counts for. A figure you set takes the place of the drafted one.'}
        </p>
      </div>
    </Modal>
  );
}
