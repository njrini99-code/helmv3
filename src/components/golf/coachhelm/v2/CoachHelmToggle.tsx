'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconCheck, IconX } from '@/components/icons';
import { useCoachHelmSettings } from '@/hooks/coachhelm/useCoachHelmSettings';

interface CoachHelmToggleProps {
  userId: string;
  onToggle?: (enabled: boolean) => void;
}

export function CoachHelmToggle({ userId, onToggle }: CoachHelmToggleProps) {
  const { settings, loading, saving, enable, disable } = useCoachHelmSettings(userId);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleToggle = async () => {
    if (!settings) return;

    if (settings.enabled) {
      // Show confirmation before disabling
      setShowConfirm(true);
    } else {
      // Enable directly
      const success = await enable();
      if (success) {
        onToggle?.(true);
      }
    }
  };

  const handleConfirmDisable = async () => {
    const success = await disable('User disabled from settings');
    if (success) {
      onToggle?.(false);
    }
    setShowConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl animate-pulse">
        <div className="w-10 h-10 bg-slate-200 rounded-lg" />
        <div className="flex-1">
          <div className="h-4 w-24 bg-slate-200 rounded mb-1" />
          <div className="h-3 w-32 bg-slate-200 rounded" />
        </div>
        <div className="w-12 h-6 bg-slate-200 rounded-full" />
      </div>
    );
  }

  const enabled = settings?.enabled ?? true;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center gap-4 p-4 rounded-xl border transition-all',
          enabled
            ? 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-100'
            : 'bg-slate-50 border-slate-200'
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            enabled
              ? 'bg-gradient-to-br from-purple-500 to-blue-500'
              : 'bg-slate-300'
          )}
        >
          <IconSparkles size={20} className="text-white" />
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">CoachHelm AI</h3>
            {enabled && (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {enabled
              ? 'AI insights, patterns & predictions enabled'
              : 'AI features are disabled'}
          </p>
        </div>

        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={saving}
          className={cn(
            'relative w-14 h-7 rounded-full transition-colors',
            enabled ? 'bg-green-500' : 'bg-slate-300',
            saving && 'opacity-50 cursor-not-allowed'
          )}
        >
          <motion.div
            initial={false}
            animate={{ x: enabled ? 28 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm"
          />
        </button>
      </div>

      {/* Disable Confirmation */}
      {showConfirm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-amber-50 border border-amber-200 rounded-xl"
        >
          <h4 className="font-medium text-amber-800 mb-2">
            Disable CoachHelm AI?
          </h4>
          <p className="text-sm text-amber-700 mb-3">
            You'll lose access to AI-powered insights, pattern detection, and
            performance predictions. Your data will be preserved.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmDisable}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <IconX size={14} />
              Disable
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            >
              <IconCheck size={14} />
              Keep Enabled
            </button>
          </div>
        </motion.div>
      )}

      {/* Feature List */}
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <FeaturePill label="Pattern Mining" enabled={settings?.showPatterns ?? true} />
          <FeaturePill label="Predictions" enabled={settings?.showPredictions ?? true} />
          <FeaturePill label="AI Insights" enabled={settings?.showInsights ?? true} />
          <FeaturePill label="Learning" enabled />
        </div>
      )}
    </div>
  );
}

function FeaturePill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
        enabled
          ? 'bg-white border border-slate-200 text-slate-700'
          : 'bg-slate-100 text-slate-400'
      )}
    >
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          enabled ? 'bg-green-500' : 'bg-slate-300'
        )}
      />
      {label}
    </div>
  );
}
