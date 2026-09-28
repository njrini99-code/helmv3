'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayNewQualifier
 * ----------------------------------------------------------------------------
 * The coach's create-qualifier form (/golf/dashboard/qualifiers/new).
 *
 * Owner 2026-09-28 rebuild ("looks awful … nothing like anything else with
 * its components"): five section cards in the qualifier pages' own chrome (a
 * sunken header band over a strong rule, as on the detail page's Details
 * card), the Fairway date picker instead of the OS date inputs, steppers for
 * the round cap and the squad, a seat strip for the travel squad, the shared
 * PlayerIdentity roster picker, and ONE summary panel holding the Create
 * button. On a phone that panel is a tray pinned above the tab bar; from `md`
 * it is a rail pinned beside the form, because the coach's "Ask CoachHelm"
 * launcher owns the bottom-right corner there and a bottom bar would sit
 * under it.
 *
 * The create call is unchanged: `createGolfQualifier`, same input. Green is
 * the Create button only (owner 2026-09-27); selection, seats and finished
 * steps are ink on cream, and focus is the one warm focus colour.
 *
 * Contracts kept (tests: __tests__/FairwayNewQualifier.*.test.tsx):
 *   • #1270: every Base UI control sits in a FormField or a CheckboxGroup. A
 *     bare Input, NumberField, Switch or Checkbox registers with the Form as a
 *     field whose validity is null, and Form then cancels every submit in
 *     silence. The date pickers are not Base UI fields.
 *   • P192: each roster checkbox carries the player's name as aria-label.
 *   • HYD-07: "today" is read after mount, so the pickers' past-day limit
 *     never differs between the server render and the viewer's day.
 *   • The one-round cap is an affirmative choice, and the cap is enforced.
 *   • Dates are calendar metadata. Only the coach closes a qualifier, so no
 *     copy here may say a date closes entry.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { CalendarDays, Check, CircleAlert, MapPin, Search, Star, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  Button,
  IconButton,
  EmptyState,
  Form,
  FormSection,
  FormField,
  Input,
  TextArea,
  NumberField,
  Checkbox,
  CheckboxGroup,
  Avatar,
  AvatarGroup,
  PlayerIdentity,
  DatePicker,
  type Matcher,
} from '@/components/fairway';
import { fwPressSurface } from '@/components/fairway/controls';
// The same label / help / error recipes FormField uses, so the date fields
// (which cannot be Base UI fields) read exactly like the fields around them.
import {
  errorClasses,
  helpClasses,
  labelClasses,
  messageRowClasses,
  optionalTagClasses,
  requiredMarkClasses,
} from '@/components/fairway/forms/styles';
import { createGolfQualifier } from '@/app/golf/actions/golf';
// The SAME cloud course catalog picker the new-round flow uses (Stage A course
// shelves → Stage B tee). Only the picked course/tee identity is read.
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import { localDayIso } from '@/lib/golf/local-day';

