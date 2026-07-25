'use client';

import { useState, useId, useEffect, useMemo, useRef } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconX, IconPlus, IconCheck, IconWarning } from '@/components/icons';
import { cn } from '@/lib/utils';
import { generateClassColor, detectSemester } from '@/lib/utils/schedule-parser';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

interface ExistingClass {
  id?: string;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_name: string;
}

interface ClassConflict {
  existingClass: ExistingClass;
  conflictingDays: string[];
  isExactDuplicate: boolean;
}

interface AddClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classData: ClassFormData) => Promise<void>;
  editingClass?: ClassFormData | null;
  existingClasses?: ExistingClass[];
}

export interface ClassFormData {
  id?: string;
  course_code: string;
  course_name: string;
  instructor: string;
  days: string[];
  start_time: string;
  end_time: string;
  location: string;
  building: string;
  room: string;
  credits: number | null;
  semester: string;
  color: string;
  notes: string;
}

const DAYS = [
  { abbrev: 'M', label: 'Mon' },
  { abbrev: 'T', label: 'Tue' },
  { abbrev: 'W', label: 'Wed' },
  { abbrev: 'Th', label: 'Thu' },
  { abbrev: 'F', label: 'Fri' },
];

const QUICK_DAY_PATTERNS = [
  { label: 'MWF', days: ['M', 'W', 'F'] },
  { label: 'TTh', days: ['T', 'Th'] },
  { label: 'MW', days: ['M', 'W'] },
];

/**
 * Cream-glass field recipe (#143) — every text-like field in this modal
 * (Input/Textarea/Select from `@/components/ui`) otherwise falls back to
 * its own legacy default: the shared `<Input>`/`<Select>` render a flat
 * near-white `bg-cream-50/92` well with no blur, and the Notes `<Textarea>`
 * previously overrode to `bg-surface` (the flat CARD-level cream token, not
 * an input well) — both read as plain white against this Drawer's warm
 * `surface-stone` chrome. This override swaps in the same warm SUNKEN well
 * + hairline border + accent-600 focus ring that the canonical Fairway
 * forms primitive uses for every field (`fieldControlBase`,
 * src/components/fairway/forms/styles.ts) — reusing the exact override
 * technique already established by FairwayNewRoundEntry's `fwInputCls`
 * (twMerge, via `cn`, lets these win over the component's own bg/border/
 * text defaults while leaving height/padding/radius untouched).
 */
const creamGlassFieldCls = cn(
  'bg-surface-sunken border-border-subtle text-text-primary',
  'placeholder:text-text-tertiary',
  'hover:border-border-strong',
  'focus:border-border-focus focus:ring-2 focus:ring-accent-600/30',
);

/**
 * Convert time string (HH:MM) to minutes for comparison
 */
