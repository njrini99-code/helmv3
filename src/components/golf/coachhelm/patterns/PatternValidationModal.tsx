'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconX,
  IconCheck,
  IconTarget,
  IconSparkles,
} from '@/components/icons';
import type { ExtendedPattern, PatternSeverity } from '@/app/golf/actions/pattern-management';

// ============================================================================
// TYPES
// ============================================================================

interface PatternValidationModalProps {
  pattern: ExtendedPattern;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (validation: {
    isAccurate: boolean;
    severity: PatternSeverity;
    notes?: string;
    createFocusArea?: boolean;
  }) => void;
  isLoading?: boolean;
}

// ============================================================================
// SEVERITY OPTIONS
// ============================================================================

const severityOptions: Array<{
  value: PatternSeverity;
  label: string;
  description: string;
  color: string;
  bg: string;
}> = [
  {
    value: 'critical',
    label: 'Critical',
    description: 'Major performance impact requiring immediate attention',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200 hover:border-red-400',
  },
  {
    value: 'high',
    label: 'High',
    description: 'Significant impact that should be addressed soon',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200 hover:border-orange-400',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Moderate impact worth addressing when time permits',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200 hover:border-amber-400',
  },
  {
    value: 'low',
    label: 'Low',
    description: 'Minor impact, monitor but not urgent',
    color: 'text-slate-700',
    bg: 'bg-slate-50 border-slate-200 hover:border-slate-400',
  },
];

// ============================================================================
// PATTERN VALIDATION MODAL COMPONENT
// ============================================================================

export function PatternValidationModal({
  pattern,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: PatternValidationModalProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<PatternSeverity>(pattern.severity);
  const [notes, setNotes] = useState('');
  const [createFocusArea, setCreateFocusArea] = useState(true);

  const handleConfirm = () => {
    onSubmit({
      isAccurate: true,
      severity: selectedSeverity,
      notes: notes.trim() || undefined,
      createFocusArea,
    });
  };

  const handleReject = () => {
    onSubmit({
      isAccurate: false,
      severity: selectedSeverity,
      notes: notes.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <IconSparkles size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Validate Pattern
                    </h2>
                    <p className="text-sm text-slate-500">
                      Review and confirm AI-detected pattern
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <IconX size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                {/* Pattern summary */}
                <div className="p-4 bg-slate-50 rounded-xl mb-6">
                  <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Pattern Description
                  </h3>
                  <p className="text-slate-800">
                    {pattern.description || 'Performance pattern detected'}
                  </p>
                  {pattern.playerName && (
                    <p className="text-sm text-slate-500 mt-2">
                      Player: <span className="font-medium text-slate-700">{pattern.playerName}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-slate-500">
                      Impact:{' '}
                      <span className={cn(
                        'font-semibold',
                        pattern.strokeImpact > 0 ? 'text-red-600' : 'text-green-600'
                      )}>
                        {pattern.strokeImpact > 0 ? '+' : ''}{pattern.strokeImpact.toFixed(1)} strokes
                      </span>
                    </span>
                    <span className="text-slate-500">
                      Confidence:{' '}
                      <span className="font-semibold text-slate-700">
                        {Math.round(pattern.confidence * 100)}%
                      </span>
                    </span>
                  </div>
                </div>

                {/* Severity selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Severity Level
                  </label>
                  <div className="space-y-2">
                    {severityOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedSeverity(option.value)}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                          selectedSeverity === option.value
                            ? cn(option.bg, 'border-current ring-2 ring-offset-2', option.color.replace('text-', 'ring-'))
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        )}
                      >
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5',
                          selectedSeverity === option.value
                            ? cn('border-current bg-current', option.color)
                            : 'border-slate-300'
                        )}>
                          {selectedSeverity === option.value && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div>
                          <div className={cn(
                            'font-medium',
                            selectedSeverity === option.value ? option.color : 'text-slate-700'
                          )}>
                            {option.label}
                          </div>
                          <div className="text-sm text-slate-500">
                            {option.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add any observations or context about this pattern..."
                    rows={3}
                    className={cn(
                      'w-full px-4 py-3 rounded-xl border border-slate-200',
                      'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                      'text-slate-800 placeholder:text-slate-400 resize-none',
                      'transition-colors'
                    )}
                  />
                </div>

                {/* Create focus area toggle */}
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <IconTarget size={16} className="text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-green-800">
                        Create Focus Area
                      </div>
                      <div className="text-sm text-green-600">
                        Add to player&apos;s development focus areas
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createFocusArea}
                    onClick={() => setCreateFocusArea(!createFocusArea)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      createFocusArea ? 'bg-green-600' : 'bg-slate-300'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                        createFocusArea ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                <button
                  onClick={handleReject}
                  disabled={isLoading}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                    'text-slate-600 hover:text-slate-800 hover:bg-slate-200',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <IconX size={16} />
                  Pattern is Incorrect
                </button>

                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
                    'bg-primary-600 text-white hover:bg-primary-700',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <IconCheck size={16} />
                  )}
                  Confirm Pattern
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
