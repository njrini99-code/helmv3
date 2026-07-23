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
              <span className="font-mono text-sm font-medium text-accent-700">
                {classData.course_code}
              </span>
              <DrawerTitle id="class-detail-title" className="text-h3 font-medium text-text-primary tracking-[-0.015em] mt-1">
                {classData.course_name || 'Untitled Class'}
              </DrawerTitle>
              {classData.semester.trim() && (
                <p className="text-sm text-text-tertiary mt-1">{classData.semester}</p>
              )}
            </div>
            <IconButton variant="default"
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken active:bg-surface-sunken rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
            >
              <IconX size={20} />
            </IconButton>
          </div>
        </div>
        
        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Schedule */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
              <IconClock size={20} className="text-text-tertiary" />
            </div>
            <div>
              <p className="font-medium text-text-primary">
                {classData.days.length > 0 ? formatDaysDisplay(classData.days) : 'No days set'}
              </p>
              <p className="text-sm text-text-tertiary">
                {classData.start_time && classData.end_time
                  ? `${formatTimeDisplay(classData.start_time)} - ${formatTimeDisplay(classData.end_time)}`
                  : 'No time set'}
              </p>
            </div>
          </div>

          {/* Location */}
          {(classData.location || classData.building || classData.room) && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
                <IconMapPin size={20} className="text-text-tertiary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">
                  {classData.location || `${classData.building} ${classData.room}`.trim()}
                </p>
                <p className="text-sm text-text-tertiary">Location</p>
              </div>
            </div>
          )}

          {/* Instructor */}
          {classData.instructor && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
                <IconUser size={20} className="text-text-tertiary" />
              </div>
              <div>
                <p className="font-medium text-text-primary">{classData.instructor}</p>
                <p className="text-sm text-text-tertiary">Instructor</p>
              </div>
            </div>
          )}

          {/* Credits */}
          {classData.credits && (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 bg-surface-sunken rounded-md text-text-secondary font-medium">
                {classData.credits} credits
              </span>
            </div>
          )}

          {/* Notes */}
          {classData.notes && (
            <div className="p-3 bg-surface-sunken rounded-xl">
              <p className="text-xs font-medium text-text-tertiary mb-1">Notes</p>
              <p className="text-sm text-text-secondary">{classData.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-surface-sunken">
          <Button
            variant="secondary"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="text-fw-danger hover:bg-fw-danger-bg transition-colors"
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
