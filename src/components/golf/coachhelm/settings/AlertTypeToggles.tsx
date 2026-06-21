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
                    <h3 className="text-eyebrow font-medium text-text-tertiary uppercase tracking-[0.12em] opacity-80 mb-3">
                        {group.title}
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {group.alerts.map((alert) => {
                            const isChecked = !!values[alert.key];
                            return (
                                <label
                                    key={alert.key}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle bg-surface hover:border-border-strong cursor-pointer transition-colors"
                                >
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                void triggerHaptic('light');
                                                onChange(alert.key, e.target.checked);
                                            }}
                                            className="peer h-5 w-5 rounded border-border-strong text-accent-600 outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-text-primary">
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