/** One round's assigned course in the create form. */
interface RoundCourseDraft {
  roundNumber: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

export interface FairwayNewQualifierProps {
  players: Player[];
}

/** The control a blocked submit points the coach at (null: a server error). */
type ErrorField = 'name' | 'startDate' | 'endDate' | 'entryDeadline' | 'roundCap' | null;

interface FormError {
  message: string;
  field: ErrorField;
}

/** Seats drawn before the strip folds the rest into a "+N" chip. */
const MAX_SEATS = 20;
/** A roster longer than this gets a find-a-player box. */
const SEARCH_FROM = 12;

const NAME_REQUIRED = 'Give the qualifier a name.';
const START_REQUIRED = 'Pick a start date.';
const CAP_REQUIRED = 'Confirm that this qualifier intentionally allows one round.';

/* ── Dates ─────────────────────────────────────────────────────────────── */

/** "2026-10-05" → that calendar day at local midnight (never parsed as UTC). */
function isoToDate(iso: string): Date | undefined {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}

/** Whole calendar days from `from` to `to`, both "YYYY-MM-DD". */
function dayDiff(from: string, to: string): number {
  const a = isoToDate(from);
  const b = isoToDate(to);
  if (!a || !b) return 0;
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** "Mon, Oct 5", with the year when it is not this year's. */
function formatDay(iso: string, thisYear: number | null): string {
  const d = isoToDate(iso);
  if (!d) return iso;
  return format(d, d.getFullYear() === thisYear ? 'EEE, MMM d' : 'EEE, MMM d, yyyy');
}

/** The window, compact: "Mon, Oct 5", "Oct 5 – 7", "Oct 30 – Nov 2". */
function formatWindow(start: string, end: string, thisYear: number | null): string {
  const s = isoToDate(start);
  const e = end && end > start ? isoToDate(end) : undefined;
  if (!s) return '';
  if (!e) return formatDay(start, thisYear);
  if (s.getFullYear() !== e.getFullYear()) {
    return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;
  }
  const year = e.getFullYear() === thisYear ? '' : `, ${e.getFullYear()}`;
  return s.getMonth() === e.getMonth()
    ? `${format(s, 'MMM d')} – ${format(e, 'd')}${year}`
    : `${format(s, 'MMM d')} – ${format(e, 'MMM d')}${year}`;
}

/** "Starts in 7 days" from the viewer's today; null for a day already gone. */
function startsIn(today: string, start: string): string | null {
  const n = dayDiff(today, start);
  if (n < 0) return null;
  if (n === 0) return 'Starts today';
  if (n === 1) return 'Starts tomorrow';
  return `Starts in ${n} days`;
}

/* ── Squad ─────────────────────────────────────────────────────────────── */

/**
 * The squad split in the leaderboard's words ("on score", "coach's pick").
 * A squad of all picks never reads "Top 0 on score".
 */
function squadSplit(total: number, picks: number): string {
  const onScore = total - picks;
  if (picks === 0) return `Top ${total} on score`;
  if (onScore === 0) return total === 1 ? "1 coach's pick" : `All ${total} are coach's picks`;
  return `Top ${onScore} on score · ${picks} ${picks === 1 ? "coach's pick" : "coach's picks"}`;
}

/* ── Focus ─────────────────────────────────────────────────────────────── */

/**
 * Move to the control a blocked submit names, centred, so it lands clear of
 * the sticky chrome above and the phone tray below.
 */
function focusControl(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (typeof el.scrollIntoView === 'function') {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
}

/* ── Control looks (owner 2026-09-27: no green outline rings) ───────────── */

/** Text fields: the one warm focus colour instead of the green ring. */
const textFocusCls = 'focus-visible:ring-border-focus';

/** Steppers: 44px square buttons, an ink hover, the warm focus colour. */
const stepperCls = cn(
  'min-h-11 focus-within:ring-border-focus',
  '[&>button]:w-11 [&>button]:hover:bg-surface [&>button]:hover:text-text-primary',
  '[&>button]:focus-visible:ring-border-focus',
);

/** Checkbox box: ink when checked, with a cream tick. */
const inkBoxCls = cn(
  'text-surface',
  'data-[checked]:border-text-primary data-[checked]:bg-text-primary',
  'focus-visible:ring-border-focus',
);

/** The picker trigger, dressed as the form's other controls. */
const dateTriggerCls = cn(
  'min-h-11 rounded-fw-sm border-border-control bg-surface-sunken',
  'hover:border-text-tertiary hover:bg-surface-sunken',
  'data-[state=open]:border-border-focus data-[state=open]:bg-surface-sunken',
  'focus-visible:outline-border-focus',
);

/* ========================================================================== */

export function FairwayNewQualifier({ players }: FairwayNewQualifierProps) {
  const router = useRouter();
  const uid = React.useId();
  const idFor = (key: string) => `${uid}-${key}`;

  // The viewer's local day, read AFTER mount. Computed during render it ran
  // on the server too, whose day (UTC on Vercel) differs from the viewer's
  // for hours every evening (audit HYD-07). Until mount the pickers allow any
  // day; the server re-validates dates anyway.
  const [today, setToday] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    setToday(localDayIso());
  }, []);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [courseName, setCourseName] = React.useState('');
  const [rules, setRules] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [entryDeadline, setEntryDeadline] = React.useState('');
  const [slotsTotal, setSlotsTotal] = React.useState<number | null>(5);
  const [coachPick, setCoachPick] = React.useState<number | null>(1);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState('');

  // Feature G: the round cap and the course assigned to each round.
  const [numRounds, setNumRounds] = React.useState<number | null>(1);
  const [singleRoundConfirmed, setSingleRoundConfirmed] = React.useState(false);
  const [roundCourses, setRoundCourses] = React.useState<RoundCourseDraft[]>([]);
  // Which round's course picker is open (null = closed).
  const [pickerRound, setPickerRound] = React.useState<number | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<FormError | null>(null);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const startRef = React.useRef<HTMLButtonElement>(null);
  const endRef = React.useRef<HTMLButtonElement>(null);
  const deadlineRef = React.useRef<HTMLButtonElement>(null);
  const capRef = React.useRef<HTMLButtonElement>(null);

  // Derived squad model (the leaderboard's cut-line vocabulary). A cleared
  // squad size falls back to the DB default of 5, and the summary says so.
  const total = slotsTotal && slotsTotal > 0 ? slotsTotal : 5;
  const picks = Math.min(Math.max(coachPick ?? 0, 0), total);

  // Feature G: a coherent round count, and a course list for it.
  const rounds = numRounds && numRounds > 0 ? Math.min(numRounds, 50) : 1;
  const isMultiRound = rounds > 1;
  const capSet = isMultiRound || singleRoundConfirmed;
  const courseFor = (roundNumber: number): RoundCourseDraft | undefined =>
    roundCourses.find((rc) => rc.roundNumber === roundNumber);

  const assignRoundCourse = (
    roundNumber: number,
    course: { courseId: string; courseName: string; teeId: string },
  ) => {
    setRoundCourses((prev) => {
      const next = prev.filter((rc) => rc.roundNumber !== roundNumber);
      next.push({
        roundNumber,
        courseId: course.courseId,
        courseName: course.courseName,
        teeId: course.teeId,
      });
      return next.sort((a, b) => a.roundNumber - b.roundNumber);
    });
  };

  const clearRoundCourse = (roundNumber: number) =>
    setRoundCourses((prev) => prev.filter((rc) => rc.roundNumber !== roundNumber));

  // Cross-date validation (mirrors the Zod .refine in golfQualifierSchema):
  // the end cannot precede the start, and players confirm in on or before
  // the start. The pickers disable those days, so these fire only when the
  // start moves after the other date was set. Each shows on its own field.
  const endDateError =
    endDate && startDate && endDate < startDate ? 'End date cannot be before the start date.' : null;
  const entryDeadlineError =
    entryDeadline && startDate && entryDeadline > startDate
      ? 'Entry deadline must be on or before the start date.'
      : null;

  const todayDate = today ? isoToDate(today) : undefined;
  const startDateObj = startDate ? isoToDate(startDate) : undefined;
  const thisYear = today ? Number(today.slice(0, 4)) : null;

  // A blocked submit's message stays until its cause is fixed; a server error
  // stays until the next submit.
  const shownError: FormError | null = (() => {
    if (!error) return null;
    switch (error.field) {
      case 'name':
        return name.trim() ? null : error;
      case 'startDate':
        return startDate ? null : error;
      case 'endDate':
        return endDateError ? error : null;
      case 'entryDeadline':
        return entryDeadlineError ? error : null;
      case 'roundCap':
        return capSet ? null : error;
      default:
        return error;
    }
  })();
  const capErrorId = idFor('cap-error');
  const capError = shownError?.field === 'roundCap' ? shownError.message : null;

  // Roster, narrowed by the find box.
  const q = query.trim().toLowerCase();
  const visiblePlayers = q
    ? players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    : players;
  const allShownSelected =
    visiblePlayers.length > 0 && visiblePlayers.every((p) => selected.includes(p.id));
  const selectShown = () =>
    setSelected((prev) => Array.from(new Set([...prev, ...visiblePlayers.map((p) => p.id)])));
  const enteredPlayers = players.filter((p) => selected.includes(p.id));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    const fail = (field: ErrorField, message: string, control: HTMLElement | null) => {
      setError({ field, message });
      focusControl(control);
    };
    // A blank or all-spaces name never gets here: the field is `required`
    // and its `validate` rejects spaces, so Base UI blocks the submit, marks
    // the field and focuses it. This is the backstop.
    if (!name.trim()) return fail('name', NAME_REQUIRED, nameRef.current);
    // Document order, so the first problem on the page is the one focused.
    if (!startDate) return fail('startDate', START_REQUIRED, startRef.current);
    if (endDateError) return fail('endDate', endDateError, endRef.current);
    if (entryDeadlineError) return fail('entryDeadline', entryDeadlineError, deadlineRef.current);
    if (!capSet) return fail('roundCap', CAP_REQUIRED, capRef.current);

    setLoading(true);
    setError(null);
    try {
      const result = await createGolfQualifier({
        name: name.trim(),
        description: description.trim() || undefined,
        courseName: courseName.trim() || undefined,
        rules: rules.trim() || undefined,
        entryDeadline: entryDeadline || undefined,
        startDate,
        endDate: endDate || undefined,
        playerIds: selected,
        selectionSlotsTotal: total,
        selectionSlotsCoachPick: picks,
        // Feature G: the round cap, plus a course per round when the coach
        // split the qualifier across rounds. The venue ("Course") goes as
        // `courseName` at any round count; it is visible at every count.
        numRounds: rounds,
        roundCourses: isMultiRound
          ? roundCourses
              .filter((rc) => rc.roundNumber <= rounds)
              .map((rc) => ({
                roundNumber: rc.roundNumber,
                courseId: rc.courseId,
                courseName: rc.courseName,
                teeId: rc.teeId,
              }))
          : undefined,
      });

      if (!result.success) {
        setError({ field: null, message: result.error });
        setLoading(false);
        return;
      }
      router.push('/golf/dashboard/qualifiers');
      router.refresh();
    } catch {
      setError({ field: null, message: "Couldn't create the qualifier. Check your connection and try again." });
      setLoading(false);
    }
  };

