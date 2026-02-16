'use client';

/**
 * Absence Reason Sheet Component
 *
 * Modal for capturing absence details:
 * - Icon grid with 8 common reasons
 * - Excused toggle switch
 * - Optional notes textarea
 * - Quick reason selection
 * - Touch-optimized 64px icon buttons
 *
 * Used when coach marks player as absent.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Stethoscope,
  GraduationCap,
  Plane,
  UserX,
  AlertCircle,
  Home,
  Briefcase,
  HelpCircle,
} from 'lucide-react';
import '@/styles/calendar-tokens.css';

export interface AbsenceReasonSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AbsenceData) => Promise<void>;
  playerName: string;
}

export interface AbsenceData {
  reason: string;
  isExcused: boolean;
  notes?: string;
}

const ABSENCE_REASONS = [
  { icon: Stethoscope, label: 'Illness', value: 'Illness' },
  { icon: Stethoscope, label: 'Injury', value: 'Injury' },
  { icon: GraduationCap, label: 'Academic', value: 'Academic commitment' },
  { icon: Plane, label: 'Travel', value: 'Travel' },
  { icon: Home, label: 'Family', value: 'Family emergency' },
  { icon: Briefcase, label: 'Work', value: 'Work commitment' },
  { icon: UserX, label: 'No Show', value: 'Did not show up' },
  { icon: HelpCircle, label: 'Other', value: '' },
];

export function AbsenceReasonSheet({
  open,
  onClose,
  onSubmit,
  playerName,
}: AbsenceReasonSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [isExcused, setIsExcused] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await onSubmit({
        reason: selectedReason,
        isExcused,
        notes: notes.trim() || undefined,
      });
      // Reset form
      setSelectedReason('');
      setIsExcused(false);
      setNotes('');
      onClose();
    } catch {
      // Submission failed - dialog remains open
    } finally {
      setLoading(false);
    }
  }

  function handleReasonSelect(value: string) {
    setSelectedReason(value);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-2xl p-0 max-w-lg">
        <DialogHeader className="px-6 py-4 border-b border-warm-200">
          <DialogTitle className="text-lg font-semibold text-warm-900">
            Mark Absence
          </DialogTitle>
          <DialogDescription className="text-warm-600 text-sm mt-1">
            Recording absence for <span className="font-medium">{playerName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Reason selection grid (8 icons, 2 rows) */}
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-3">
              Reason for absence
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {ABSENCE_REASONS.map((reason) => {
                const Icon = reason.icon;
                const isSelected = selectedReason === reason.value;

                return (
                  <button
                    key={reason.label}
                    type="button"
                    onClick={() => handleReasonSelect(reason.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-xl',
                      'min-h-[80px] transition-all duration-200',
                      'touch-manipulation active:scale-95',
                      'border-2',
                      isSelected
                        ? 'bg-rose-50 border-rose-500 shadow-md'
                        : 'bg-warm-50 border-warm-200 hover:border-warm-300 hover:bg-warm-100'
                    )}
                  >
                    <Icon
                      className={cn(
                        'shrink-0 w-7 h-7',
                        isSelected ? 'text-rose-600' : 'text-warm-500'
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-medium text-center leading-tight',
                        isSelected ? 'text-rose-700' : 'text-warm-700'
                      )}
                    >
                      {reason.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Excused toggle */}
          <div className="flex items-center justify-between p-4 bg-warm-50 rounded-xl">
            <div className="flex-1">
              <p className="text-sm font-semibold text-warm-900">Mark as excused</p>
              <p className="text-xs text-warm-600 mt-0.5">
                Excused absences don't count against player
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isExcused}
                onChange={(e) => setIsExcused(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className={cn(
                  'w-11 h-6 rounded-full transition-colors',
                  'peer-focus:ring-4 peer-focus:ring-primary-100',
                  isExcused ? 'bg-primary-600' : 'bg-warm-300'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                    isExcused && 'translate-x-5'
                  )}
                />
              </div>
            </label>
          </div>

          {/* Optional notes */}
          <div>
            <label className="block text-sm font-semibold text-warm-700 mb-2">
              Additional notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional context or details..."
              className="min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-warm-500 mt-1.5">{notes.length}/500 characters</p>
          </div>

          {/* Info message */}
          <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              This absence will be recorded in the player's attendance history and may be
              visible to the player.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-warm-200 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedReason}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {loading ? 'Recording...' : 'Record Absence'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick Absence Reason Picker (inline, no modal)
 */
export function QuickAbsenceReason({
  onSelect,
  className,
}: {
  onSelect: (reason: string, isExcused: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('p-4 bg-warm-50 rounded-xl space-y-3', className)}>
      <p className="text-sm font-semibold text-warm-700">Quick absence reason</p>

      <div className="grid grid-cols-4 gap-2">
        {ABSENCE_REASONS.slice(0, 4).map((reason) => {
          const Icon = reason.icon;
          return (
            <button
              key={reason.label}
              type="button"
              onClick={() => onSelect(reason.value, false)}
              className="flex flex-col items-center gap-2 p-2.5 bg-white rounded-lg border border-warm-200 hover:border-warm-300 hover:shadow-sm transition-all"
            >
              <Icon className="w-5 h-5 text-warm-500" />
              <span className="text-xs text-warm-700 text-center leading-tight">
                {reason.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
