'use client';

import { useState } from 'react';
import { useCoachHelmSettings } from '@/hooks/coachhelm/useCoachHelmSettings';
import { Brain, AlertCircle, Check, Loader2 } from 'lucide-react';

interface CoachHelmToggleProps {
  userId: string;
  showDetails?: boolean;
  onStatusChange?: (enabled: boolean) => void;
}

/**
 * Toggle component for enabling/disabling CoachHelm AI features
 *
 * Displays a switch with status indicator and optional details about
 * what CoachHelm provides when enabled.
 */
export function CoachHelmToggle({
  userId,
  showDetails = true,
  onStatusChange,
}: CoachHelmToggleProps) {
  const { settings, loading, saving, error, enable, disable } =
    useCoachHelmSettings(userId);
  const [disableReason, setDisableReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);

  const isEnabled = settings?.enabled ?? true;

  async function handleToggle() {
    if (isEnabled) {
      // Show reason input before disabling
      setShowReasonInput(true);
    } else {
      const success = await enable();
      if (success) {
        onStatusChange?.(true);
      }
    }
  }

  async function handleConfirmDisable() {
    const success = await disable(disableReason || undefined);
    if (success) {
      setShowReasonInput(false);
      setDisableReason('');
      onStatusChange?.(false);
    }
  }

  function handleCancelDisable() {
    setShowReasonInput(false);
    setDisableReason('');
  }

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-glass">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
          <span className="text-sm text-slate-500">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-glass">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isEnabled
                ? 'bg-green-100 text-green-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">CoachHelm AI</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEnabled
                ? 'Intelligent coaching insights are active'
                : 'AI insights are currently disabled'}
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={handleToggle}
          disabled={saving || showReasonInput}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
            isEnabled ? 'bg-green-600' : 'bg-slate-200'
          } ${saving || showReasonInput ? 'opacity-50 cursor-not-allowed' : ''}`}
          role="switch"
          aria-checked={isEnabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
          {saving && (
            <Loader2 className="absolute inset-0 m-auto h-3 w-3 text-white animate-spin" />
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Disable Reason Input */}
      {showReasonInput && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">
            Why are you disabling CoachHelm?{' '}
            <span className="text-slate-400">(optional)</span>
          </p>
          <textarea
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            placeholder="I prefer to analyze performance manually..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 resize-none"
            rows={2}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleConfirmDisable}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Disabling...' : 'Disable CoachHelm'}
            </button>
            <button
              onClick={handleCancelDisable}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Details */}
      {showDetails && !showReasonInput && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {isEnabled ? 'Active Features' : 'Features when enabled'}
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              'Pattern detection across rounds',
              'Performance predictions',
              'Personalized insights',
              'Causal analysis',
              'Practice recommendations',
              'Confidence calibration',
            ].map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 text-sm text-slate-600"
              >
                <Check
                  className={`h-4 w-4 ${
                    isEnabled ? 'text-green-600' : 'text-slate-300'
                  }`}
                />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disabled info */}
      {!isEnabled && settings?.disabledReason && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Disabled Reason
          </p>
          <p className="text-sm text-slate-600">{settings.disabledReason}</p>
          {settings.disabledAt && (
            <p className="text-xs text-slate-400 mt-1">
              Disabled on{' '}
              {new Date(settings.disabledAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact toggle for use in sidebars or smaller spaces
 */
export function CoachHelmToggleCompact({
  userId,
  onStatusChange,
}: Omit<CoachHelmToggleProps, 'showDetails'>) {
  const { settings, loading, saving, enable, disable } =
    useCoachHelmSettings(userId);

  const isEnabled = settings?.enabled ?? true;

  async function handleToggle() {
    if (isEnabled) {
      const success = await disable();
      if (success) onStatusChange?.(false);
    } else {
      const success = await enable();
      if (success) onStatusChange?.(true);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-100/50 transition-colors">
      <div className="flex items-center gap-2">
        <Brain
          className={`h-4 w-4 ${isEnabled ? 'text-green-600' : 'text-slate-400'}`}
        />
        <span className="text-sm font-medium text-slate-700">CoachHelm AI</span>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading || saving}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
          isEnabled ? 'bg-green-600' : 'bg-slate-200'
        } ${loading || saving ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={isEnabled}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isEnabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
