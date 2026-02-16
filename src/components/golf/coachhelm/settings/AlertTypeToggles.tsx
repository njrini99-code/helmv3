'use client';

import { CoachPhilosophy, ALERT_GROUPS } from '@/lib/coachhelm/types';

interface AlertTypeTogglesProps {
    values: CoachPhilosophy;
    onChange: (key: keyof CoachPhilosophy, checked: boolean) => void;
}

export function AlertTypeToggles({ values, onChange }: AlertTypeTogglesProps) {
    return (
        <div className="space-y-6">
            {ALERT_GROUPS.map((group) => (
                <div key={group.title}>
                    <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">
                        {group.title}
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {group.alerts.map((alert) => {
                            const isChecked = !!values[alert.key];
                            return (
                                <label
                                    key={alert.key}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-warm-200 bg-white hover:border-warm-300 cursor-pointer transition-colors"
                                >
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => onChange(alert.key, e.target.checked)}
                                            className="peer h-5 w-5 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-warm-900">
                                        {alert.label}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
