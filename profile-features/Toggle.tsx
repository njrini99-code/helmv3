// components/shared/Toggle.tsx
'use client';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, label, description, disabled }: ToggleProps) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 last:border-0">
      <div className="flex-1 pr-4">
        <p className={`font-medium ${disabled ? 'text-slate-400' : 'text-slate-900'}`}>
          {label}
        </p>
        {description && (
          <p className={`text-sm mt-0.5 ${disabled ? 'text-slate-300' : 'text-slate-500'}`}>
            {description}
          </p>
        )}
      </div>
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0
          ${enabled ? 'bg-green-500' : 'bg-slate-200'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform
            ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

// components/shared/SettingsSection.tsx
interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200">
      <div className="flex items-center gap-3 mb-4 pb-2 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}
