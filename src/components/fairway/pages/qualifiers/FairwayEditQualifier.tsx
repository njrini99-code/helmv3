'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayEditQualifier
 * ----------------------------------------------------------------------------
 * Closes the "half-built create/edit" gap: setQualifierRoundCourses was fully
 * built (coach-auth-checked, stage-and-swap upsert) but had zero UI callers,
 * and there was no way at all to fix a qualifier's name/dates/rules/spots
 * after creation. This wires BOTH — the new `updateGolfQualifierDetails`
 * action (scalar fields) and the existing `setQualifierRoundCourses` (round
 * count + per-round course assignments) — into one edit form.
 *
 * Deliberately OUT of scope (unchanged from creation): the entrant roster and
 * the travel-squad slot model (selectionSlotsTotal/selectionSlotsCoachPick).
 * Those are separate concerns the qualifying workspace already owns / the
 * confirmed finding here didn't ask for.
 *
 * Mirrors FairwayNewQualifier's Basics/Schedule/Course&rules sections + the
 * shared cloud course picker, pre-populated from the existing qualifier row.
 * Tokens / primitives ONLY. No glass / warm-* / blur.
 * ========================================================================== */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  ViewHeader,
  Button,
  InlineNotice,
  Form,
  FormSection,
  FormField,
  Input,
  TextArea,
  NumberField,
} from '@/components/fairway';
import { Flag, MapPin } from 'lucide-react';
import {
  updateGolfQualifierDetails,
  setQualifierRoundCourses,
  type QualifierRoundCourse,
} from '@/app/golf/actions/golf';
// Reuse the SAME cloud course catalog picker the create flow uses.
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';

/** One round's assigned course in the edit form. */
interface RoundCourseDraft {
  roundNumber: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
}

export interface FairwayEditQualifierInitial {
  name: string;
  description: string | null;
  courseName: string | null;
  rules: string | null;
  startDate: string;
  endDate: string | null;
  entryDeadline: string | null;
  spotsAvailable: number | null;
  numRounds: number;
}

export interface FairwayEditQualifierProps {
  qualifierId: string;
  initial: FairwayEditQualifierInitial;
  roundCourses: QualifierRoundCourse[];
}

export function FairwayEditQualifier({
  qualifierId,
  initial,
  roundCourses: initialRoundCourses,
}: FairwayEditQualifierProps) {
  const router = useRouter();
  const detailHref = `/golf/dashboard/qualifiers/${qualifierId}`;

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [courseName, setCourseName] = useState(initial.courseName ?? '');
  const [rules, setRules] = useState(initial.rules ?? '');
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate ?? '');
  const [entryDeadline, setEntryDeadline] = useState(initial.entryDeadline ?? '');
  const [spotsAvailable, setSpotsAvailable] = useState<number | null>(initial.spotsAvailable);

  // Feature G — number of rounds + the course assigned to each.
  const [numRounds, setNumRounds] = useState<number | null>(initial.numRounds);
  const [roundCourses, setRoundCourses] = useState<RoundCourseDraft[]>(
    initialRoundCourses.map((rc) => ({
      roundNumber: rc.roundNumber,
      courseId: rc.courseId,
      courseName: rc.courseName,
      teeId: rc.teeId,
    })),
  );
  const [pickerRound, setPickerRound] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rounds = numRounds && numRounds > 0 ? Math.min(numRounds, 50) : 1;
  const isMultiRound = rounds > 1;
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

  const endDateError = useMemo(
    () => (endDate && startDate && endDate < startDate ? 'End date cannot be before the start date.' : null),
    [endDate, startDate],
  );
  const entryDeadlineError = useMemo(
    () =>
      entryDeadline && startDate && entryDeadline > startDate
        ? 'Entry deadline must be on or before the start date.'
        : null,
    [entryDeadline, startDate],
  );

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
    if (endDateError || entryDeadlineError) {
      setError('Fix the highlighted dates before saving.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const detailsResult = await updateGolfQualifierDetails(qualifierId, {
        name: name.trim(),
        description: description.trim() || null,
        courseName: isMultiRound ? null : courseName.trim() || null,
        rules: rules.trim() || null,
        entryDeadline: entryDeadline || null,
        startDate,
        endDate: endDate || null,
        spotsAvailable,
      });

      if (!detailsResult.success) {
        setError(detailsResult.error);
        setLoading(false);
        return;
      }

      const coursesResult = await setQualifierRoundCourses(
        qualifierId,
        rounds,
        isMultiRound
          ? roundCourses
              .filter((rc) => rc.roundNumber <= rounds)
              .map((rc) => ({
                roundNumber: rc.roundNumber,
                courseId: rc.courseId,
                courseName: rc.courseName,
                teeId: rc.teeId,
              }))
          : [],
      );

      if (!coursesResult.success) {
        setError(coursesResult.error);
        setLoading(false);
        return;
      }

      router.push(detailHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the qualifier.');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Coach · Edit qualifier"
        title="Edit qualifier."
        description="Update the schedule, rules, or per-round courses."
        meta={
          <Link
            href={detailHref}
            className="font-fw-sans text-body-sm text-text-secondary underline-offset-2 hover:text-accent-700 hover:underline"
          >
            ← Back to qualifier
          </Link>
        }
      />

      <Form spacing="roomy" onSubmit={handleSubmit} className="mt-8">
        {error ? (
          <InlineNotice tone="danger" title="Couldn't save the qualifier">
            {error}
          </InlineNotice>
        ) : null}

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
            <FormField label="Description" showOptional>
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

        <FormSection title="Schedule" description="When does it run?">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Start date" required>
                <Input
                  type="date"
                  name="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="End date" showOptional help="For multi-day qualifiers." error={endDateError ?? undefined}>
                <Input
                  type="date"
                  name="endDate"
                  min={startDate || undefined}
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
                max={startDate || undefined}
                value={entryDeadline}
                onChange={(e) => setEntryDeadline(e.target.value)}
                aria-invalid={entryDeadlineError ? true : undefined}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Course & rules" description="Where it's played and how it's scored.">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField label="Rounds" help="How many rounds count toward this qualifier.">
                <NumberField value={numRounds} onValueChange={setNumRounds} min={1} max={50} unit="rounds" />
              </FormField>
              <FormField label="Spots available" showOptional help="Total roster spots for this qualifier.">
                <NumberField value={spotsAvailable} onValueChange={setSpotsAvailable} min={1} max={200} />
              </FormField>
            </div>

            {!isMultiRound ? (
              <FormField label="Course" showOptional>
                <Input
                  name="courseName"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. Lions Municipal Golf Course"
                />
              </FormField>
            ) : (
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
                            <p className="font-fw-sans text-body text-text-tertiary">No course assigned</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {assigned ? (
                            <Button type="button" variant="ghost" size="sm" onClick={() => clearRoundCourse(roundNumber)}>
                              Clear
                            </Button>
                          ) : null}
                          <Button type="button" variant="secondary" size="sm" onClick={() => setPickerRound(roundNumber)}>
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {assigned ? 'Change' : 'Pick course'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormField>
            )}

            <FormField label="Scoring rules" showOptional help="Shown on the qualifier page.">
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

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button asChild variant="ghost">
            <Link href={detailHref}>Cancel</Link>
          </Button>
          <Button type="submit" variant="primary" busy={loading} className="min-w-[140px]">
            Save changes
          </Button>
        </div>
      </Form>

      <FairwayCoursePicker
        // Coach-only route (qualifiers/[id]/edit redirects a non-coach), so the
        // library-management affordances are safe to show here.
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

export default FairwayEditQualifier;
