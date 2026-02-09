'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  IconCheck,
  IconClock,
  IconX,
} from '@/components/icons';
import { AlertTriangle, Cloud, Smartphone } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';

// Types for conflict data
export interface ConflictData {
  id: string;
  type: 'round' | 'hole' | 'shot';
  offlineId: string;
  localVersion: Record<string, unknown>;
  serverVersion: Record<string, unknown>;
  localTimestamp: string;
  serverTimestamp: string;
  fieldDifferences: FieldDifference[];
}

export interface FieldDifference {
  field: string;
  label: string;
  localValue: unknown;
  serverValue: unknown;
}

export interface ConflictResolutionResult {
  offlineId: string;
  resolution: 'local' | 'server' | 'merge';
  mergedData?: Record<string, unknown>;
}

interface ConflictResolutionModalProps {
  conflicts: ConflictData[];
  isOpen: boolean;
  onClose: () => void;
  onResolve: (results: ConflictResolutionResult[]) => Promise<void>;
}

/**
 * ConflictResolutionModal
 *
 * Displays sync conflicts and allows users to choose how to resolve them:
 * - Keep local (device) version
 * - Keep server (cloud) version
 * - Merge (field-by-field selection)
 */
export function ConflictResolutionModal({
  conflicts,
  isOpen,
  onClose,
  onResolve,
}: ConflictResolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<ConflictResolutionResult[]>([]);
  const [selectedFields, setSelectedFields] = useState<Record<string, 'local' | 'server'>>({});
  const [resolving, setResolving] = useState(false);
  const { modalRef } = useFocusTrap(isOpen, onClose);

  const currentConflict = conflicts[currentIndex];
  const totalConflicts = conflicts.length;
  const isLastConflict = currentIndex === totalConflicts - 1;

  // Initialize selected fields when conflict changes
  const initializeSelectedFields = (conflict: ConflictData) => {
    const initial: Record<string, 'local' | 'server'> = {};
    conflict.fieldDifferences.forEach((diff) => {
      // Default to server version (safer)
      initial[diff.field] = 'server';
    });
    setSelectedFields(initial);
  };

  // Handle resolution for current conflict
  const handleResolution = (resolution: 'local' | 'server' | 'merge') => {
    if (!currentConflict) return;

    let result: ConflictResolutionResult;

    if (resolution === 'merge') {
      // Build merged data based on field selections
      const mergedData: Record<string, unknown> = { ...currentConflict.serverVersion };
      currentConflict.fieldDifferences.forEach((diff) => {
        if (selectedFields[diff.field] === 'local') {
          mergedData[diff.field] = diff.localValue;
        }
      });
      result = {
        offlineId: currentConflict.offlineId,
        resolution: 'merge',
        mergedData,
      };
    } else {
      result = {
        offlineId: currentConflict.offlineId,
        resolution,
      };
    }

    const newResolutions = [...resolutions, result];
    setResolutions(newResolutions);

    if (isLastConflict) {
      // All conflicts resolved, submit
      handleSubmitAll(newResolutions);
    } else {
      // Move to next conflict
      const nextConflict = conflicts[currentIndex + 1];
      if (nextConflict) {
        setCurrentIndex(currentIndex + 1);
        initializeSelectedFields(nextConflict);
      }
    }
  };

  const handleSubmitAll = async (finalResolutions: ConflictResolutionResult[]) => {
    setResolving(true);
    try {
      await onResolve(finalResolutions);
      onClose();
    } catch (error) {
      console.error('Error resolving conflicts:', error);
    } finally {
      setResolving(false);
    }
  };

  const toggleFieldSelection = (field: string) => {
    setSelectedFields((prev) => ({
      ...prev,
      [field]: prev[field] === 'local' ? 'server' : 'local',
    }));
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeLabel = (type: 'round' | 'hole' | 'shot'): string => {
    switch (type) {
      case 'round':
        return 'Round';
      case 'hole':
        return 'Hole';
      case 'shot':
        return 'Shot';
    }
  };

  if (!isOpen || !currentConflict) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-resolution-modal-title"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 id="conflict-resolution-modal-title" className="text-lg font-semibold text-warm-900">
                    Sync Conflict Detected
                  </h2>
                  <p className="text-sm text-warm-600">
                    {totalConflicts > 1
                      ? `Conflict ${currentIndex + 1} of ${totalConflicts}`
                      : 'Review the changes and choose which version to keep'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
              >
                <IconX size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Conflict Info */}
            <div className="flex items-center gap-2 text-sm text-warm-600">
              <span className="px-2 py-1 bg-warm-100 rounded-md font-medium">
                {getTypeLabel(currentConflict.type)}
              </span>
              <span>ID: {currentConflict.offlineId.slice(0, 8)}...</span>
            </div>

            {/* Version Comparison */}
            <div className="grid grid-cols-2 gap-4">
              {/* Local Version */}
              <div className="border border-blue-200 rounded-xl overflow-hidden">
                <div className="bg-blue-50 px-4 py-3 flex items-center gap-2">
                  <Smartphone size={18} className="text-blue-600" />
                  <span className="font-medium text-blue-900">Your Device</span>
                </div>
                <div className="px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm text-warm-500">
                    <IconClock size={14} />
                    <span>{formatTimestamp(currentConflict.localTimestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Server Version */}
              <div className="border border-green-200 rounded-xl overflow-hidden">
                <div className="bg-green-50 px-4 py-3 flex items-center gap-2">
                  <Cloud size={18} className="text-green-600" />
                  <span className="font-medium text-green-900">Server</span>
                </div>
                <div className="px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm text-warm-500">
                    <IconClock size={14} />
                    <span>{formatTimestamp(currentConflict.serverTimestamp)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Field Differences */}
            <div className="space-y-3">
              <h3 className="font-medium text-warm-900">Differences</h3>
              <div className="border border-warm-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-warm-50 text-left text-sm text-warm-600">
                      <th className="px-4 py-2 font-medium">Field</th>
                      <th className="px-4 py-2 font-medium">
                        <span className="flex items-center gap-1">
                          <Smartphone size={14} className="text-blue-500" />
                          Local
                        </span>
                      </th>
                      <th className="px-4 py-2 font-medium">
                        <span className="flex items-center gap-1">
                          <Cloud size={14} className="text-green-500" />
                          Server
                        </span>
                      </th>
                      <th className="px-4 py-2 font-medium text-center">Use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {currentConflict.fieldDifferences.map((diff) => (
                      <tr key={diff.field} className="text-sm">
                        <td className="px-4 py-3 font-medium text-warm-700">
                          {diff.label}
                        </td>
                        <td
                          className={`px-4 py-3 ${
                            selectedFields[diff.field] === 'local'
                              ? 'bg-blue-50 text-blue-900'
                              : 'text-warm-600'
                          }`}
                        >
                          {formatValue(diff.localValue)}
                        </td>
                        <td
                          className={`px-4 py-3 ${
                            selectedFields[diff.field] === 'server'
                              ? 'bg-green-50 text-green-900'
                              : 'text-warm-600'
                          }`}
                        >
                          {formatValue(diff.serverValue)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleFieldSelection(diff.field)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              selectedFields[diff.field] === 'local'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-green-100 text-green-600'
                            }`}
                            title={`Using ${selectedFields[diff.field]} value`}
                          >
                            <IconCheck size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-warm-500">
                Click the checkmark to toggle between local and server values for merge.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-warm-200 px-6 py-4 bg-warm-50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-warm-500">
                Choose how to resolve this conflict:
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => handleResolution('local')}
                  disabled={resolving}
                  className="flex items-center gap-2"
                >
                  <Smartphone size={16} className="text-blue-500" />
                  Keep Local
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleResolution('server')}
                  disabled={resolving}
                  className="flex items-center gap-2"
                >
                  <Cloud size={16} className="text-green-500" />
                  Keep Server
                </Button>
                <Button
                  onClick={() => handleResolution('merge')}
                  disabled={resolving}
                  isLoading={resolving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Merge Selected
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to detect and manage sync conflicts
 */
export function useConflictResolution() {
  const [conflicts, setConflicts] = useState<ConflictData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const addConflict = (conflict: ConflictData) => {
    setConflicts((prev) => [...prev, conflict]);
    setIsModalOpen(true);
  };

  const clearConflicts = () => {
    setConflicts([]);
    setIsModalOpen(false);
  };

  const handleResolve = async (_results: ConflictResolutionResult[]) => {
    // The actual resolution logic would be handled by the sync engine
    // This hook provides the UI layer
    clearConflicts();
  };

  return {
    conflicts,
    isModalOpen,
    addConflict,
    clearConflicts,
    setIsModalOpen,
    handleResolve,
  };
}

export default ConflictResolutionModal;
