'use client';

import { useState } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !classData) return null;

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      onClose();
    } catch {
      // Delete failed - dialog remains open
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-warm-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="class-detail-title" className="relative w-full max-w-md mx-4 glass-prominent rounded-2xl shadow-2xl overflow-clip">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Color header */}
        <div 
          className="h-3"
          style={{ backgroundColor: classData.color || '#16A34A' }}
        />
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-sm font-semibold text-primary-600">
                {classData.course_code}
              </span>
              <h2 id="class-detail-title" className="text-xl font-semibold text-warm-900 mt-1">
                {classData.course_name || 'Untitled Class'}
              </h2>
              <p className="text-sm text-warm-500 mt-1">{classData.semester}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 pb-6 space-y-4">
          {/* Schedule */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
              <IconClock size={20} className="text-warm-500" />
            </div>
            <div>
              <p className="font-medium text-warm-900">
                {classData.days.length > 0 ? formatDaysDisplay(classData.days) : 'No days set'}
              </p>
              <p className="text-sm text-warm-500">
                {classData.start_time && classData.end_time
                  ? `${formatTimeDisplay(classData.start_time)} - ${formatTimeDisplay(classData.end_time)}`
                  : 'No time set'}
              </p>
            </div>
          </div>

          {/* Location */}
          {(classData.location || classData.building || classData.room) && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                <IconMapPin size={20} className="text-warm-500" />
              </div>
              <div>
                <p className="font-medium text-warm-900">
                  {classData.location || `${classData.building} ${classData.room}`.trim()}
                </p>
                <p className="text-sm text-warm-500">Location</p>
              </div>
            </div>
          )}

          {/* Instructor */}
          {classData.instructor && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                <IconUser size={20} className="text-warm-500" />
              </div>
              <div>
                <p className="font-medium text-warm-900">{classData.instructor}</p>
                <p className="text-sm text-warm-500">Instructor</p>
              </div>
            </div>
          )}

          {/* Credits */}
          {classData.credits && (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 bg-warm-100 rounded-md text-warm-600 font-medium">
                {classData.credits} credits
              </span>
            </div>
          )}

          {/* Notes */}
          {classData.notes && (
            <div className="p-3 bg-warm-50 rounded-xl">
              <p className="text-xs font-medium text-warm-500 mb-1">Notes</p>
              <p className="text-sm text-warm-700">{classData.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-warm-100 bg-warm-50">
          <Button
            variant="secondary"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </Button>
          <Button onClick={onEdit}>
            Edit Class
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Class"
        message={`Are you sure you want to delete ${classData.course_code}? This will remove the class and all associated calendar events. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
