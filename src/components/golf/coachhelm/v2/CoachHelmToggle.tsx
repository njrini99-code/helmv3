'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles, IconCheck, IconX } from '@/components/icons';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { useCoachHelmSettings } from '@/hooks/coachhelm/useCoachHelmSettings';
import { Surface, Switch } from '@/components/fairway';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface CoachHelmToggleProps {
  coachId: string;
  onToggle?: (enabled: boolean) => void;
}

/**
 * CoachHelm AI on/off for the coach's OWN dashboards. Rebuilt on Fairway
 * primitives + tokens (was legacy glass/warm/cream/amber, which broke the dark
 * theme and violated the #418 reduced-motion guard). Being token-driven, it now
 * renders premium in both light and dark automatically.
 */
export function CoachHelmToggle({ coachId, onToggle }: CoachHelmToggleProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const { settings, loading, saving, enable, disable } = useCoachHelmSettings(coachId);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = async (next: boolean) => {
    if (!settings) return;
    if (!next) {
      // Disabling is destructive to the AI surfaces — confirm first.
      setShowConfirm(true);
      return;
    }
    if (await enable()) onToggle?.(true);
  };

  const handleConfirmDisable = async () => {
    if (await disable('User disabled from settings')) onToggle?.(false);
    setShowConfirm(false);
  };

  if (loading) {
    return (
      <Surface elevation="border" padding="md" className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-fw-sm bg-surface-sunken" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-sunken" />
          <div className="h-3 w-48 animate-pulse rounded bg-surface-sunken" />
        </div>
        <div className="h-6 w-11 animate-pulse rounded-full bg-surface-sunken" />
      </Surface>
    );
  }

  const enabled = settings?.enabled ?? true;

  return (
    <div className="space-y-4">
      <Surface elevation="border" padding="md">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-sm transition-colors',
              enabled ? 'bg-accent-50 text-accent-600' : 'bg-surface-sunken text-text-tertiary',
            )}
          >
            <IconSparkles size={20} aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-fw-sans text-body font-medium text-text-primary">CoachHelm AI</h3>
              {enabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2 py-0.5 font-fw-sans text-caption font-medium text-accent-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-medium text-text-tertiary">
                  <span className="h-1.5 w-1.5 rounded-full bg-text-tertiary" />
                  Off
                </span>
              )}
            </div>
            <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">
              {enabled
                ? 'AI insights, patterns, and predictions tailored to your roster.'
                : 'Enable CoachHelm to unlock team-level intelligence.'}
            </p>
          </div>

          <Switch
            checked={enabled}
            onCheckedChange={(v) => void handleChange(v)}
            disabled={saving}
            aria-label="Toggle CoachHelm AI"
          />
        </div>
      </Surface>

      {enabled ? (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.22, 0.61, 0.36, 1] }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <FeaturePill label="Pattern mining" detail="Repeatable scoring leaks & trends" enabled={settings?.showPatterns ?? true} />
          <FeaturePill label="Predictions" detail="Forward-looking scoring outlooks" enabled={settings?.showPredictions ?? true} />
          <FeaturePill label="AI insights" detail="Actionable coaching narratives" enabled={settings?.showInsights ?? true} />
          <FeaturePill label="Learning" detail="Adapts to your coaching feedback" enabled />
        </motion.div>
      ) : null}

      <ConfirmDialog
        open={showConfirm}
        title="Disable CoachHelm AI?"
        message="You'll lose AI-powered insights, pattern detection, and performance predictions on your dashboards. Your data is preserved and you can re-enable any time."
        confirmLabel="Disable"
        cancelLabel="Keep enabled"
        variant="warning"
        isLoading={saving}
        onConfirm={handleConfirmDisable}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

function FeaturePill({ label, detail, enabled }: { label: string; detail: string; enabled: boolean }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-fw-md border px-3 py-2.5',
        enabled ? 'border-border-subtle bg-surface-sunken' : 'border-border-subtle bg-surface opacity-70',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          enabled ? 'bg-accent-50 text-accent-600' : 'bg-surface-sunken text-text-tertiary',
        )}
      >
        {enabled ? <IconCheck size={12} aria-hidden /> : <IconX size={12} aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className="font-fw-sans text-body-sm font-medium text-text-primary">{label}</p>
        <p className="font-fw-sans text-caption leading-snug text-text-tertiary">{detail}</p>
      </div>
    </div>
  );
}
