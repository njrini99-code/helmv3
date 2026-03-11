'use client';

import { cn } from '@/lib/utils';
import {
  XCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import type { TracerAlert, TracerSubTab, AlertSeverityLevel } from './tracer-types';

// ============================================================================
// TRACER ALERT PANEL
// ============================================================================

interface TracerAlertPanelProps {
  alerts: TracerAlert[];
  onNavigate: (tab: TracerSubTab) => void;
}

const severityConfig: Record<AlertSeverityLevel, {
  icon: typeof XCircle;
  iconColor: string;
  iconBg: string;
  borderColor: string;
}> = {
  critical: {
    icon: XCircle,
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    borderColor: 'border-l-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50',
    borderColor: 'border-l-amber-500',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50',
    borderColor: 'border-l-blue-500',
  },
};

export function TracerAlertPanel({ alerts, onNavigate }: TracerAlertPanelProps) {
  return (
    <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
      {/* Header */}
      <div className="px-5 py-4 border-b border-warm-100/50">
        <h3 className="text-sm font-semibold text-warm-900">Active Alerts</h3>
      </div>

      {alerts.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="text-green-500" size={20} />
          </div>
          <p className="text-sm font-medium text-warm-700">No active alerts</p>
          <p className="text-xs text-warm-400 mt-1">Everything is running smoothly</p>
        </div>
      ) : (
        <div className="divide-y divide-warm-100/50">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ALERT ROW
// ============================================================================

function AlertRow({
  alert,
  onNavigate,
}: {
  alert: TracerAlert;
  onNavigate: (tab: TracerSubTab) => void;
}) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;
  const hasNavigation = alert.navigateTo != null;

  return (
    <button
      type="button"
      onClick={() => {
        if (alert.navigateTo) {
          onNavigate(alert.navigateTo);
        }
      }}
      disabled={!hasNavigation}
      className={cn(
        'w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors',
        'border-l-[3px]',
        config.borderColor,
        hasNavigation
          ? 'cursor-pointer hover:bg-white/40'
          : 'cursor-default'
      )}
    >
      {/* Severity icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        config.iconBg
      )}>
        <Icon size={16} className={config.iconColor} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate">{alert.title}</p>
        <p className="text-xs text-warm-500 truncate mt-0.5">{alert.detail}</p>
      </div>

      {/* Navigation arrow */}
      {hasNavigation && (
        <ChevronRight size={16} className="text-warm-400 flex-shrink-0" />
      )}
    </button>
  );
}
