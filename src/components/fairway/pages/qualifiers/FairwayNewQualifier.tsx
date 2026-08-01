'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayNewQualifier  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the COACH /golf/dashboard/qualifiers/new route — the
 * create-qualifier form. A presentation rebuild on the Fairway form primitives;
 * the create logic is reused VERBATIM via `createGolfQualifier` (same import
 * path, same input contract).
 *
 * COMPLETES THE COLLEGE-QUALIFIER STORY: beyond the legacy fields, the coach can
 * now set the travel-squad model the leaderboard reads —
 *   • selectionSlotsTotal     — how many players make the trip
 *   • selectionSlotsCoachPick  — how many of those are the coach's discretion
 * (the remainder auto-qualify on score). Both are OPTIONAL on the action and
 * fall back to the DB defaults (5 total / 1 pick) when omitted, so the legacy
 * flag-off path stays byte-identical. A live read-out mirrors the leaderboard
 * vocabulary ("Top N auto-qualify · M coach pick · S-player squad").
 *
 * Tokens / primitives ONLY. No glass / warm-* / blur.
 * ========================================================================== */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import {
  ViewHeader,
  Surface,
  Button,
  InlineNotice,
  EmptyState,
  Form,
  FormSection,
  FormField,
  Input,
  TextArea,
  NumberField,
  Checkbox,
  PlayerIdentity,
} from '@/components/fairway';
import { Users, Flag, MapPin } from 'lucide-react';
import { createGolfQualifier } from '@/app/golf/actions/golf';
// Reuse the SAME cloud course catalog picker the new-round flow uses (Stage A
// course shelves → Stage B tee). We only need the picked course/tee identity, so
// we read courseId / courseName / teeId off the returned TeeRoundDefaults.
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';

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
}

export interface FairwayNewQualifierProps {
  players: Player[];
}

const todayISO = () => new Date().toISOString().split('T')[0] as string;

