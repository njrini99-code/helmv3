'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconX, IconClock, IconMapPin, IconUser } from '@/components/icons';
import { formatTimeDisplay, formatDaysDisplay } from '@/lib/utils/schedule-parser';

interface ClassDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  classData: {
    id: string;
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
  } | null;
}

export function ClassDetailModal({ isOpen, onClose, onEdit, onDelete, classData }: ClassDetailModalProps) {
  const [deleting, setDeleting] = useState(false);

  if (!isOpen || !classData) return null;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this class?')) return;
    
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
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
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Color header */}
        <div 
          className="h-3"
          style={{ backgroundColor: classData.color || '#16A34A' }}
        />
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-sm font-semibold text-green-600">
                {classData.course_code}
              </span>
              <h2 className="text-xl font-semibold text-slate-900 mt-1">
                {classData.course_name || 'Untitled Class'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{classData.semester}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 pb-6 space-y-4">
          {/* Schedule */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <IconClock size={20} className="text-slate-500" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {classData.days.length > 0 ? formatDaysDisplay(classData.days) : 'No days set'}
              </p>
              <p className="text-sm text-slate-500">
                {classData.start_time && classData.end_time
                  ? `${formatTimeDisplay(classData.start_time)} - ${formatTimeDisplay(classData.end_time)}`
                  : 'No time set'}
              </p>
            </div>
          </div>

          {/* Location */}
          {(classData.location || classData.building || classData.room) && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <IconMapPin size={20} className="text-slate-500" />
              </div>
              <div>
                <p className="font-medium text-slate-900">
                  {classData.location || `${classData.building} ${classData.room}`.trim()}
                </p>
                <p className="text-sm text-slate-500">Location</p>
              </div>
            </div>
          )}

          {/* Instructor */}
          {classData.instructor && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <IconUser size={20} className="text-slate-500" />
              </div>
              <div>
                <p className="font-medium text-slate-900">{classData.instructor}</p>
                <p className="text-sm text-slate-500">Instructor</p>
              </div>
            </div>
          )}

          {/* Credits */}
          {classData.credits && (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-600 font-medium">
                {classData.credits} credits
              </span>
            </div>
          )}

          {/* Notes */}
          {classData.notes && (
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
              <p className="text-sm text-slate-700">{classData.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
          <Button 
            variant="secondary" 
            onClick={handleDelete}
            loading={deleting}
            className="text-red-600 hover:bg-red-50"
          >
            Delete
          </Button>
          <Button onClick={onEdit}>
            Edit Class
          </Button>
        </div>
      </div>
    </div>
  );
}