  const checklist = [
    { key: 'name', label: 'Name', done: Boolean(name.trim()) },
    { key: 'start', label: 'Start date', done: Boolean(startDate) && !endDateError && !entryDeadlineError },
    { key: 'cap', label: isMultiRound ? `${rounds}-round cap` : 'One-round cap', done: capSet },
  ];
  const nextStep = !name.trim()
    ? 'Next: name it'
    : !startDate
      ? 'Next: pick a start date'
      : endDateError || entryDeadlineError
        ? 'Next: fix the dates'
        : !capSet
          ? 'Next: confirm the one-round cap'
          : null;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-6 md:py-8">
      <ViewHeader
        eyebrow="Coach · New qualifier"
        title="Create a qualifier."
        description="Set the dates, the format and the travel squad, then enter the players."
        fullDescription
      />

      <Form
        spacing="cozy"
        onSubmit={handleSubmit}
        className={cn(
          'mt-6 md:mt-8',
          // From md the summary is a rail beside the sections (grid lines,
          // never CSS order, so the DOM stays sections, then summary).
          'md:grid md:grid-cols-[minmax(0,1fr)_15.5rem] md:items-start md:gap-6',
          'lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-8',
          // On a phone a focused field must land clear of the tray and the
          // tab bar below it (WCAG 2.2 SC 2.4.11).
          'max-md:[&_input]:scroll-mb-44 max-md:[&_textarea]:scroll-mb-44 max-md:[&_button]:scroll-mb-44',
        )}
      >
        <div className="flex min-w-0 flex-col gap-5 [container-type:inline-size] md:col-start-1">
          {/* ── 1 · The basics ──────────────────────────────────────────── */}
          <SectionCard
            step={1}
            headingId={idFor('basics')}
            title="The basics"
            description="Name it and tell players what to expect."
            done={Boolean(name.trim())}
          >
            <FormField
              label="Qualifier name"
              required
              // `required` catches an empty name; this catches all spaces,
              // which `required` lets through and the server would reject.
              validate={(value) =>
                typeof value === 'string' && value.length > 0 && !value.trim() ? NAME_REQUIRED : null
              }
            >
              <Input
                ref={nameRef}
                name="name"
                size="lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Travel Qualifier"
                autoComplete="off"
                maxLength={200}
                required
                className={textFocusCls}
              />
            </FormField>
            <FormField label="Description" showOptional help="The format, the stakes, anything players should know.">
              <TextArea
                name="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Three 18-hole rounds at home. The lowest total makes the spring travel team."
                maxLength={2000}
                className={textFocusCls}
              />
            </FormField>
          </SectionCard>

