'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconDownload,
  IconFile,
  IconCheck,
} from '@/components/icons';
import { exportInsights } from '@/app/golf/actions/insight-management';

// ============================================================================
// TYPES
// ============================================================================

type ExportFormat = 'csv' | 'json';

interface InsightExportModalProps {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onExportComplete?: () => void;
}

// ============================================================================
// FORMAT OPTIONS
// ============================================================================

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'csv',
    label: 'CSV',
    description: 'Spreadsheet format for Excel, Google Sheets',
    icon: (
      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
        <span className="text-sm font-bold text-primary-700">CSV</span>
      </div>
    ),
  },
  {
    value: 'json',
    label: 'JSON',
    description: 'Structured data format for developers',
    icon: (
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
        <span className="text-sm font-bold text-blue-700">{'{}'}</span>
      </div>
    ),
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function InsightExportModal({
  open,
  onClose,
  selectedIds,
  onExportComplete,
}: InsightExportModalProps) {
  const { modalRef } = useFocusTrap(open, onClose);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const result = await exportInsights(selectedIds, selectedFormat);

      if (result.success && result.data && result.filename && result.mimeType) {
        // Create blob and download
        const blob = new Blob([result.data], { type: result.mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        setExportResult({
          success: true,
          message: `Successfully exported ${selectedIds.length} insight${selectedIds.length !== 1 ? 's' : ''}`,
        });

        // Call callback and close after short delay
        setTimeout(() => {
          onExportComplete?.();
          onClose();
        }, 1500);
      } else {
        setExportResult({
          success: false,
          message: result.error || 'Export failed',
        });
      }
    } catch (err) {
      console.error('Export error:', err);
      setExportResult({
        success: false,
        message: 'An unexpected error occurred',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setExportResult(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Export Insights"
      description={`Export ${selectedIds.length} selected insight${selectedIds.length !== 1 ? 's' : ''}`}
    >
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-3">
            Choose format
          </label>
          <div className="grid grid-cols-2 gap-3">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedFormat(option.value)}
                disabled={isExporting}
                className={cn(
                  'relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                  selectedFormat === option.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-warm-200 hover:border-warm-300 bg-white'
                )}
              >
                {option.icon}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-warm-900">{option.label}</p>
                  <p className="text-xs text-warm-500 mt-0.5">{option.description}</p>
                </div>
                {selectedFormat === option.value && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center"
                  >
                    <IconCheck size={12} className="text-white" />
                  </motion.div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Info */}
        <GlassCard variant="secondary" padding="sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warm-100">
              <IconFile size={20} className="text-warm-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-warm-900">
                {selectedIds.length} insight{selectedIds.length !== 1 ? 's' : ''} will be exported
              </p>
              <p className="text-xs text-warm-500">
                Includes title, description, player, priority, status, and dates
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Result Message */}
        {exportResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'p-3 rounded-lg text-sm',
              exportResult.success
                ? 'bg-primary-50 text-primary-700'
                : 'bg-red-50 text-red-700'
            )}
          >
            {exportResult.message}
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleExport}
            isLoading={isExporting}
            disabled={isExporting || selectedIds.length === 0}
          >
            <IconDownload size={16} className="mr-1.5" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
