import { CheckCircle2, Inbox, CloudOff } from 'lucide-react';

/** All-clear ≠ no-data ≠ fetch-failed. Three distinct states so a silent
 *  dashboard is never mistaken for a healthy system. */

export function PanelAllClear({ label, checkedAt }: { label: string; checkedAt: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-fw-success-bg px-6 py-8 text-center">
      <CheckCircle2 size={20} className="text-fw-success" aria-hidden />
      <p className="text-sm font-medium text-accent-700">{label}</p>
      <p className="font-fw-mono text-xs tabular-nums text-warm-500">
        checked {new Date(checkedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

export function PanelNoData({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-sunken px-6 py-8 text-center">
      <Inbox size={20} className="text-warm-400" aria-hidden />
      <p className="text-sm font-medium text-warm-700">{label}</p>
      <p className="text-xs text-warm-500">{description}</p>
    </div>
  );
}

export function PanelStale({ label, error }: { label: string; error?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-fw-warning-bg px-6 py-8 text-center">
      <CloudOff size={20} className="text-fw-warning" aria-hidden />
      <p className="text-sm font-medium text-warm-800">{label} — showing last known data</p>
      {error ? <p className="font-fw-mono text-xs text-warm-600">{error}</p> : null}
    </div>
  );
}