          {/* ── 2 · When it runs ────────────────────────────────────────── */}
          <SectionCard
            step={2}
            headingId={idFor('when')}
            title="When it runs"
            description="The dates put it on the team calendar. It stays open until you close it."
            done={Boolean(startDate) && !endDateError && !entryDeadlineError}
          >
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 [@container(min-width:440px)]:grid-cols-2 [@container(min-width:700px)]:grid-cols-3">
              <DateField
                ref={startRef}
                id={idFor('start')}
                label="Start date"
                required
                value={startDate}
                onChange={setStartDate}
                placeholder="Pick a date"
                thisYear={thisYear}
                disabledDays={todayDate ? { before: todayDate } : undefined}
                error={shownError?.field === 'startDate' ? shownError.message : null}
              />
              <DateField
                ref={endRef}
                id={idFor('end')}
                label="End date"
                value={endDate}
                onChange={setEndDate}
                placeholder="Not set"
                clearable
                thisYear={thisYear}
                help="For a qualifier played over several days."
                disabledDays={
                  startDateObj ? { before: startDateObj } : todayDate ? { before: todayDate } : undefined
                }
                defaultMonth={startDateObj}
                error={endDateError}
              />
              <DateField
                ref={deadlineRef}
                id={idFor('deadline')}
                label="Entry deadline"
                value={entryDeadline}
                onChange={setEntryDeadline}
                placeholder="Not set"
                clearable
                thisYear={thisYear}
                help="When players should confirm in, on or before the start."
                disabledDays={[
                  ...(todayDate ? [{ before: todayDate }] : []),
                  ...(startDateObj ? [{ after: startDateObj }] : []),
                ]}
                defaultMonth={startDateObj}
                error={entryDeadlineError}
              />
            </div>

