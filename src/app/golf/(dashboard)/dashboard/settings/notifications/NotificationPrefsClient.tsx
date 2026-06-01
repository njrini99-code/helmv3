'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/sonner';
import {
  setCategoryChannel,
  setQuietMode,
} from '@/app/golf/actions/v3/notification-prefs';
import {
  NOTIFICATION_CATEGORIES,
  type ChannelPref,
  type NotificationCategory,
  type PrefsByCategory,
} from '@/lib/coachhelm/v3/notifications/router';

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  round_review_ready: 'Round review ready',
  coach_assigned_goal: 'Coach assigned you a goal',
  goal_achieved: 'Goal achieved',
  goal_missed: 'Goal missed',
  new_insight: 'New insight landed',
  composite_insight: 'Composite insight detected',
  weekly_digest: 'Weekly digest (coach only)',
  coach_commented: 'Coach commented',
  engine_suggested_goal: 'Engine suggested a goal',
  standing_percentile_changed: 'Standing percentile changed',
};

const CHANNELS: Array<{ key: keyof ChannelPref; label: string }> = [
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'in_app', label: 'In-app' },
];

const DEFAULT_CHANNELS: ChannelPref = { push: false, email: false, in_app: true };
const QUIET_EXEMPT: ReadonlySet<NotificationCategory> = new Set([
  'round_review_ready',
  'coach_assigned_goal',
]);
const PLAYER_NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES.filter(
  (cat) => cat !== 'weekly_digest',
);

interface Props {
  prefs: PrefsByCategory;
  quietMode: boolean;
}

export function NotificationPrefsClient({ prefs: initialPrefs, quietMode: initialQuiet }: Props) {
  const [prefs, setPrefs] = useState<PrefsByCategory>(initialPrefs);
  const [quiet, setQuiet] = useState(initialQuiet);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  function setPending(key: string, pending: boolean) {
    setPendingKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleToggle(cat: NotificationCategory, channel: keyof ChannelPref, enabled: boolean) {
    const key = `${cat}:${channel}`;
    const current = prefs[cat] ?? DEFAULT_CHANNELS;
    const next: ChannelPref = { ...current, [channel]: enabled };
    const previousPrefs = prefs;

    setPrefs((currentPrefs) => ({ ...currentPrefs, [cat]: next }));
    setPending(key, true);

    const result = await setCategoryChannel(cat, channel, enabled);
    if (!result.ok) {
      setPrefs(previousPrefs);
      toast.error(result.error || 'Failed to save notification preference');
    }
    setPending(key, false);
  }

  async function handleQuiet(enabled: boolean) {
    const previousQuiet = quiet;
    setQuiet(enabled);
    setPending('quiet', true);

    const result = await setQuietMode(enabled);
    if (!result.ok) {
      setQuiet(previousQuiet);
      toast.error(result.error || 'Failed to save quiet mode');
    }
    setPending('quiet', false);
  }

  return (
    <div className="space-y-8">
      {/* Quiet mode */}
      <section className="surface-stone rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="font-medium text-warm-900">Quiet mode</p>
          <p className="text-sm text-warm-500 mt-1">
            Silences everything except round-review-ready + coach-assigned goals.
          </p>
        </div>
        <Toggle
          checked={quiet}
          onChange={handleQuiet}
          disabled={pendingKeys.has('quiet')}
          ariaLabel="Quiet mode"
        />
      </section>

      {/* Per-category prefs */}
      <section className="surface-matte rounded-2xl overflow-hidden">
        <header className="px-5 py-3 border-b border-warm-200/60 grid grid-cols-12 text-eyebrow uppercase tracking-[0.14em] text-warm-500">
          <div className="col-span-6">Category</div>
          {CHANNELS.map((c) => (
            <div key={c.key} className="col-span-2 text-center">{c.label}</div>
          ))}
        </header>
        <ul className="divide-y divide-warm-200/60">
          {PLAYER_NOTIFICATION_CATEGORIES.map((cat) => {
            const channels = prefs[cat] ?? DEFAULT_CHANNELS;
            const silenced = quiet && !QUIET_EXEMPT.has(cat);
            return (
              <li key={cat} className="px-5 py-3 grid grid-cols-12 items-center gap-2">
                <div className="col-span-6 min-w-0">
                  <span className="block text-sm text-warm-900">
                    {CATEGORY_LABEL[cat]}
                  </span>
                  {silenced && (
                    <span className="mt-0.5 block text-xs text-warm-500">
                      Silenced by quiet mode
                    </span>
                  )}
                </div>
                {CHANNELS.map((c) => (
                  <div key={c.key} className="col-span-2 flex justify-center">
                    <Toggle
                      checked={channels[c.key]}
                      onChange={(enabled) => handleToggle(cat, c.key, enabled)}
                      disabled={pendingKeys.has(`${cat}:${c.key}`)}
                      ariaLabel={`${CATEGORY_LABEL[cat]} · ${c.label}`}
                    />
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
        checked
          ? 'bg-primary-600 shadow-[0_0_0_3px_rgba(22,163,74,0.18)]'
          : 'bg-warm-300'
      } ${disabled ? 'opacity-50' : 'hover:opacity-90'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
