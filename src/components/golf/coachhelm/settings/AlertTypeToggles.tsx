'use client';

import { CoachPhilosophy, ALERT_GROUPS } from '@/lib/coachhelm/types';
import { Checkbox } from '@/components/ui/checkbox';

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
                                <div
                                    key={alert.key}
                                    className="p-3 rounded-lg border border-border-subtle bg-surface hover:border-border-strong transition-colors"
                                >
                                    <Checkbox
                                        checked={isChecked}
                                        onChange={(e) => onChange(alert.key, e.target.checked)}
                                        label={alert.label}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
