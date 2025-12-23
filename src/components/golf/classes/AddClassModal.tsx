'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconX, IconPlus, IconCheck } from '@/components/icons';
import { cn } from '@/lib/utils';
import { generateClassColor, detectSemester } from '@/lib/utils/schedule-parser';

interface AddClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classData: ClassFormData) => Promise<void>;
  editingClass?: ClassFormData | null;
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

export function AddClassModal({ isOpen, onClose, onSave, editingClass }: AddClassModalProps) {
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.course_code || !formData.course_name) {
      return;
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
      onClose();
    } catch (error) {
      console.error('Failed to save class:', error);
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
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingClass ? 'Edit Class' : 'Add Class'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>
        
        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Course Code & Name */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
            <label className="block text-sm font-medium text-slate-700 mb-2">
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
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Start Time
              </label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Building
              </label>
              <Input
                value={formData.building}
                onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
                placeholder="HAL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Professor
              </label>
              <Input
                value={formData.instructor}
                onChange={(e) => setFormData(prev => ({ ...prev, instructor: e.target.value }))}
                placeholder="Dr. Smith (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Semester
              </label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData(prev => ({ ...prev, semester: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
              >
                <option value="Spring 2025">Spring 2025</option>
                <option value="Summer 2025">Summer 2025</option>
                <option value="Fall 2025">Fall 2025</option>
                <option value="Spring 2026">Spring 2026</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                />
                <span className="text-sm text-slate-500">Calendar color</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes... (optional)"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={loading} className="gap-2">
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
