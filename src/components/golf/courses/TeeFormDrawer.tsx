'use client';

/**
 * TeeFormDrawer — create/edit a tee set (with a per-hole par/yardage editor) in
 * a Vaul bottom-sheet that center-docks on desktop. Built on the Course Library
 * write actions (createTee / updateTee) which are snapshot-safe (stage-and-swap
 * hole replacement; never touches golf_rounds / golf_holes).
 *
 * House style: matches CourseCard.tsx + the Fairway form primitives — warm matte
 * surfaces, fw-* radii, design-token colors only (no raw hex / arbitrary tints),
 * editorial display title, tap targets >= 40px. The hole editor is tall, so the
 * body scrolls inside a max-h container while the header + footer stay pinned.
 *
 * The fields intentionally use raw <input>/<select> carrying the canonical
 * Fairway control class string composed inside <FormField> (the design system's
 * documented FormField recipe), rather than the wrapper <Input>/<Select>
 * primitives — so we opt this file out of helm/no-raw-input.
 */

/* eslint-disable helm/no-raw-input -- FormField + canonical control class is the documented field recipe here */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { FormField } from '@/components/fairway/forms/FormField';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { IconX, IconFlag } from '@/components/icons';
import type { GolfCourseTeeWithHoles, GolfTeeCategory } from '@/lib/types/golf-course';
import { createTee, updateTee } from '@/app/golf/actions/course-library';

// ── Local row model for the editor ───────────────────────────────────────────

interface HoleRow {
  holeNumber: number;
  /** Always present (defaults to 4); validated 3..6. */
  par: number;
  /** Raw text so the field can be blank; parsed on submit. */
  yardage: string;
  /** Raw text so the field can be blank; parsed on submit. */
  handicapIndex: string;
}

// The shared control recipe (mirrors the Fairway input contract verbatim).
const INPUT_CLASS =
  'w-full rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30';

const CATEGORY_OPTIONS: { value: GolfTeeCategory; label: string }[] = [
  { value: 'mens', label: "Men's" },
  { value: 'womens', label: "Women's" },
  { value: 'tournament', label: 'Tournament' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'senior', label: 'Senior' },
  { value: 'junior', label: 'Junior' },
  { value: 'custom', label: 'Custom' },
];

const PAR_OPTIONS = [3, 4, 5, 6] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlankRows(count: number): HoleRow[] {
  return Array.from({ length: count }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: '',
    handicapIndex: '',
  }));
}

function rowsFromTee(tee: GolfCourseTeeWithHoles, count: number): HoleRow[] {
  const byHole = new Map<number, GolfCourseTeeWithHoles['holes'][number]>();
  for (const h of tee.holes) byHole.set(h.hole_number, h);
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const h = byHole.get(n);
    return {
      holeNumber: n,
      par: h?.par ?? 4,
      yardage: h?.yardage != null ? String(h.yardage) : '',
      handicapIndex: h?.handicap_index != null ? String(h.handicap_index) : '',
    };
  });
}

/** Grow/shrink the row set to `count`, preserving existing values. */
function resizeRows(rows: HoleRow[], count: number): HoleRow[] {
  if (rows.length === count) return rows;
  if (rows.length > count) return rows.slice(0, count);
  const extra = Array.from({ length: count - rows.length }, (_, i) => ({
    holeNumber: rows.length + i + 1,
    par: 4,
    yardage: '',
    handicapIndex: '',
  }));
  return [...rows, ...extra];
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface TeeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  courseId: string;
  tee?: GolfCourseTeeWithHoles;
  onSaved?: () => void;
}

