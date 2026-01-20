'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconCheck, IconX } from '@/components/icons';
import { useCoachHelmSettings } from '@/hooks/coachhelm/useCoachHelmSettings';

interface CoachHelmToggleProps {
  coachId: string;
  onToggle?: (enabled: boolean) => void;
}

export function CoachHelmToggle({ coachId, onToggle }: CoachHelmToggleProps) {
  const { settings, loading, saving, enable, disable } = useCoachHelmSettings(coachId);
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
    <div className="space-y-4">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border bg-white/70 p-5 backdrop-blur-xl shadow-glass transition-all',
          enabled ? 'border-primary-100/70 ring-1 ring-primary-200/60' : 'border-white/60 ring-1 ring-slate-200/60'
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-white/0 to-emerald-400/10 pointer-events-none" />
        <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary-500/12 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-10 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Icon */}
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center shadow-glass-sm ring-1 ring-white/70',
              enabled
                ? 'bg-gradient-green text-white'
                : 'bg-slate-200 text-slate-500'
            )}
          >
            <IconSparkles size={20} />
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">CoachHelm AI</h3>
              {enabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100/80 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Off
                </span>
              )}
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                Premium Insights
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {enabled
                ? 'AI insights, patterns, and predictions tailored to your roster.'
                : 'Enable CoachHelm to unlock team-level intelligence.'}
            </p>
          </div>

          {/* Toggle */}
          <button
            onClick={handleToggle}
            disabled={saving}
            className={cn(
              'relative h-8 w-16 rounded-full border transition-all',
              enabled
                ? 'border-primary-400/40 bg-gradient-to-r from-primary-500 to-emerald-500 shadow-glass-sm'
                : 'border-slate-200 bg-slate-200',
              saving && 'opacity-60 cursor-not-allowed'
            )}
            aria-label="Toggle CoachHelm AI"
          >
            <motion.div
              initial={false}
              animate={{ x: enabled ? 32 : 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 h-6 w-6 rounded-full bg-white shadow-glass-sm"
            />
          </button>
        </div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <FeaturePill
            label="Pattern Mining"
            detail="Repeatable scoring leaks & trends"
            enabled={settings?.showPatterns ?? true}
          />
          <FeaturePill
            label="Predictions"
            detail="Forward-looking scoring outlooks"
            enabled={settings?.showPredictions ?? true}
          />
          <FeaturePill
            label="AI Insights"
            detail="Actionable coaching narratives"
            enabled={settings?.showInsights ?? true}
          />
          <FeaturePill
            label="Learning"
            detail="Adapts to coach feedback loops"
            enabled
          />
        </div>
      )}
    </div>
  );
}

function FeaturePill({ label, detail, enabled }: { label: string; detail: string; enabled: boolean }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3 py-2 text-xs font-medium shadow-glass-sm',
        enabled
          ? 'border-white/70 bg-white/70 text-slate-700'
          : 'border-white/40 bg-white/50 text-slate-400'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full',
          enabled ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-400'
        )}
      >
        {enabled ? <IconCheck size={12} /> : <IconX size={12} />}
      </div>
      <div>
        <p className={cn('text-xs font-semibold', enabled ? 'text-slate-700' : 'text-slate-400')}>
          {label}
        </p>
        <p className={cn('text-[11px] leading-snug', enabled ? 'text-slate-500' : 'text-slate-400')}>
          {detail}
        </p>
      </div>
    </div>
  );
}
