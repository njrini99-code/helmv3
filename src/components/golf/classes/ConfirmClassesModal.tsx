'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconX, IconCheck, IconPencil, IconTrash } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, type ParsedClass } from '@/lib/utils/schedule-parser';

interface ConfirmClassesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (classes: ParsedClass[]) => Promise<void>;
  parsedClasses: ParsedClass[];
}

const DAYS = [
  { abbrev: 'M', label: 'M' },
  { abbrev: 'T', label: 'T' },
  { abbrev: 'W', label: 'W' },
  { abbrev: 'Th', label: 'Th' },
  { abbrev: 'F', label: 'F' },
];

export function ConfirmClassesModal({ isOpen, onClose, onConfirm, parsedClasses }: ConfirmClassesModalProps) {
  const [classes, setClasses] = useState<ParsedClass[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [semesterStartDate, setSemesterStartDate] = useState<string>('');

  // Update classes when parsedClasses prop changes
  useEffect(() => {
    if (parsedClasses.length > 0) {
      setClasses(parsedClasses.map(c => ({ ...c, color: generateClassColor() })));

      // Set default semester start date to next Monday
      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      const defaultDate = nextMonday.toISOString().split('T')[0];
      setSemesterStartDate(defaultDate || '');
    }
  }, [parsedClasses]);

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
    if (classes.length === 0) {
      return;
    }

    if (!semesterStartDate) {
      alert('Please select a semester start date');
      return;
    }

    setLoading(true);

    try {
      // Add semester start date to each class
      const classesWithStartDate = classes.map(cls => ({
        ...cls,
        semesterStartDate, // Add custom start date
      }));
      await onConfirm(classesWithStartDate);
    } catch {
      // Error handled by parent component
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-3xl mx-4 glass-prominent rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Review Classes</h2>
            <p className="text-sm text-slate-500">
              {classes.length} class{classes.length !== 1 ? 'es' : ''} found - edit or confirm
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {classes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No classes to confirm</p>
            </div>
          ) : (
            <div className="space-y-4">
              {classes.map((cls, index) => (
                <div
                  key={cls.id}
                  className={cn(
                    'border rounded-xl overflow-hidden transition-all',
                    editingIndex === index 
                      ? 'border-green-500 ring-2 ring-green-500/20' 
                      : 'border-slate-200'
                  )}
                >
                  {editingIndex === index ? (
                    /* Edit Mode */
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Course ID</label>
                          <Input
                            value={cls.course_code}
                            onChange={(e) => handleFieldChange(index, 'course_code', e.target.value.toUpperCase())}
                            className="text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Course Name</label>
                          <Input
                            value={cls.course_name}
                            onChange={(e) => handleFieldChange(index, 'course_name', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-2">Days</label>
                        <div className="flex gap-2">
                          {DAYS.map(day => (
                            <button
                              key={day.abbrev}
                              type="button"
                              onClick={() => handleDayToggle(index, day.abbrev)}
                              className={cn(
                                'w-9 h-9 rounded-lg text-xs font-medium transition-all',
                                cls.days.includes(day.abbrev)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              )}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Start</label>
                          <Input
                            type="time"
                            value={cls.start_time}
                            onChange={(e) => handleFieldChange(index, 'start_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">End</label>
                          <Input
                            type="time"
                            value={cls.end_time}
                            onChange={(e) => handleFieldChange(index, 'end_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                          <Input
                            value={cls.location}
                            onChange={(e) => handleFieldChange(index, 'location', e.target.value)}
                            placeholder="HAL 101"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Professor</label>
                          <Input
                            value={cls.instructor}
                            onChange={(e) => handleFieldChange(index, 'instructor', e.target.value)}
                            placeholder="Optional"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end">
                        <Button size="sm" onClick={handleSaveEdit} className="gap-1">
                          <IconCheck size={16} />
                          Done Editing
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div className="p-4 flex items-center gap-4">
                      {/* Color indicator */}
                      <div
                        className="w-2 h-12 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cls.color || '#16A34A' }}
                      />
                      
                      {/* Class info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-green-600">
                            {cls.course_code}
                          </span>
                          <span className="text-slate-900 font-medium truncate">
                            {cls.course_name || 'Untitled Class'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          {cls.days.length > 0 && (
                            <span className="font-medium">
                              {formatDaysDisplay(cls.days)}
                            </span>
                          )}
                          {cls.start_time && cls.end_time && (
                            <span>
                              {formatTimeDisplay(cls.start_time)} - {formatTimeDisplay(cls.end_time)}
                            </span>
                          )}
                          {cls.location && (
                            <span>{cls.location}</span>
                          )}
                          {cls.instructor && (
                            <span className="text-slate-400">{cls.instructor}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(index)}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <IconPencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <IconTrash size={18} />
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
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-4">
          <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-4">
            <label className="block text-sm font-medium text-slate-900 mb-2 text-base">
              ⚠️ REQUIRED: When does the semester start?
            </label>
            <Input
              type="date"
              value={semesterStartDate}
              onChange={(e) => setSemesterStartDate(e.target.value)}
              className="max-w-xs bg-white border-2 border-slate-300 text-base h-12"
              required
              placeholder="Select semester start date"
            />
            <p className="text-sm text-slate-700 mt-2 font-medium">
              👉 Your classes will appear on the calendar starting from this date
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Default: {semesterStartDate || 'Not set'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {classes.length} class{classes.length !== 1 ? 'es' : ''} will sync to your calendar
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                isLoading={loading}
                disabled={classes.length === 0 || !semesterStartDate}
                className="gap-2"
              >
                <IconCheck size={18} />
                Add {classes.length} Class{classes.length !== 1 ? 'es' : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