export function FairwayNewQualifier({ players }: FairwayNewQualifierProps) {
  const router = useRouter();
  const today = useMemo(todayISO, []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [courseName, setCourseName] = useState('');
  const [rules, setRules] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [entryDeadline, setEntryDeadline] = useState('');
  const [slotsTotal, setSlotsTotal] = useState<number | null>(5);
  const [coachPick, setCoachPick] = useState<number | null>(1);
  const [selected, setSelected] = useState<string[]>([]);

  // Feature G — number of rounds + the course assigned to each.
  const [numRounds, setNumRounds] = useState<number | null>(1);
  const [roundCourses, setRoundCourses] = useState<RoundCourseDraft[]>([]);
  // Which round's course-picker is open (null = closed).
  const [pickerRound, setPickerRound] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived squad model (mirrors the leaderboard cut-line vocabulary).
  const total = slotsTotal && slotsTotal > 0 ? slotsTotal : 5;
  const picks = Math.min(Math.max(coachPick ?? 0, 0), total);
  const autoQualify = total - picks;

  // Feature G — coherent round count, and a per-round course list for it.
  const rounds = numRounds && numRounds > 0 ? Math.min(numRounds, 50) : 1;
  const isMultiRound = rounds > 1;
  const courseFor = (roundNumber: number): RoundCourseDraft | undefined =>
    roundCourses.find((rc) => rc.roundNumber === roundNumber);

  // Apply a picked course (from the shared FairwayCoursePicker) to one round.
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

  // Cross-date validation (mirrors the Zod .refine in golfQualifierSchema).
  // The window must be coherent: end >= start, and players must confirm in
  // BEFORE play opens, so the entry deadline cannot fall after the start.
  // Surface each error inline on its own field rather than as one top error.
  const endDateError =
    endDate && startDate && endDate < startDate
      ? 'End date cannot be before the start date.'
      : null;
  const entryDeadlineError =
    entryDeadline && startDate && entryDeadline > startDate
      ? 'Entry deadline must be on or before the start date.'
      : null;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const selectAll = () => setSelected(players.map((p) => p.id));
  const clearAll = () => setSelected([]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    if (!name.trim()) {
      setError('Give the qualifier a name.');
      return;
    }
    if (!startDate) {
      setError('Pick a start date.');
      return;
    }
    // Block incoherent windows up front — the inline field errors already
    // explain what's wrong, so keep the top notice quiet here.
    if (endDateError || entryDeadlineError) {
      setError('Fix the highlighted dates before creating the qualifier.');
      return;
    }
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
        // Feature G — round count + per-round course assignments. For a
        // single-round qualifier the legacy free-text "Course" field still
        // carries the venue, so only attach the per-round courses when the
        // coach has split the qualifier across multiple rounds.
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
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push('/golf/dashboard/qualifiers');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create qualifier.');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Coach · New qualifier"
        title="Create a qualifier."
        description="Pick the window, set the travel squad, and invite the players who'll compete for it."
      />

      <Form spacing="roomy" onSubmit={handleSubmit} className="mt-8">
        {error ? (
          <InlineNotice tone="danger" title="Couldn't create the qualifier">
            {error}
          </InlineNotice>
        ) : null}

        {/* ── Basics ──────────────────────────────────────────────────────── */}
        <FormSection title="Basics" description="Name it and describe the format.">
          <div className="flex flex-col gap-5">
            <FormField label="Qualifier name" required>
              <Input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Travel Qualifier"
                required
              />
            </FormField>
            <FormField label="Description" showOptional help="What players should expect — format, stakes, vibe.">
              <TextArea
                name="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Three 18-hole rounds counting toward a cumulative total…"
              />
            </FormField>
          </div>
        </FormSection>

        {/* ── Schedule ────────────────────────────────────────────────────── */}
        <FormSection title="Schedule" description="When does it run?">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Start date" required>
                <Input
                  type="date"
                  name="startDate"
                  min={today}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </FormField>
              <FormField
                label="End date"
                showOptional
                help="For multi-day qualifiers."
                error={endDateError ?? undefined}
              >
                <Input
                  type="date"
                  name="endDate"
                  min={startDate || today}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-invalid={endDateError ? true : undefined}
                />
              </FormField>
            </div>
            <FormField
              label="Entry deadline"
              showOptional
              help="When players must confirm in — on or before the start date."
              error={entryDeadlineError ?? undefined}
            >
              <Input
                type="date"
                name="entryDeadline"
                min={today}
                max={startDate || undefined}
                value={entryDeadline}
                onChange={(e) => setEntryDeadline(e.target.value)}
                aria-invalid={entryDeadlineError ? true : undefined}
              />
            </FormField>
          </div>
        </FormSection>

        {/* ── Course & rules ──────────────────────────────────────────────── */}
        <FormSection title="Course & rules" description="Where it's played and how it's scored.">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                label="Rounds"
                help="How many rounds count toward this qualifier."
              >
                <NumberField
                  value={numRounds}
                  onValueChange={setNumRounds}
                  min={1}
                  max={50}
                  unit="rounds"
                />
              </FormField>
              {/* Single-round qualifiers keep the simple free-text venue. */}
              {!isMultiRound ? (
                <FormField label="Course" showOptional>
                  <Input
                    name="courseName"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="e.g. Lions Municipal Golf Course"
                  />
                </FormField>
              ) : null}
            </div>

            {/* Multi-round: assign a course to EACH round from the cloud catalog. */}
            {isMultiRound ? (
              <FormField
                label="Course per round"
                help="Pick the course each round is played at — players see it on the qualifier."
              >
                <div className="flex flex-col gap-2.5">
                  {Array.from({ length: rounds }, (_, i) => i + 1).map((roundNumber) => {
                    const assigned = courseFor(roundNumber);
                    return (
                      <div
                        key={roundNumber}
                        className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3.5 py-3"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-tertiary"
                        >
                          <Flag className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                            Round {roundNumber}
                          </p>
                          {assigned?.courseName ? (
                            <p className="line-clamp-2 font-fw-sans text-body font-medium text-text-primary">
                              {assigned.courseName}
                            </p>
                          ) : (
                            <p className="font-fw-sans text-body text-text-tertiary">
                              No course assigned
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {assigned ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => clearRoundCourse(roundNumber)}
                            >
                              Clear
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setPickerRound(roundNumber)}
                          >
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {assigned ? 'Change' : 'Pick course'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormField>
            ) : null}

            <FormField
              label="Scoring rules"
              showOptional
              help="Shown on the qualifier page — e.g. tiebreak order, counted rounds."
            >
              <TextArea
                name="rules"
                rows={2}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff."
              />
            </FormField>
          </div>
        </FormSection>

        {/* ── Travel squad (the college model) ────────────────────────────── */}
        <FormSection
          title="Travel squad"
          description="How the lineup that makes the trip is decided."
        >
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Squad size" help="Total players who make the trip.">
                <NumberField
                  value={slotsTotal}
                  onValueChange={setSlotsTotal}
                  min={1}
                  max={50}
                  unit="players"
                />
              </FormField>
              <FormField label="Coach's picks" help="Discretionary spots within the squad.">
                <NumberField
                  value={coachPick}
                  onValueChange={setCoachPick}
                  min={0}
                  max={total}
                />
              </FormField>
            </div>
            {/* Live read-out — same vocabulary as the leaderboard cut lines. */}
            <Surface elevation="border" padding="md" className="bg-surface-sunken">
              <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                How the squad is set
              </p>
              <p className="mt-1.5 font-fw-sans text-body text-text-secondary">
                <span className="font-medium text-accent-700 tabular-nums">Top {autoQualify}</span>{' '}
                auto-qualify on score
                {picks > 0 ? (
                  <>
                    {' · '}
                    <span className="font-medium text-text-primary tabular-nums">{picks}</span>{' '}
                    coach&rsquo;s {picks === 1 ? 'pick' : 'picks'}
                  </>
                ) : null}
                {' · '}
                <span className="font-medium text-text-primary tabular-nums">{total}</span>-player
                travel squad.
              </p>
            </Surface>
          </div>
        </FormSection>

        {/* ── Players ─────────────────────────────────────────────────────── */}
        <FormSection
          title="Players"
          description={`${selected.length} of ${players.length} selected`}
          action={
            players.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            ) : undefined
          }
        >
          {players.length === 0 ? (
            <Surface elevation="border" padding="none">
              <EmptyState
                variant="subtle"
                icon={Users}
                title="No active players on your roster"
                description="Add players to your team first — then you can enter them into a qualifier."
              />
            </Surface>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {players.map((p) => {
                const isSel = selected.includes(p.id);
                const playerName = `${p.first_name} ${p.last_name}`.trim() || 'Player';
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-fw-md border px-3.5 py-3 transition-colors',
                      isSel
                        ? 'border-accent-300 bg-accent-50/60'
                        : 'border-border-subtle bg-surface hover:border-border-strong',
                    )}
                  >
                    {/* This roster checkbox is NOT wrapped in a FormField (no
                        Field.Root in scope), so Base UI's Checkbox never
                        receives a `labelId` to set `aria-labelledby` from —
                        it renders with an EMPTY accessible name even though a
                        sighted user reads the player's name right next to it
                        (P192). An explicit `aria-label` makes the name
                        authoritative regardless of Field context. */}
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggle(p.id)}
                      aria-label={playerName}
                    />
                    {/* Shared identity (avatar falls back to initials — this
                        roster has no avatar_url) so an entered player reads the
                        same here as on the roster/messages/CoachHelm surfaces;
                        the checkbox stays the selection affordance. */}
                    <PlayerIdentity
                      name={playerName}
                      size="sm"
                      nameClassName={isSel ? 'text-accent-700' : undefined}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </FormSection>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button asChild variant="ghost">
            <Link href="/golf/dashboard/qualifiers">Cancel</Link>
          </Button>
          <Button type="submit" variant="primary" busy={loading} className="min-w-[170px]">
            Create qualifier
          </Button>
        </div>
      </Form>

      {/* The SAME cloud course catalog picker the new-round flow uses. We only
          need the picked course/tee identity from the returned TeeRoundDefaults. */}
      <FairwayCoursePicker
        // Coach-only route (qualifiers/new redirects a non-coach), so the
        // library-management affordances are safe to show here.
        canManageLibrary
        open={pickerRound !== null}
        onOpenChange={(open) => { if (!open) setPickerRound(null); }}
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