function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const parts = time.split(':').map(Number);
  const hours = parts[0];
  const minutes = parts[1];
  if (hours === undefined || minutes === undefined || isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Check if two time ranges overlap
 */
function timesOverlap(
  start1: string | null,
  end1: string | null,
  start2: string | null,
  end2: string | null
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  // If any time is missing, we can't determine overlap
  if (s1 === null || e1 === null || s2 === null || e2 === null) {
    return false;
  }

  // Check for overlap: ranges overlap if one starts before the other ends
  return s1 < e2 && s2 < e1;
}

/**
 * Detect conflicts between new class and existing classes
 */
function detectConflicts(
  newClass: ClassFormData,
  existingClasses: ExistingClass[],
  editingClassId?: string
): ClassConflict[] {
  const conflicts: ClassConflict[] = [];
  const newDays = newClass.days || [];

  if (newDays.length === 0 || !newClass.start_time || !newClass.end_time) {
    return conflicts;
  }

  for (const existing of existingClasses) {
    // Skip the class being edited
    if (editingClassId && existing.id === editingClassId) {
      continue;
    }

    const existingDays = existing.days || [];
    if (existingDays.length === 0) continue;

    // Find overlapping days
    const overlappingDays = newDays.filter(day => existingDays.includes(day));
    if (overlappingDays.length === 0) continue;

    // Check if times overlap
    if (timesOverlap(newClass.start_time, newClass.end_time, existing.start_time, existing.end_time)) {
      // Check if it's an exact duplicate (same days and exact same times)
      const isExactDuplicate =
        JSON.stringify([...newDays].sort()) === JSON.stringify([...existingDays].sort()) &&
        newClass.start_time === existing.start_time &&
        newClass.end_time === existing.end_time;

      conflicts.push({
        existingClass: existing,
        conflictingDays: overlappingDays,
        isExactDuplicate,
      });
    }
  }

  return conflicts;
}

/**
 * Build the semester <option> list dynamically from `now` so the current term is
 * ALWAYS selectable and pre-selected — a hard-coded year list silently goes stale
 * and detaches the <select> from formData.semester (which drives the calendar
 * sync date range). Returns the previous term, the current term, and the next
 * three terms in chronological Spring → Summer → Fall order.
 *
 * Exported for deterministic unit testing.
 */
export function generateSemesterOptions(now: Date = new Date()): string[] {
  // Academic term ordering within a calendar year.
  const TERMS = ['Spring', 'Summer', 'Fall'] as const;
  const month = now.getMonth();
  const year = now.getFullYear();

  // Current term index, mirroring detectSemester()'s month buckets:
  // Jan–May → Spring, Jun–Jul → Summer, Aug–Dec → Fall.
  const currentTermIndex = month <= 4 ? 0 : month <= 7 ? 1 : 2;

  // Absolute term position = year * 3 + termIndex. Walk from one term before the
  // current term through three terms after it (5 terms total).
  const currentAbsolute = year * TERMS.length + currentTermIndex;
  const options: string[] = [];
  for (let offset = -1; offset <= 3; offset++) {
    const absolute = currentAbsolute + offset;
    const termYear = Math.floor(absolute / TERMS.length);
    const term = TERMS[((absolute % TERMS.length) + TERMS.length) % TERMS.length];
    options.push(`${term} ${termYear}`);
  }
  return options;
}

function emptyClassForm(): ClassFormData {
  return {
    course_code: '',
    course_name: '',
    instructor: '',
    days: [],
    start_time: '',
    end_time: '',
    location: '',
    building: '',
    room: '',
    credits: null,
    semester: detectSemester(''),
    color: generateClassColor(),
    notes: '',
  };
}

export function AddClassModal({ isOpen, onClose, onSave, editingClass, existingClasses = [] }: AddClassModalProps) {
  const uid = useId();
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ClassConflict[]>([]);
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [formData, setFormData] = useState<ClassFormData>(() => editingClass ?? emptyClassForm());
  const conflictPanelRef = useRef<HTMLDivElement>(null);

  // Reset conflicts when modal closes or form changes significantly
  const resetConflictState = () => {
    setConflicts([]);
    setShowConflictWarning(false);
  };

  // The Drawer (vaul) keeps this modal mounted even while closed, so the lazy
  // useState initializer above only ever captures the FIRST editingClass value
  // (null at first paint). Sync formData whenever the modal opens or the target
  // class changes — otherwise editing always shows a blank form. Also clear any
  // stale conflict warning so a prior session's conflicts don't carry over.
  useEffect(() => {
    if (!isOpen) return;
    setFormData(editingClass ? { ...editingClass } : emptyClassForm());
    setConflicts([]);
    setShowConflictWarning(false);
  }, [isOpen, editingClass]);

  // a11y: when the conflict panel appears, move focus to it so screen-reader and
  // keyboard users land on the alert (the Submit button is now offscreen above
  // the injected panel). role="alert" on the container also triggers an AT
  // announcement; focusing makes the warning + its actions immediately reachable.
  useEffect(() => {
    if (showConflictWarning && conflicts.length > 0) {
      conflictPanelRef.current?.focus();
    }
  }, [showConflictWarning, conflicts.length]);

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day].sort((a, b) => {
            const order = ['M', 'T', 'W', 'Th', 'F'];
            return order.indexOf(a) - order.indexOf(b);
          }),
    }));
  };

  const handleQuickPattern = (pattern: string[]) => {
    setFormData(prev => ({ ...prev, days: pattern }));
  };

  const handleSubmit = async (e?: React.FormEvent, forceSubmit = false) => {
    e?.preventDefault();

    if (!formData.course_code || !formData.course_name) {
      return;
    }

    // Check for conflicts (unless we're forcing the submit after user confirmation)
    if (!forceSubmit) {
      const detectedConflicts = detectConflicts(formData, existingClasses, editingClass?.id);

      if (detectedConflicts.length > 0) {
        // Check for exact duplicates - these should be blocked entirely
        const hasExactDuplicate = detectedConflicts.some(c => c.isExactDuplicate);

        if (hasExactDuplicate) {
          // Block exact duplicates
          setConflicts(detectedConflicts);
          setShowConflictWarning(true);
          return;
        }

        // For overlapping (but not exact duplicate) conflicts, show warning and allow confirmation
        setConflicts(detectedConflicts);
        setShowConflictWarning(true);
        return;
      }
    }

    setLoading(true);
    try {
      // Combine building and room into location if needed
      const location = formData.building && formData.room
        ? `${formData.building} ${formData.room}`
        : formData.location || formData.building || formData.room || '';

      await onSave({
        ...formData,
        location,
      });
      resetConflictState();
      onClose();
    } catch {
      // Save failed - UI will show original state
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmWithConflicts = () => {
    // User confirmed they want to proceed despite conflicts
    handleSubmit(undefined, true);
  };

  const handleCancelConflict = () => {
    resetConflictState();
  };

  // Check if any conflict is an exact duplicate (should be blocked)
  const hasExactDuplicate = conflicts.some(c => c.isExactDuplicate);

  // Dynamic term list (prev / current / next-3) so the current semester is always
  // selectable + pre-selected. When editing a class whose stored term falls
  // outside that window, splice it in so the <select> never renders blank or
  // silently re-binds to the wrong term (which would misplace synced events).
  const semesterOptions = useMemo(() => {
    const options = generateSemesterOptions();
    if (formData.semester && !options.includes(formData.semester)) {
      options.push(formData.semester);
    }
    return options;
  }, [formData.semester]);

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-lg sm:mx-auto sm:rounded-3xl p-0 overflow-hidden flex flex-col"
        aria-labelledby="add-class-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <DrawerTitle id="add-class-title" className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
            {editingClass ? 'Edit Class' : 'Add Class'}
          </DrawerTitle>
          <IconButton variant="default"
            onClick={onClose}
            aria-label="Close"
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken active:bg-surface-sunken rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Course Code & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor={`${uid}-course-code`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Course ID <span className="text-fw-danger-ink">*</span>
              </label>
              <Input
                id={`${uid}-course-code`}
                className={creamGlassFieldCls}
                value={formData.course_code}
                onChange={(e) => setFormData(prev => ({ ...prev, course_code: e.target.value.toUpperCase() }))}
                placeholder="BUAD 123"
                required
              />
            </div>
            <div className="col-span-2">
              <label htmlFor={`${uid}-course-name`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Course Name <span className="text-fw-danger-ink">*</span>
              </label>
              <Input
                id={`${uid}-course-name`}
                className={creamGlassFieldCls}
                value={formData.course_name}
                onChange={(e) => setFormData(prev => ({ ...prev, course_name: e.target.value }))}
                placeholder="Business Fundamentals"
                required
              />
            </div>
          </div>

          {/* Days */}
          <div>
            <p className="block text-sm font-medium text-text-secondary mb-2">
              Days
            </p>
            <div className="flex items-center gap-2 mb-2">
              {DAYS.map(day => (
                <Button variant="primary"
                  key={day.abbrev}
                  type="button"
                  onClick={() => handleDayToggle(day.abbrev)}
                  className={cn(
                    'w-10 h-10 rounded-lg text-sm font-medium transition-all',
                    formData.days.includes(day.abbrev)
                      ? 'bg-accent-700 text-text-on-accent'
                      : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken/80'
                  )}
                >
                  {day.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {QUICK_DAY_PATTERNS.map(pattern => (
                <Button variant="primary"
                  key={pattern.label}
                  type="button"
                  onClick={() => handleQuickPattern(pattern.days)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-all',
                    JSON.stringify(formData.days) === JSON.stringify(pattern.days)
                      ? 'bg-accent-500/15 text-accent-800'
                      : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken/80'
                  )}
                >
                  {pattern.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-start-time`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Start Time
              </label>
              <Input
                id={`${uid}-start-time`}
                className={creamGlassFieldCls}
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-end-time`} className="block text-sm font-medium text-text-secondary mb-1.5">
                End Time
              </label>
              <Input
                id={`${uid}-end-time`}
                className={creamGlassFieldCls}
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-building`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Building
              </label>
              <Input
                id={`${uid}-building`}
                className={creamGlassFieldCls}
                value={formData.building}
                onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
                placeholder="HAL"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-room`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Room
              </label>
              <Input
                id={`${uid}-room`}
                className={creamGlassFieldCls}
                value={formData.room}
                onChange={(e) => setFormData(prev => ({ ...prev, room: e.target.value }))}
                placeholder="101"
              />
            </div>
          </div>

          {/* Instructor & Credits */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2">
              <label htmlFor={`${uid}-professor`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Professor
              </label>
              <Input
                id={`${uid}-professor`}
                className={creamGlassFieldCls}
                value={formData.instructor}
                onChange={(e) => setFormData(prev => ({ ...prev, instructor: e.target.value }))}
                placeholder="Dr. Smith (optional)"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-credits`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Credits
              </label>
              <Input
                id={`${uid}-credits`}
                className={creamGlassFieldCls}
                type="number"
                min="0"
                max="6"
                step="1"
                value={formData.credits || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  // F015: golf_player_classes.credits is an integer column. The
                  // old step="0.5" + parseFloat let a user enter 3.5, which the
                  // DB then silently rounded — so the stored value didn't match
                  // what was typed. Keep the input integer-only to match storage.
                  credits: e.target.value ? Math.round(parseFloat(e.target.value)) : null
                }))}
                placeholder="3"
              />
            </div>
          </div>

          {/* Semester & Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Select
                label="Semester"
                className={creamGlassFieldCls}
                options={semesterOptions.map((option) => ({ value: option, label: option }))}
                value={formData.semester}
                onChange={(value) => setFormData(prev => ({ ...prev, semester: value }))}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-color`} className="block text-sm font-medium text-text-secondary mb-1.5">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${uid}-color`}
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-border-subtle cursor-pointer"
                />
                <span className="text-sm text-text-tertiary">Calendar color</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className="block text-sm font-medium text-text-secondary mb-1.5">
              Notes
            </label>
            <Textarea
              id={`${uid}-notes`}
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes... (optional)"
              rows={2}
              aria-label="Notes"
              autoCapitalize="sentences"
              autoCorrect="on"
              className={cn('resize-none', creamGlassFieldCls)}
            />
          </div>
        </form>

        {/* Conflict Warning */}
        {showConflictWarning && conflicts.length > 0 && (
          <div
            ref={conflictPanelRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="mx-6 mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <IconWarning size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-amber-800 mb-1">
                  {hasExactDuplicate ? 'Duplicate Time Slot' : 'Schedule Conflict Detected'}
                </h4>
                <p className="text-sm text-amber-700 mb-3">
                  {hasExactDuplicate
                    ? 'A class with the exact same days and times already exists. Please adjust the schedule.'
                    : 'This class overlaps with existing class times:'}
                </p>
                <ul className="space-y-2 mb-3">
                  {conflicts.map((conflict, index) => (
                    <li
                      key={index}
                      className="text-sm text-amber-800 bg-amber-100/50 rounded-lg px-3 py-2"
                    >
                      <span className="font-medium">{conflict.existingClass.class_name}</span>
                      <span className="text-amber-800 ml-2">
                        ({conflict.conflictingDays.join(', ')} at {conflict.existingClass.start_time} - {conflict.existingClass.end_time})
                      </span>
                    </li>
                  ))}
                </ul>
                {!hasExactDuplicate && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleCancelConflict}
                    >
                      Edit Schedule
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleConfirmWithConflicts}
                      // amber-800 (#92400E) on white text ≈ 6.4:1 — clears WCAG AA
                      // 4.5:1 (the old amber-600 fill was ~2.8:1 and failed).
                      className="bg-amber-800 text-white hover:bg-amber-900 transition-colors"
                    >
                      Add Anyway
                    </Button>
                  </div>
                )}
                {hasExactDuplicate && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelConflict}
                  >
                    Edit Schedule
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-sunken">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={loading}
            className="gap-2"
            disabled={showConflictWarning && hasExactDuplicate}
          >
            {editingClass ? (
              <>
                <IconCheck size={18} />
                Save Changes
              </>
            ) : (
              <>
                <IconPlus size={18} />
                Add Class
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
