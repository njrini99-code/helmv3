'use client';

import { CoachPhilosophy, ALERT_GROUPS } from '@/lib/coachhelm/types';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface AlertTypeTogglesProps {
    values: CoachPhilosophy;
    onChange: (key: keyof CoachPhilosophy, checked: boolean) => void;
}

export function AlertTypeToggles({ values, onChange }: AlertTypeTogglesProps) {
    return (
        <div className="space-y-6">
            {ALERT_GROUPS.map((group) => (
                <div key={group.title}>
                    <h3 className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-3">
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
                                            onChange={(e) => {
                                                void triggerHaptic('light');
                                                onChange(alert.key, e.target.checked);
                                            }}
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
