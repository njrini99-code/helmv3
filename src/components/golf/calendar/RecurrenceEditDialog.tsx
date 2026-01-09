'use client';

/**
 * RecurrenceEditDialog Component
 *
 * Shows options when editing/deleting a recurring event:
 * - This event only
 * - This and future events
 * - All events in the series
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { RecurringEditScope } from '@/app/golf/actions/recurring-events';
import { Calendar, CalendarDays, CalendarRange } from 'lucide-react';

interface RecurrenceEditDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: RecurringEditScope) => void;
  action: 'edit' | 'delete';
  eventTitle: string;
  originalDate: Date;
}

export function RecurrenceEditDialog({
  open,
  onClose,
  onConfirm,
  action,
  eventTitle,
  originalDate,
}: RecurrenceEditDialogProps) {
  const [scope, setScope] = useState<RecurringEditScope>('this');

  const handleConfirm = () => {
    onConfirm(scope);
    onClose();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === 'edit' ? 'Edit' : 'Delete'} Recurring Event
          </DialogTitle>
          <DialogDescription>
            "{eventTitle}" is a recurring event. How would you like to proceed?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value as RecurringEditScope)}
          >
            {/* This event only */}
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
              <RadioGroupItem value="this" id="scope-this" className="mt-1" />
              <Label htmlFor="scope-this" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">This event only</span>
                </div>
                <p className="text-sm text-slate-500">
                  {action === 'edit' ? 'Edit' : 'Delete'} only the event on{' '}
                  {formatDate(originalDate)}
                </p>
              </Label>
            </div>

            {/* This and future events */}
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
              <RadioGroupItem value="thisAndFuture" id="scope-future" className="mt-1" />
              <Label htmlFor="scope-future" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarRange className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">This and future events</span>
                </div>
                <p className="text-sm text-slate-500">
                  {action === 'edit' ? 'Edit' : 'Delete'} this event and all future occurrences
                </p>
              </Label>
            </div>

            {/* All events */}
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
              <RadioGroupItem value="all" id="scope-all" className="mt-1" />
              <Label htmlFor="scope-all" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">All events in the series</span>
                </div>
                <p className="text-sm text-slate-500">
                  {action === 'edit' ? 'Edit' : 'Delete'} all occurrences of this recurring event
                </p>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant={action === 'delete' ? 'danger' : 'primary'}
            className="flex-1"
          >
            {action === 'edit' ? 'Continue' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
