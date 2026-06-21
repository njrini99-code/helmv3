'use client';

import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconX, IconClock, IconMapPin, IconUser } from '@/components/icons';
import { formatTimeDisplay, formatDaysDisplay } from '@/lib/utils/schedule-parser';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!classData) return null;

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
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-md sm:mx-auto sm:rounded-3xl p-0 overflow-hidden"
        aria-labelledby="class-detail-title"
      >
        {/* Color header */}
        <div
          className="h-3"
          style={{ backgroundColor: classData.color || 'var(--color-primary-600)' }}
        />

        {/* Header */}
        <div className="px-6 pt-3 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-sm font-medium text-primary-600">
                {classData.course_code}
              </span>
              <DrawerTitle id="class-detail-title" className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mt-1">
                {classData.course_name || 'Untitled Class'}
              </DrawerTitle>
              {classData.semester.trim() && (
                <p className="text-sm text-warm-500 mt-1">{classData.semester}</p>
              )}
            </div>
            <IconButton variant="default"
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
            >
              <IconX size={20} />
            </IconButton>
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
      </DrawerContent>
    </Drawer>
  );
}