export function TeeFormDrawer({
  open,
  onOpenChange,
  mode,
  courseId,
  tee,
  onSaved,
}: TeeFormDrawerProps) {
  const { showToast } = useToast();

  const [teeName, setTeeName] = useState('');
  const [teeColor, setTeeColor] = useState('');
  const [category, setCategory] = useState<string>('');
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [courseRating, setCourseRating] = useState('');
  const [slopeRating, setSlopeRating] = useState('');
  const [rows, setRows] = useState<HoleRow[]>(() => makeBlankRows(18));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize / reset whenever the sheet opens or the target tee changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);

    if (mode === 'edit' && tee) {
      const count = (tee.holes_count === 9 ? 9 : 18) as 9 | 18;
      setTeeName(tee.tee_name ?? '');
      setTeeColor(tee.tee_color ?? '');
      setCategory((tee.category as string | null) ?? '');
      setHolesCount(count);
      setCourseRating(tee.course_rating != null ? String(tee.course_rating) : '');
      setSlopeRating(tee.slope_rating != null ? String(tee.slope_rating) : '');
      setRows(rowsFromTee(tee, count));
    } else {
      setTeeName('');
      setTeeColor('');
      setCategory('');
      setHolesCount(18);
      setCourseRating('');
      setSlopeRating('');
      setRows(makeBlankRows(18));
    }
    // Keyed on tee identity + open so re-opening the same tee reseeds cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, tee?.id]);

  function changeHolesCount(next: 9 | 18) {
    setHolesCount(next);
    setRows((prev) => resizeRows(prev, next));
  }

  function setPar(idx: number, par: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, par } : r)));
  }

  function setYardage(idx: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, yardage: value } : r)));
  }

  function setHandicap(idx: number, value: string) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, handicapIndex: value } : r)));
  }

  function resetParsToFour() {
    setRows((prev) => prev.map((r) => ({ ...r, par: 4 })));
  }

  // Count how many holes have a par the user has explicitly considered. We always
  // ship every row (par defaults to 4), so "incomplete" here is really about the
  // optional yardages — kept simple: a tee is a draft until every hole has yards.
  const holesWithYards = rows.filter((r) => r.yardage.trim() !== '').length;
  const willBeDraft = holesWithYards < holesCount;

  function validate(): { holes: { holeNumber: number; par: number; yardage: number | null; handicapIndex: number | null }[] } | null {
    const name = teeName.trim();
    if (!name) {
      setError('Tee name is required.');
      return null;
    }

    const holes: { holeNumber: number; par: number; yardage: number | null; handicapIndex: number | null }[] = [];
    for (const r of rows) {
      if (!Number.isFinite(r.par) || r.par < 3 || r.par > 6) {
        setError(`Hole ${r.holeNumber}: par must be between 3 and 6.`);
        return null;
      }

      let yardage: number | null = null;
      const yRaw = r.yardage.trim();
      if (yRaw !== '') {
        const y = Number(yRaw);
        if (!Number.isFinite(y) || y < 30 || y > 800) {
          setError(`Hole ${r.holeNumber}: yardage must be between 30 and 800.`);
          return null;
        }
        yardage = Math.round(y);
      }

      let handicapIndex: number | null = null;
      const hRaw = r.handicapIndex.trim();
      if (hRaw !== '') {
        const h = Number(hRaw);
        if (!Number.isInteger(h) || h < 1 || h > 18) {
          setError(`Hole ${r.holeNumber}: handicap index must be a whole number from 1 to 18.`);
          return null;
        }
        handicapIndex = h;
      }

      holes.push({ holeNumber: r.holeNumber, par: r.par, yardage, handicapIndex });
    }

    return { holes };
  }

  function parseOptionalNumber(raw: string): number | null {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const validated = validate();
    if (!validated) return;

    const name = teeName.trim();
    const colorValue = teeColor.trim() === '' ? null : teeColor.trim();
    const categoryValue: GolfTeeCategory | null = category === '' ? null : (category as GolfTeeCategory);
    const courseRatingValue = parseOptionalNumber(courseRating);
    const slopeRatingValue = parseOptionalNumber(slopeRating);

    setSubmitting(true);
    try {
      const result =
        mode === 'create'
          ? await createTee(courseId, {
              teeName: name,
              teeColor: colorValue,
              category: categoryValue,
              holesCount,
              courseRating: courseRatingValue,
              slopeRating: slopeRatingValue,
              holes: validated.holes,
            })
          : await updateTee(tee!.id, {
              teeName: name,
              teeColor: colorValue,
              category: categoryValue,
              holesCount,
              courseRating: courseRatingValue,
              slopeRating: slopeRatingValue,
              holes: validated.holes,
            });

      if (result.success) {
        showToast(mode === 'create' ? 'Tee added' : 'Tee updated', 'success');
        onSaved?.();
        onOpenChange(false);
      } else {
        showToast(result.error, 'error');
        setError(result.error);
      }
    } catch {
      const message = 'Something went wrong saving this tee set.';
      showToast(message, 'error');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? 'Add tee set' : 'Edit tee set';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:mx-auto sm:max-w-2xl sm:rounded-fw-lg">
        {/* Header — pinned above the scrolling body */}
        <div className="flex items-start justify-between gap-3 px-6 pt-4 pb-3">
          <div className="min-w-0">
            <DrawerTitle className="font-fw-display text-title-2 font-semibold tracking-tight text-text-primary">
              {title}
            </DrawerTitle>
            <p className="mt-1 flex items-center gap-1.5 text-caption text-text-tertiary">
              <IconFlag size={13} aria-hidden />
              {holesCount}-hole tee · pars and yardages per hole
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <IconX size={18} aria-hidden />
          </Button>
        </div>

        {/* Scrollable body — the hole editor can be tall */}
        <div className="max-h-[78vh] overflow-y-auto px-6">
          {/* Top-level error area */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-fw-sm border border-fw-danger/30 bg-fw-danger-bg px-3 py-2.5 text-body-sm text-fw-danger"
            >
              {error}
            </div>
          )}

          {/* ── Identity ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <FormField label="Tee name" required className="sm:col-span-2">
              <input
                type="text"
                value={teeName}
                onChange={(e) => setTeeName(e.target.value)}
                placeholder="Championship, Blue, Women's…"
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </FormField>

            <FormField label="Color" showOptional help="Common name for the markers, e.g. Blue.">
              <input
                type="text"
                value={teeColor}
                onChange={(e) => setTeeColor(e.target.value)}
                placeholder="Blue"
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </FormField>

            <FormField label="Category" showOptional>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={cn(INPUT_CLASS, 'appearance-none')}
              >
                <option value="">—</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value as string} value={opt.value as string}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* ── Ratings + holes count ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            <FormField label="Holes">
              <div className="inline-flex w-full overflow-hidden rounded-fw-sm border border-border-subtle bg-surface-sunken p-1">
                {([18, 9] as const).map((n) => {
                  const active = holesCount === n;
                  return (
                    // eslint-disable-next-line helm/no-raw-button -- compact segmented control inside a form field
                    <button
                      key={n}
                      type="button"
                      onClick={() => changeHolesCount(n)}
                      aria-pressed={active}
                      className={cn(
                        'min-h-[40px] flex-1 rounded-md text-body font-medium transition-colors',
                        active
                          ? 'bg-surface text-text-primary shadow-fw-soft'
                          : 'text-text-tertiary hover:text-text-primary',
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </FormField>

            <FormField label="Course rating" showOptional>
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                value={courseRating}
                onChange={(e) => setCourseRating(e.target.value)}
                placeholder="72.4"
                className={INPUT_CLASS}
              />
            </FormField>

            <FormField label="Slope rating" showOptional>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                value={slopeRating}
                onChange={(e) => setSlopeRating(e.target.value)}
                placeholder="135"
                className={INPUT_CLASS}
              />
            </FormField>
          </div>

          {/* ── Per-hole editor ──────────────────────────────────────── */}
          <div className="mt-2 mb-2 flex items-center justify-between gap-3">
            <h3 className="font-fw-display text-body font-semibold tracking-tight text-text-primary">
              Holes
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={resetParsToFour}>
              Reset pars to 4
            </Button>
          </div>

          {willBeDraft && (
            <p className="mb-3 text-caption text-text-tertiary">
              Some holes are missing yardages — this tee will be saved as a draft until every hole
              is filled in.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-2">
            {rows.map((row, idx) => (
              <div
                key={row.holeNumber}
                className="rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-tertiary">
                    <IconFlag size={12} aria-hidden /> Hole {row.holeNumber}
                  </span>
                </div>

                <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                  {/* Par */}
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-text-tertiary">Par</span>
                    <select
                      value={row.par}
                      onChange={(e) => setPar(idx, Number(e.target.value))}
                      aria-label={`Hole ${row.holeNumber} par`}
                      className={cn(
                        'min-h-[40px] w-[56px] appearance-none rounded-fw-sm border border-border-subtle bg-surface-sunken px-2 text-center text-body text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30',
                      )}
                    >
                      {PAR_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Yardage */}
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-text-tertiary">Yards</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={30}
                      max={800}
                      value={row.yardage}
                      onChange={(e) => setYardage(idx, e.target.value)}
                      placeholder="—"
                      aria-label={`Hole ${row.holeNumber} yardage`}
                      className={cn(INPUT_CLASS, 'min-h-[40px] px-2.5 py-2')}
                    />
                  </label>

                  {/* Handicap index */}
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-text-tertiary">Hcp</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={18}
                      value={row.handicapIndex}
                      onChange={(e) => setHandicap(idx, e.target.value)}
                      placeholder="—"
                      aria-label={`Hole ${row.holeNumber} handicap index`}
                      className={cn(INPUT_CLASS, 'min-h-[40px] px-2.5 py-2')}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer — pinned below the scrolling body */}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSubmit} isLoading={submitting}>
            {mode === 'create' ? 'Add tee' : 'Save changes'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
