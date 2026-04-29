'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconX, IconCheck, IconPencil, IconTrash, IconClock, IconMapPin, IconCalendar, IconUser, IconSparkles } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, type ParsedClass } from '@/lib/utils/schedule-parser';

interface ConfirmClassesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (classes: ParsedClass[]) => Promise<void>;
  parsedClasses: ParsedClass[];
}

const DAYS = [
  { abbrev: 'M', label: 'Mon' },
  { abbrev: 'T', label: 'Tue' },
  { abbrev: 'W', label: 'Wed' },
  { abbrev: 'Th', label: 'Thu' },
  { abbrev: 'F', label: 'Fri' },
];

export function ConfirmClassesModal({ isOpen, onClose, onConfirm, parsedClasses }: ConfirmClassesModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [classes, setClasses] = useState<ParsedClass[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [semesterStartDate, setSemesterStartDate] = useState<string>('');

  useEffect(() => {
    if (parsedClasses.length > 0) {
      setClasses(parsedClasses.map(c => ({ ...c, color: c.color || generateClassColor() })));

      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      const defaultDate = nextMonday.toISOString().split('T')[0];
      setSemesterStartDate(defaultDate || '');
    }
  }, [parsedClasses]);

  // Summary stats
  const stats = useMemo(() => {
    const totalCredits = classes.reduce((sum, c) => sum + (c.credits || 0), 0);
    const uniqueDays = new Set(classes.flatMap(c => c.days));
    const withTime = classes.filter(c => c.start_time).length;
    return { totalCredits, daysPerWeek: uniqueDays.size, withTime };
  }, [classes]);

  if (!isOpen) return null;

  const handleEdit = (index: number) => {
    setEditingIndex(index);
  };

  const handleSaveEdit = () => {
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    setClasses(prev => prev.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, field: keyof ParsedClass, value: string | string[] | number | null) => {
    setClasses(prev => prev.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    ));
  };

  const handleDayToggle = (index: number, day: string) => {
    setClasses(prev => prev.map((c, i) => {
      if (i !== index) return c;
      const days = c.days.includes(day)
        ? c.days.filter(d => d !== day)
        : [...c.days, day].sort((a, b) => {
            const order = ['M', 'T', 'W', 'Th', 'F'];
            return order.indexOf(a) - order.indexOf(b);
          });
      return { ...c, days };
    }));
  };

  const handleConfirm = async () => {
    if (classes.length === 0 || !semesterStartDate) return;

    setLoading(true);
    try {
      const classesWithStartDate = classes.map(cls => ({
        ...cls,
        semesterStartDate,
      }));
      await onConfirm(classesWithStartDate);
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-warm-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirm-classes-title" className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl glass-prominent rounded-2xl shadow-2xl max-h-[90vh] overflow-clip flex flex-col">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-teal-500" />

        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-1 h-px pointer-events-none z-10"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }}
        />

        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <IconSparkles size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 id="confirm-classes-title" className="text-lg font-semibold text-warm-900">Review Your Schedule</h2>
                <p className="text-sm text-warm-500 mt-0.5">
                  We found {classes.length} class{classes.length !== 1 ? 'es' : ''} — review and confirm
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors -mt-1 -mr-1"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Quick Stats */}
          {classes.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warm-50 text-sm">
                <span className="text-warm-400 font-medium">{classes.length}</span>
                <span className="text-warm-500">classes</span>
              </div>
              {stats.totalCredits > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warm-50 text-sm">
                  <span className="text-warm-400 font-medium">{stats.totalCredits}</span>
                  <span className="text-warm-500">credits</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warm-50 text-sm">
                <span className="text-warm-400 font-medium">{stats.daysPerWeek}</span>
                <span className="text-warm-500">days/week</span>
              </div>
              {stats.withTime < classes.length && (
                <Badge variant="warning" size="sm">
                  {classes.length - stats.withTime} missing time
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-warm-100 mx-6" />

        {/* Class List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {classes.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-3">
                <IconCalendar size={24} className="text-warm-400" />
              </div>
              <p className="text-warm-500 font-medium">No classes found</p>
              <p className="text-sm text-warm-400 mt-1">Try pasting your schedule text again</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map((cls, index) => (
                <div
                  key={cls.id}
                  className={cn(
                    'rounded-xl border transition-all duration-200',
                    editingIndex === index
                      ? 'border-primary-400 ring-2 ring-primary-400/20 bg-white shadow-md'
                      : 'border-warm-150 bg-cream-100/68 hover:bg-white hover:shadow-sm hover:border-warm-200'
                  )}
                >
                  {editingIndex === index ? (
                    /* ── Edit Mode ── */
                    <div className="p-5 space-y-4">
                      {/* Course code + name */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Course Code</label>
                          <Input
                            value={cls.course_code}
                            onChange={(e) => handleFieldChange(index, 'course_code', e.target.value.toUpperCase())}
                            className="text-sm font-mono"
                            placeholder="MATH 101"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Course Name</label>
                          <Input
                            value={cls.course_name}
                            onChange={(e) => handleFieldChange(index, 'course_name', e.target.value)}
                            className="text-sm"
                            placeholder="Introduction to Calculus"
                          />
                        </div>
                      </div>

                      {/* Days */}
                      <div>
                        <label className="block text-xs font-medium text-warm-500 mb-2 uppercase tracking-wider">Meeting Days</label>
                        <div className="flex gap-2">
                          {DAYS.map(day => (
                            <button
                              key={day.abbrev}
                              type="button"
                              onClick={() => handleDayToggle(index, day.abbrev)}
                              className={cn(
                                'flex-1 h-10 rounded-lg text-xs font-semibold transition-all duration-150',
                                cls.days.includes(day.abbrev)
                                  ? 'text-white shadow-sm'
                                  : 'bg-warm-50 text-warm-400 hover:bg-warm-100 active:bg-warm-200 hover:text-warm-600'
                              )}
                              style={cls.days.includes(day.abbrev) ? { backgroundColor: cls.color || '#16A34A' } : undefined}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time + Location + Instructor */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Start</label>
                          <Input
                            type="time"
                            value={cls.start_time}
                            onChange={(e) => handleFieldChange(index, 'start_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">End</label>
                          <Input
                            type="time"
                            value={cls.end_time}
                            onChange={(e) => handleFieldChange(index, 'end_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Location</label>
                          <Input
                            value={cls.location || `${cls.building || ''} ${cls.room || ''}`.trim()}
                            onChange={(e) => handleFieldChange(index, 'location', e.target.value)}
                            placeholder="HAL 101"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-warm-500 mb-1.5 uppercase tracking-wider">Professor</label>
                          <Input
                            value={cls.instructor}
                            onChange={(e) => handleFieldChange(index, 'instructor', e.target.value)}
                            placeholder="Dr. Smith"
                            className="text-sm"
                          />
                        </div>
                      </div>

                      {/* Save */}
                      <div className="flex justify-end pt-1">
                        <Button size="sm" onClick={handleSaveEdit} className="gap-1.5 rounded-lg">
                          <IconCheck size={14} />
                          Done
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ── View Mode ── */
                    <div className="p-4 flex items-center gap-4">
                      {/* Color accent */}
                      <div
                        className="w-1.5 h-14 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cls.color || '#16A34A' }}
                      />

                      {/* Course info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {cls.course_code && (
                            <span
                              className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${cls.color || '#16A34A'}15`,
                                color: cls.color || '#16A34A',
                              }}
                            >
                              {cls.course_code}
                            </span>
                          )}
                          <span className="text-warm-900 font-medium text-sm truncate">
                            {cls.course_name || 'Untitled Class'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          {cls.days.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-warm-500">
                              <IconCalendar size={12} className="text-warm-400" />
                              <span className="font-medium">{formatDaysDisplay(cls.days)}</span>
                            </span>
                          )}
                          {cls.start_time && cls.end_time && (
                            <span className="flex items-center gap-1 text-xs text-warm-500">
                              <IconClock size={12} className="text-warm-400" />
                              {formatTimeDisplay(cls.start_time)} – {formatTimeDisplay(cls.end_time)}
                            </span>
                          )}
                          {(cls.location || cls.building) && (
                            <span className="flex items-center gap-1 text-xs text-warm-500">
                              <IconMapPin size={12} className="text-warm-400" />
                              {cls.location || `${cls.building} ${cls.room}`.trim()}
                            </span>
                          )}
                          {cls.instructor && (
                            <span className="flex items-center gap-1 text-xs text-warm-400">
                              <IconUser size={12} />
                              {cls.instructor}
                            </span>
                          )}
                          {cls.credits && (
                            <span className="text-xs text-warm-400">{cls.credits} cr</span>
                          )}
                        </div>

                        {/* Warnings */}
                        {(!cls.start_time || cls.days.length === 0) && (
                          <div className="flex items-center gap-2 mt-1.5">
                            {!cls.start_time && (
                              <span className="text-micro font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Missing time
                              </span>
                            )}
                            {cls.days.length === 0 && (
                              <span className="text-micro font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Missing days
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(index)}
                          className="p-2 text-warm-300 hover:text-primary-600 hover:bg-primary-50 active:bg-primary-100 rounded-lg transition-all duration-150"
                          title="Edit class"
                        >
                          <IconPencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-2 text-warm-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150"
                          title="Remove class"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-warm-100 bg-warm-50/80 backdrop-blur-sm">
          {/* Semester Start Date */}
          <div className="px-6 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-warm-700 mb-1.5 uppercase tracking-wider">
                  Semester Start Date
                </label>
                <Input
                  type="date"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  className="max-w-[200px] text-sm h-9 bg-white"
                  required
                />
              </div>
              <p className="text-xs text-warm-400 max-w-[240px]">
                Classes will repeat weekly on the calendar from this date through the end of the semester.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-6 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] sm:pb-4 flex items-center justify-between">
            <p className="text-xs text-warm-400">
              {classes.length} class{classes.length !== 1 ? 'es' : ''} will sync to your calendar
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                isLoading={loading}
                disabled={classes.length === 0 || !semesterStartDate || loading}
                className="gap-1.5 rounded-lg px-5"
              >
                <IconCheck size={14} />
                Confirm {classes.length} Class{classes.length !== 1 ? 'es' : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