            {startDate && !endDateError ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-fw-md bg-surface-sunken px-3.5 py-3 font-fw-sans text-body-sm text-text-secondary">
                <CalendarDays className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
                <span className="font-semibold tabular-nums text-text-primary">
                  {formatWindow(startDate, endDate, thisYear)}
                </span>
                {endDate && endDate > startDate ? (
                  <span className="tabular-nums">· {dayDiff(startDate, endDate) + 1} days</span>
                ) : null}
                {today && startsIn(today, startDate) ? (
                  <span className="tabular-nums">· {startsIn(today, startDate)}</span>
                ) : null}
              </p>
            ) : null}
          </SectionCard>

          {/* ── 3 · Format ──────────────────────────────────────────────── */}
          <SectionCard
            step={3}
            headingId={idFor('format')}
            title="Format"
            description="The round cap, where it's played and how it's scored."
            done={capSet}
          >
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 [@container(min-width:440px)]:grid-cols-2">
              <FormField label="Rounds" help="18-hole rounds each player can post. The cap is enforced.">
                <NumberField
                  value={numRounds}
                  onValueChange={(value) => {
                    setNumRounds(value);
                    setSingleRoundConfirmed(false);
                  }}
                  min={1}
                  max={50}
                  unit={rounds === 1 ? 'round' : 'rounds'}
                  className={stepperCls}
                />
              </FormField>
              <FormField
                label="Course"
                showOptional
                help={
                  isMultiRound
                    ? 'The home venue. Set a course per round below if they differ.'
                    : "Where it's played."
                }
              >
                <Input
                  name="courseName"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. Lions Municipal Golf Course"
                  maxLength={200}
                  className={cn('min-h-11', textFocusCls)}
                />
              </FormField>
            </div>

            {rounds === 1 ? (
              <div
                className={cn(
                  'rounded-fw-md border bg-surface-sunken px-3.5 py-2.5',
                  'transition-colors duration-200 motion-reduce:transition-none',
                  capError ? 'border-fw-danger/60' : 'border-transparent',
                )}
              >
                <CheckboxGroup
                  value={singleRoundConfirmed ? ['confirmed'] : []}
                  onValueChange={(value) => setSingleRoundConfirmed(value.includes('confirmed'))}
                >
                  <Checkbox
                    ref={capRef}
                    value="confirmed"
                    aria-label="This qualifier intentionally allows one 18-hole round"
                    aria-describedby={capError ? capErrorId : undefined}
                    label="This qualifier intentionally allows one 18-hole round."
                    description="Players who finish it cannot enter another qualifier round unless you raise the cap."
                    boxClassName={inkBoxCls}
                  />
                </CheckboxGroup>
                {capError ? (
                  <p id={capErrorId} className={cn(errorClasses, 'pb-1 pt-1.5')}>
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{capError}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {isMultiRound ? (
              <div role="group" aria-labelledby={idFor('per-round')} className="flex flex-col gap-2">
                <div>
                  <p id={idFor('per-round')} className={labelClasses}>
                    <span>Course per round</span>
                    <span className={optionalTagClasses}>Optional</span>
                  </p>
                  <p className={cn(helpClasses, 'mt-0.5')}>Players see each round&rsquo;s course on the qualifier.</p>
                </div>
                <ol className="flex flex-col gap-2">
                  {Array.from({ length: rounds }, (_, i) => i + 1).map((roundNumber) => {
                    const assigned = courseFor(roundNumber);
                    return (
                      <li
                        key={roundNumber}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-fw-md bg-surface-sunken px-3 py-2.5"
                      >
                        <span
                          aria-hidden
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-text-primary font-fw-sans text-caption font-semibold tabular-nums text-surface"
                        >
                          {roundNumber}
                        </span>
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="font-fw-sans text-caption font-semibold text-text-secondary">
                            Round {roundNumber}
                          </p>
                          <p
                            className={cn(
                              'break-words font-fw-sans text-body-sm',
                              assigned?.courseName ? 'font-medium text-text-primary' : 'text-text-tertiary',
                            )}
                          >
                            {assigned?.courseName ?? 'No course yet'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {assigned ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => clearRoundCourse(roundNumber)}
                              aria-label={`Clear the round ${roundNumber} course`}
                              className="hover:bg-surface"
                            >
                              Clear
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leftIcon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
                            onClick={() => setPickerRound(roundNumber)}
                            aria-label={
                              assigned ? `Change the round ${roundNumber} course` : `Pick a course for round ${roundNumber}`
                            }
                          >
                            {assigned ? 'Change' : 'Pick course'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            <FormField
              label="Scoring rules"
              showOptional
              help="Shown on the qualifier page, e.g. the tiebreak and which rounds count."
            >
              <TextArea
                name="rules"
                rows={2}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Lowest total over all rounds. Ties go to the better final round."
                maxLength={5000}
                className={textFocusCls}
              />
            </FormField>
          </SectionCard>

          {/* ── 4 · Travel squad ────────────────────────────────────────── */}
          <SectionCard
            step={4}
            headingId={idFor('squad')}
            title="Travel squad"
            description="How the players who make the trip are decided."
          >
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 [@container(min-width:440px)]:grid-cols-2">
              <FormField label="Squad size" help="Players who make the trip.">
                <NumberField
                  value={slotsTotal}
                  onValueChange={(value) => {
                    setSlotsTotal(value);
                    // Keep the picks field honest: it can never show more
                    // picks than the squad holds (the payload clamps too).
                    if (value != null && value > 0) {
                      setCoachPick((p) => (p != null && p > value ? value : p));
                    }
                  }}
                  min={1}
                  max={50}
                  unit={total === 1 ? 'player' : 'players'}
                  className={stepperCls}
                />
              </FormField>
              <FormField label="Coach's picks" help="Spots you fill yourself.">
                <NumberField
                  value={coachPick}
                  onValueChange={setCoachPick}
                  min={0}
                  max={total}
                  unit={picks === 1 ? 'pick' : 'picks'}
                  className={stepperCls}
                />
              </FormField>
            </div>
            <SquadSeats total={total} picks={picks} />
          </SectionCard>

          {/* ── 5 · Players ─────────────────────────────────────────────── */}
          <SectionCard
            step={5}
            headingId={idFor('players')}
            title="Players"
            description="Everyone you enter is notified and can post rounds to it."
            meta={
              players.length > 0 ? (
                <span className="font-fw-sans text-caption font-semibold tabular-nums text-text-secondary">
                  {selected.length} of {players.length}
                </span>
              ) : null
            }
          >
            {players.length === 0 ? (
              <EmptyState
                variant="subtle"
                icon={Users}
                title="No active players on your roster"
                description="Add players to your team first, then enter them into a qualifier."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/golf/dashboard/roster">Go to the roster</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  {players.length > SEARCH_FROM ? (
                    <FormField label="Find a player" labelClassName="sr-only" className="min-w-0 flex-1 basis-56">
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        // Enter in a search box must never submit the qualifier.
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        placeholder="Find a player"
                        autoComplete="off"
                        leading={<Search />}
                        className="min-h-11 focus-within:ring-border-focus"
                      />
                    </FormField>
                  ) : null}
                  <div className="ml-auto flex min-h-11 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectShown}
                      disabled={allShownSelected}
                    >
                      {q ? `Select ${visiblePlayers.length} shown` : 'Select all'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected([])}
                      disabled={selected.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* #1270: this MUST stay a CheckboxGroup, not a bare <div> of
                    <Checkbox>es. Base UI's Checkbox calls `useField({ enabled:
                    !groupContext })`, so an ungrouped checkbox registers itself
                    with the enclosing <Form>. Outside a Field.Root its validity
                    is `null`, Form's submit handler rejects `!valid`, and
                    "Create qualifier" did nothing, with no error anywhere.
                    Inside a group, `enabled` is false and nothing registers. */}
                <CheckboxGroup
                  value={selected}
                  onValueChange={(next) => setSelected(next)}
                  className="grid grid-cols-1 gap-2 [@container(min-width:440px)]:grid-cols-2 [@container(min-width:680px)]:grid-cols-3"
                >
                  {visiblePlayers.map((p) => {
                    const isSel = selected.includes(p.id);
                    const playerName = `${p.first_name} ${p.last_name}`.trim() || 'Player';
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          'flex min-h-14 cursor-pointer items-center rounded-fw-md border px-3 py-2',
                          'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none',
                          fwPressSurface,
                          isSel
                            ? 'border-border-strong bg-elevated shadow-soft'
                            : 'border-transparent bg-surface-sunken hover:border-border-subtle',
                        )}
                      >
                        {/* The shared identity, so an entered player reads the
                            same here as on the roster. Not inside a FormField,
                            so Base UI never hands the checkbox a labelId: it
                            would have NO accessible name although the name sits
                            beside it (P192). The aria-label makes it certain. */}
                        <PlayerIdentity
                          name={playerName}
                          avatarUrl={p.avatar_url ?? null}
                          identityKey={p.id}
                          size="md"
                          className="flex-1"
                          nameClassName={cn('whitespace-normal break-words', isSel && 'font-semibold')}
                          trailing={<Checkbox value={p.id} aria-label={playerName} boxClassName={inkBoxCls} />}
                        />
                      </label>
                    );
                  })}
                </CheckboxGroup>

                {q && visiblePlayers.length === 0 ? (
                  <p className="font-fw-sans text-body-sm text-text-secondary">
                    No player on the roster matches &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : null}
              </>
            )}
          </SectionCard>

          <div className="flex justify-center md:hidden">
            <Button asChild variant="ghost">
              <Link href="/golf/dashboard/qualifiers">Cancel</Link>
            </Button>
          </div>
        </div>

        <SummaryPanel
          headingId={idFor('summary')}
          name={name.trim()}
          windowLabel={startDate ? formatWindow(startDate, endDateError ? '' : endDate, thisYear) : null}
          deadlineLabel={entryDeadline && !entryDeadlineError ? formatDay(entryDeadline, thisYear) : null}
          rounds={rounds}
          total={total}
          picks={picks}
          entered={enteredPlayers}
          rosterSize={players.length}
          checklist={checklist}
          nextStep={nextStep}
          // Field problems show at their field; the panel carries the rest.
          // The name's own message is Base UI's, so the backstop above (never
          // expected to fire) speaks here rather than block in silence.
          error={shownError && (shownError.field === null || shownError.field === 'name') ? shownError.message : null}
          loading={loading}
        />
      </Form>

      {/* The SAME cloud course catalog picker the new-round flow uses. */}
      <FairwayCoursePicker
        // Coach-only route (qualifiers/new renders a notice for a non-coach),
        // so the library-management affordances are safe to show here.
        canManageLibrary
        open={pickerRound !== null}
        onOpenChange={(open) => {
          if (!open) setPickerRound(null);
        }}
        onPick={(defaults) => {
          if (pickerRound !== null) {
            assignRoundCourse(pickerRound, {
              courseId: defaults.courseId,
              courseName: defaults.courseName,
              teeId: defaults.teeId,
            });
          }
          setPickerRound(null);
        }}
      />
    </div>
  );
}

/* ========================================================================== */
/* Section card                                                               */
/* ========================================================================== */

/**
 * One section: a sunken header band (step, title, one line of purpose) over a
 * strong rule, then the fields. The band's h2 names the fieldset, so the group
 * keeps its accessible name without FormSection's display-size legend.
 */
function SectionCard({
  step,
  headingId,
  title,
  description,
  done = false,
  meta,
  children,
}: {
  step: number;
  headingId: string;
  title: string;
  description: string;
  /** A section with required input ticks its step once that input is in. */
  done?: boolean;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface padding="none" className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border-strong bg-surface-sunken px-4 py-3 sm:px-5">
        <span
          aria-hidden
          className={cn(
            'mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full font-fw-sans text-caption font-semibold tabular-nums',
            'transition-colors duration-200 motion-reduce:transition-none',
            done ? 'bg-text-primary text-surface' : 'border border-border-strong bg-elevated text-text-primary',
          )}
        >
          {done ? <Check className="h-3.5 w-3.5 motion-safe:animate-check-bounce" strokeWidth={2.5} /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-fw-sans text-body font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">{description}</p>
        </div>
        {meta ? <div className="shrink-0 pt-1">{meta}</div> : null}
      </div>
      <FormSection aria-labelledby={headingId} className="p-4 sm:p-5">
        {children}
      </FormSection>
    </Surface>
  );
}

/* ========================================================================== */
/* Date field                                                                 */
/* ========================================================================== */

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  thisYear: number | null;
  required?: boolean;
  /** Offer a clear button once a date is set (optional dates). */
  clearable?: boolean;
  help?: string;
  error?: string | null;
  disabledDays?: Matcher | Matcher[];
  defaultMonth?: Date;
}

/**
 * The Fairway DatePicker with the form's label and message row. The picker is
 * not a Base UI Field control, so it sits outside FormField (a Field.Root with
 * nothing registered adds nothing) and wires its own label and description.
 * Its value goes in and out as "YYYY-MM-DD" built from LOCAL parts:
 * toISOString() would move the day for anyone west of UTC. Picking from a
 * calendar also ends the typed five-digit years the OS date input let through.
 */
const DateField = React.forwardRef<HTMLButtonElement, DateFieldProps>(function DateField(
  {
    id,
    label,
    value,
    onChange,
    placeholder,
    thisYear,
    required = false,
    clearable = false,
    help,
    error,
    disabledDays,
    defaultMonth,
  },
  ref,
) {
  const selected = value ? isoToDate(value) : undefined;
  const messageId = `${id}-message`;

  return (
    <div className="flex min-w-0 flex-col" data-slot="qualifier-date-field">
      <label htmlFor={id} className={cn(labelClasses, 'mb-1.5')}>
        <span>{label}</span>
        {required ? (
          <span aria-hidden className={requiredMarkClasses}>
            *
          </span>
        ) : (
          <span className={optionalTagClasses}>Optional</span>
        )}
      </label>
      <div className="relative">
        <DatePicker
          ref={ref}
          id={id}
          mode="single"
          value={selected}
          onValueChange={(d) => onChange(d ? localDayIso(d) : '')}
          // The chosen day is part of the name, so a screen reader hears it
          // without opening the calendar.
          aria-label={selected ? `${label}, ${format(selected, 'EEEE, MMMM d, yyyy')}` : label}
          aria-describedby={error || help ? messageId : undefined}
          placeholder={placeholder}
          renderLabel={(d) => (d && value ? formatDay(value, thisYear) : null)}
          disabledDays={disabledDays}
          defaultMonth={defaultMonth}
          className={cn(dateTriggerCls, error && 'border-fw-danger/60', clearable && value && 'pr-12')}
        />
        {clearable && value ? (
          <IconButton
            aria-label={`Clear the ${label.toLowerCase()}`}
            size="sm"
            variant="ghost"
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0.5 my-auto hover:bg-surface"
          >
            <X aria-hidden />
          </IconButton>
        ) : null}
      </div>
      <div className={messageRowClasses}>
        {error ? (
          <p id={messageId} className={errorClasses}>
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : help ? (
          <p id={messageId} className={helpClasses}>
            {help}
          </p>
        ) : null}
      </div>
    </div>
  );
});

/* ========================================================================== */
/* Squad seats                                                                */
/* ========================================================================== */

/**
 * The travel squad as seats: ink seats numbered in score order for the places
 * won on score, dashed seats with a star for the coach's picks. A squad too
 * big to draw folds each kind into a "+N" chip, so the picks always show. The
 * line under the strip says the same in words, live, for everyone.
 */
function SquadSeats({ total, picks }: { total: number; picks: number }) {
  const onScore = total - picks;
  const pickSeats = Math.min(picks, MAX_SEATS);
  const scoreSeats = Math.min(onScore, MAX_SEATS - pickSeats);
  const hiddenScore = onScore - scoreSeats;
  const hiddenPicks = picks - pickSeats;
  const seat = 'grid h-8 w-8 place-items-center rounded-full font-fw-sans text-caption font-semibold tabular-nums';
  const more =
    'grid h-8 min-w-8 place-items-center rounded-full border border-border-strong bg-surface px-2 font-fw-sans text-caption font-semibold tabular-nums text-text-secondary';

  return (
    <div className="rounded-fw-md bg-surface-sunken p-3.5">
      <p className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
        {total}-player travel squad
      </p>
      <div aria-hidden className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: scoreSeats }, (_, i) => (
          <span
            key={`score-${i}`}
            className={cn(seat, 'bg-text-primary text-surface motion-safe:animate-scale-in')}
          >
            {i + 1}
          </span>
        ))}
        {hiddenScore > 0 ? <span className={more}>+{hiddenScore}</span> : null}
        {Array.from({ length: pickSeats }, (_, i) => (
          <span
            key={`pick-${i}`}
            className={cn(
              seat,
              'border-2 border-dashed border-text-secondary bg-surface text-text-secondary motion-safe:animate-scale-in',
            )}
          >
            <Star className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        ))}
        {hiddenPicks > 0 ? <span className={more}>+{hiddenPicks}</span> : null}
      </div>
      <p aria-live="polite" className="mt-3 font-fw-sans text-body-sm text-text-secondary">
        {squadSplit(total, picks)}.
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Summary: a tray on a phone, a rail from md                                 */
/* ========================================================================== */

interface SummaryPanelProps {
  headingId: string;
  name: string;
  windowLabel: string | null;
  deadlineLabel: string | null;
  rounds: number;
  total: number;
  picks: number;
  entered: Player[];
  rosterSize: number;
  checklist: Array<{ key: string; label: string; done: boolean }>;
  nextStep: string | null;
  error: string | null;
  loading: boolean;
}

/**
 * The qualifier as it will read, beside the one Create button. ONE element in
 * both layouts, so there is exactly one submit button in the DOM: below `md`
 * it pins above the tab bar as a compact tray (name, the next thing to do,
 * Create); from `md` the grid places it in the rail column and it pins under
 * the top bar and the hub strip, clear of the launcher in the bottom corner.
 */
function SummaryPanel({
  headingId,
  name,
  windowLabel,
  deadlineLabel,
  rounds,
  total,
  picks,
  entered,
  rosterSize,
  checklist,
  nextStep,
  error,
  loading,
}: SummaryPanelProps) {
  const ready = checklist.every((c) => c.done);
  const trayLine =
    nextStep ?? `${rounds} ${rounds === 1 ? 'round' : 'rounds'} · ${total}-player squad · ${entered.length} entered`;

  return (
    <aside
      aria-labelledby={headingId}
      className={cn(
        'sticky bottom-[var(--golf-mobile-bottom-nav-offset,0px)] z-[var(--fw-z-sticky)] -mx-1 mt-5',
        'md:bottom-auto md:top-[calc(var(--golf-mobile-header-offset,0px)+var(--fw-hub-subnav-offset,0px)+1.5rem)]',
        'md:col-start-2 md:row-start-1 md:mx-0 md:mt-0 md:self-start',
      )}
    >
      <div
        className={cn(
          'overflow-y-auto rounded-card border border-border-subtle bg-surface shadow-raise',
          'md:max-h-[calc(100dvh-var(--golf-mobile-header-offset,0px)-var(--fw-hub-subnav-offset,0px)-3rem)] md:shadow-soft',
        )}
      >
        {/* The rail: its band, the qualifier as it will read, the checklist. */}
        <div className="border-b border-border-strong bg-surface-sunken px-4 py-3 max-md:sr-only">
          <h2 id={headingId} className="font-fw-sans text-body font-semibold text-text-primary">
            Summary
          </h2>
        </div>
        <div className="hidden md:block">
          <div className="px-4 pt-4">
            <p className={cn('break-words font-fw-display text-h3', name ? 'text-text-primary' : 'text-text-tertiary')}>
              {name || 'Untitled qualifier'}
            </p>
            <p className="mt-1 font-fw-sans text-body-sm tabular-nums text-text-secondary">
              {windowLabel ?? 'No dates yet'}
            </p>
          </div>
          <dl className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4">
            <SummaryRow label="Rounds" value={`${rounds} × 18 holes`} />
            <SummaryRow label="Travel squad" value={`${total} players`} detail={squadSplit(total, picks)} />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="shrink-0 font-fw-sans text-caption text-text-tertiary">Players</dt>
              <dd className="flex min-w-0 items-center gap-2">
                {entered.length > 0 ? (
                  <span aria-hidden>
                    <AvatarGroup size="xs" max={4} ring="ring-surface">
                      {entered.map((p) => (
                        <Avatar
                          key={p.id}
                          src={p.avatar_url ?? null}
                          name={`${p.first_name} ${p.last_name}`}
                          identityKey={p.id}
                          size="xs"
                          decorative
                        />
                      ))}
                    </AvatarGroup>
                  </span>
                ) : null}
                <span className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
                  {entered.length} of {rosterSize}
                </span>
              </dd>
            </div>
            {deadlineLabel ? <SummaryRow label="Entry deadline" value={deadlineLabel} /> : null}
          </dl>
          <div className="px-4 pt-3">
            <p className="font-fw-sans text-caption font-semibold text-text-secondary">
              {ready ? 'Ready to create' : 'Before you create'}
            </p>
            <ul className="mt-2 space-y-1.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-2 font-fw-sans text-body-sm">
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full',
                      'transition-colors duration-200 motion-reduce:transition-none',
                      item.done ? 'bg-text-primary text-surface' : 'border border-border-strong bg-surface',
                    )}
                  >
                    {item.done ? <Check className="h-3 w-3 motion-safe:animate-check-bounce" strokeWidth={3} /> : null}
                  </span>
                  <span className={item.done ? 'text-text-primary' : 'text-text-secondary'}>
                    {item.label}
                    <span className="sr-only">{item.done ? ', done' : ', still needed'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-3 mt-3 flex items-start gap-2 rounded-fw-md border border-fw-danger/40 bg-fw-danger-bg px-3 py-2 font-fw-sans text-body-sm font-medium text-fw-danger-ink md:mx-4"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="flex items-center gap-3 p-2 pl-4 md:flex-col md:items-stretch md:gap-2 md:p-4">
          {/* The tray: what this is and what's next. */}
          <div className="min-w-0 flex-1 md:hidden">
            <p
              className={cn(
                'line-clamp-2 break-words font-fw-sans text-body-sm font-semibold',
                name ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {name || 'New qualifier'}
            </p>
            <p className="font-fw-sans text-caption tabular-nums text-text-secondary">{trayLine}</p>
          </div>
          <Button type="submit" variant="primary" busy={loading} className="shrink-0 md:w-full">
            Create qualifier
          </Button>
          <Button asChild variant="ghost" className="hidden md:inline-flex md:w-full">
            <Link href="/golf/dashboard/qualifiers">Cancel</Link>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="shrink-0 font-fw-sans text-caption text-text-tertiary">{label}</dt>
      <dd className="min-w-0 text-right font-fw-sans">
        <span className="block text-body-sm font-semibold tabular-nums text-text-primary">{value}</span>
        {detail ? <span className="block text-caption tabular-nums text-text-secondary">{detail}</span> : null}
      </dd>
    </div>
  );
}
