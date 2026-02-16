'use client';

import { useState } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconX, IconPlus, IconCheck, IconWarning } from '@/components/icons';
import { cn } from '@/lib/utils';
import { generateClassColor, detectSemester } from '@/lib/utils/schedule-parser';

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

export function AddClassModal({ isOpen, onClose, onSave, editingClass, existingClasses = [] }: AddClassModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ClassConflict[]>([]);
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [formData, setFormData] = useState<ClassFormData>(() =>
    editingClass || {
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
    }
  );

  // Reset conflicts when modal closes or form changes significantly
  const resetConflictState = () => {
    setConflicts([]);
    setShowConflictWarning(false);
  };

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-warm-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="add-class-title" className="relative w-full max-w-lg mx-4 glass-prominent rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
          <h2 id="add-class-title" className="text-lg font-semibold text-warm-900">
            {editingClass ? 'Edit Class' : 'Add Class'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-warm-400 hover:text-warm-600 hover:bg-warm-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Course Code & Name */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Course ID <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.course_code}
                onChange={(e) => setFormData(prev => ({ ...prev, course_code: e.target.value.toUpperCase() }))}
                placeholder="BUAD 123"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Course Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.course_name}
                onChange={(e) => setFormData(prev => ({ ...prev, course_name: e.target.value }))}
                placeholder="Business Fundamentals"
                required
              />
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Days
            </label>
            <div className="flex items-center gap-2 mb-2">
              {DAYS.map(day => (
                <button
                  key={day.abbrev}
                  type="button"
                  onClick={() => handleDayToggle(day.abbrev)}
                  className={cn(
                    'w-10 h-10 rounded-lg text-sm font-medium transition-all',
                    formData.days.includes(day.abbrev)
                      ? 'bg-primary-600 text-white'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {QUICK_DAY_PATTERNS.map(pattern => (
                <button
                  key={pattern.label}
                  type="button"
                  onClick={() => handleQuickPattern(pattern.days)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-all',
                    JSON.stringify(formData.days) === JSON.stringify(pattern.days)
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-100 text-warm-500 hover:bg-warm-200'
                  )}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Start Time
              </label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                End Time
              </label>
              <Input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Building
              </label>
              <Input
                value={formData.building}
                onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
                placeholder="HAL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Room
              </label>
              <Input
                value={formData.room}
                onChange={(e) => setFormData(prev => ({ ...prev, room: e.target.value }))}
                placeholder="101"
              />
            </div>
          </div>

          {/* Instructor & Credits */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Professor
              </label>
              <Input
                value={formData.instructor}
                onChange={(e) => setFormData(prev => ({ ...prev, instructor: e.target.value }))}
                placeholder="Dr. Smith (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Credits
              </label>
              <Input
                type="number"
                min="0"
                max="6"
                step="0.5"
                value={formData.credits || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  credits: e.target.value ? parseFloat(e.target.value) : null 
                }))}
                placeholder="3"
              />
            </div>
          </div>

          {/* Semester & Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Semester
              </label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData(prev => ({ ...prev, semester: e.target.value }))}
                className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <option value="Spring 2025">Spring 2025</option>
                <option value="Summer 2025">Summer 2025</option>
                <option value="Fall 2025">Fall 2025</option>
                <option value="Spring 2026">Spring 2026</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1.5">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-warm-200 cursor-pointer"
                />
                <span className="text-sm text-warm-500">Calendar color</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1.5">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes... (optional)"
              rows={2}
              className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 resize-none"
            />
          </div>
        </form>

        {/* Conflict Warning */}
        {showConflictWarning && conflicts.length > 0 && (
          <div className="mx-6 mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <IconWarning size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-amber-800 mb-1">
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
                      <span className="text-amber-600 ml-2">
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
                      className="bg-amber-600 hover:bg-amber-700"
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm-100 bg-warm-50">
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
      </div>
    </div>
  );
}
