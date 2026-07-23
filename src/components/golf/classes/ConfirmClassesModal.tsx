'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IconX, IconCheck, IconPencil, IconTrash, IconClock, IconMapPin, IconCalendar, IconUser, IconSparkles } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, type ParsedClass } from '@/lib/utils/schedule-parser';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

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
  { abbrev: 'Sa', label: 'Sat' },
  { abbrev: 'Su', label: 'Sun' },
];

// Canonical brand green fallback when a parsed class has no assigned color.
// Sourced from the design token so it stays in sync with primary-600.
const DEFAULT_CLASS_COLOR = 'var(--color-primary-600)';

export function ConfirmClassesModal({ isOpen, onClose, onConfirm, parsedClasses }: ConfirmClassesModalProps) {
  const uid = useId();
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
            const order = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
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
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-2xl sm:mx-auto sm:rounded-3xl p-0 overflow-hidden flex flex-col"
        aria-labelledby="confirm-classes-title"
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-accent-500 via-accent-400 to-accent-700" />

        {/* Header */}
        <div className="px-6 pt-3 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
                <IconSparkles size={20} className="text-accent-700" />
              </div>
              <div>
                <DrawerTitle id="confirm-classes-title" className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
                  Review Your Schedule
                </DrawerTitle>
                <p className="text-sm text-text-tertiary mt-0.5">
                  We found {classes.length} class{classes.length !== 1 ? 'es' : ''} — review and confirm
                </p>
              </div>
            </div>
            <IconButton variant="default"
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken active:bg-surface-sunken rounded-lg transition-colors -mt-1 -mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
            >
              <IconX size={18} />
            </IconButton>
          </div>

          {/* Quick Stats */}
          {classes.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-sunken text-sm">
                <span className="text-text-secondary font-medium">{classes.length}</span>
                <span className="text-text-tertiary">classes</span>
              </div>
              {stats.totalCredits > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-sunken text-sm">
                  <span className="text-text-secondary font-medium">{stats.totalCredits}</span>
                  <span className="text-text-tertiary">credits</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-sunken text-sm">
                <span className="text-text-secondary font-medium">{stats.daysPerWeek}</span>
                <span className="text-text-tertiary">days/week</span>
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
        <div className="h-px bg-border-subtle mx-6" />

        {/* Class List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {classes.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto mb-3">
                <IconCalendar size={24} className="text-text-tertiary" />
              </div>
              <p className="text-text-secondary font-medium">No classes found</p>
              <p className="text-sm text-text-tertiary mt-1">Try pasting your schedule text again</p>
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map((cls, index) => (
                <div
                  key={cls.id}
                  className={cn(
                    'rounded-xl border transition-all duration-200',
                    editingIndex === index
                      ? 'border-accent-500 ring-2 ring-accent-500/20 bg-surface shadow-md'
                      : 'border-border-subtle bg-surface-sunken hover:bg-surface hover:shadow-sm hover:border-border-strong'
                  )}
                >
                  {editingIndex === index ? (
                    /* ── Edit Mode ── */
                    <div className="p-5 space-y-4">
                      {/* Course code + name */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor={`${uid}-${index}-course-code`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">Course Code</label>
                          <Input
                            id={`${uid}-${index}-course-code`}
                            value={cls.course_code}
                            onChange={(e) => handleFieldChange(index, 'course_code', e.target.value.toUpperCase())}
                            className="text-sm font-mono"
                            placeholder="MATH 101"
                          />
                        </div>
                        <div className="col-span-2">
                          <label htmlFor={`${uid}-${index}-course-name`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">Course Name</label>
                          <Input
                            id={`${uid}-${index}-course-name`}
                            value={cls.course_name}
                            onChange={(e) => handleFieldChange(index, 'course_name', e.target.value)}
                            className="text-sm"
                            placeholder="Introduction to Calculus"
                          />
                        </div>
                      </div>

                      {/* Days */}
                      <div>
                        <p className="block text-xs font-medium text-text-tertiary mb-2 uppercase tracking-wider">Meeting Days</p>
                        <div className="flex gap-2">
                          {DAYS.map(day => (
                            <Button variant="ghost"
                              key={day.abbrev}
                              type="button"
                              onClick={() => handleDayToggle(index, day.abbrev)}
                              className={cn(
                                'flex-1 h-10 rounded-lg text-xs font-medium transition-all duration-150',
                                cls.days.includes(day.abbrev)
                                  ? 'text-text-on-accent shadow-sm'
                                  : 'bg-surface-sunken text-text-tertiary hover:bg-surface-sunken/80 active:bg-surface-sunken hover:text-text-secondary'
                              )}
                              style={cls.days.includes(day.abbrev) ? { backgroundColor: cls.color || DEFAULT_CLASS_COLOR } : undefined}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Time + Location + Instructor */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label htmlFor={`${uid}-${index}-start`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">Start</label>
                          <Input
                            id={`${uid}-${index}-start`}
                            type="time"
                            value={cls.start_time}
                            onChange={(e) => handleFieldChange(index, 'start_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`${uid}-${index}-end`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">End</label>
                          <Input
                            id={`${uid}-${index}-end`}
                            type="time"
                            value={cls.end_time}
                            onChange={(e) => handleFieldChange(index, 'end_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`${uid}-${index}-location`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">Location</label>
                          <Input
                            id={`${uid}-${index}-location`}
                            value={cls.location || `${cls.building || ''} ${cls.room || ''}`.trim()}
                            onChange={(e) => handleFieldChange(index, 'location', e.target.value)}
                            placeholder="HAL 101"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`${uid}-${index}-professor`} className="block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wider">Professor</label>
                          <Input
                            id={`${uid}-${index}-professor`}
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
                        style={{ backgroundColor: cls.color || DEFAULT_CLASS_COLOR }}
                      />

                      {/* Course info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {cls.course_code && (
                            <span
                              className="font-mono text-eyebrow font-medium px-1.5 py-0.5 rounded"
                              style={{
                                // ~8% tint of the class color (was a `${color}15` hex-alpha
                                // hack; color-mix keeps it valid when the color is a token var).
                                backgroundColor: `color-mix(in srgb, ${cls.color || DEFAULT_CLASS_COLOR} 8%, transparent)`,
                                color: cls.color || DEFAULT_CLASS_COLOR,
                              }}
                            >
                              {cls.course_code}
                            </span>
                          )}
                          <span className="text-text-primary font-medium text-sm truncate">
                            {cls.course_name || 'Untitled Class'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          {cls.days.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <IconCalendar size={12} className="text-text-tertiary" />
                              <span className="font-medium">{formatDaysDisplay(cls.days)}</span>
                            </span>
                          )}
                          {cls.start_time && cls.end_time && (
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <IconClock size={12} className="text-text-tertiary" />
                              {formatTimeDisplay(cls.start_time)} – {formatTimeDisplay(cls.end_time)}
                            </span>
                          )}
                          {(cls.location || cls.building) && (
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <IconMapPin size={12} className="text-text-tertiary" />
                              {cls.location || `${cls.building} ${cls.room}`.trim()}
                            </span>
                          )}
                          {cls.instructor && (
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <IconUser size={12} />
                              {cls.instructor}
                            </span>
                          )}
                          {cls.credits && (
                            <span className="text-xs text-text-tertiary">{cls.credits} cr</span>
                          )}
                        </div>

                        {/* Warnings */}
                        {(!cls.start_time || cls.days.length === 0) && (
                          <div className="flex items-center gap-2 mt-1.5">
                            {!cls.start_time && (
                              <span className="text-micro font-medium text-fw-warning bg-fw-warning-bg px-1.5 py-0.5 rounded">
                                Missing time
                              </span>
                            )}
                            {cls.days.length === 0 && (
                              <span className="text-micro font-medium text-fw-warning bg-fw-warning-bg px-1.5 py-0.5 rounded">
                                Missing days
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <IconButton variant="primary" aria-label="Edit"
                          onClick={() => handleEdit(index)}
                          className="p-2 text-text-tertiary hover:text-accent-700 hover:bg-accent-500/10 active:bg-accent-500/15 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                          title="Edit class"
                        >
                          <IconPencil size={16} />
                        </IconButton>
                        <IconButton variant="default" aria-label="Delete"
                          onClick={() => handleDelete(index)}
                          className="p-2 text-text-tertiary hover:text-fw-danger hover:bg-fw-danger-bg rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                          title="Remove class"
                        >
                          <IconTrash size={16} />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-subtle bg-surface-sunken/80 backdrop-blur-sm">
          {/* Semester Start Date */}
          <div className="px-6 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label htmlFor={`${uid}-semester-start`} className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Semester Start Date
                </label>
                <Input
                  id={`${uid}-semester-start`}
                  type="date"
                  value={semesterStartDate}
                  onChange={(e) => setSemesterStartDate(e.target.value)}
                  className="max-w-[200px] text-sm h-9 bg-surface"
                  required
                />
              </div>
              <p className="text-xs text-text-tertiary max-w-[240px]">
                Classes will repeat weekly on the calendar from this date through the end of the semester.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-6 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] sm:pb-4 flex items-center justify-between">
            <p className="text-xs text-text-tertiary">
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
      </DrawerContent>
    </Drawer>
  );
}
