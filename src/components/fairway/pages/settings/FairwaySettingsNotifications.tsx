'use client';

/**
 * ============================================================================
 * Fairway · pages/settings · FairwaySettingsNotifications (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the PLAYER /golf/dashboard/settings/notifications
 * route — the per-category notification-channel matrix + quiet-mode toggle.
 * PRESENTATION-ONLY: the server page fetches the SAME prefs row (prefs +
 * quiet_mode) and passes it straight through; every mutation is reused VERBATIM
 * by exact import path from `@/app/golf/actions/v3/notification-prefs` (the same
 * actions the legacy NotificationPrefsClient calls):
 *
 *   • setCategoryChannel(category, channel, enabled) — flip one channel cell
 *   • setQuietMode(enabled)                          — master quiet switch
 *
 * Neither is destructive (each upserts a single state row — no delete-then-
 * insert). Optimistic local state rolls back and announces a toast when a save
 * fails, because this screen is the canonical notification authority.
 *
 * Tokens / primitives ONLY: bg-canvas/surface/surface-sunken, text-text-*,
 * border-border-subtle, accent-* (helm green), Switch, Surface, ViewHeader.
 * NO glass / blur / warm-* / primary-* / surface-matte.
 * ========================================================================== */

import { useState } from 'react';

import { Button, Surface, Switch, ViewHeader } from '@/components/fairway';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/sonner';
import {
  setAllChannels,
  setCategoryChannel,
  setQuietMode,
} from '@/app/golf/actions/v3/notification-prefs';
import {
  type ChannelPref,
  type NotificationCategory,
  type PrefsByCategory,
} from '@/lib/coachhelm/v3/notifications/router';

/* Plain-English labels — verbatim from the legacy client. */
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

const CATEGORY_GROUPS: Array<{ label: string; categories: NotificationCategory[] }> = [
  {
    label: 'Rounds & reviews',
    categories: ['round_review_ready', 'standing_percentile_changed'],
  },
  {
    label: 'Goals & development',
    categories: ['coach_assigned_goal', 'goal_achieved', 'goal_missed', 'engine_suggested_goal'],
  },
  {
    label: 'Insights',
    categories: ['new_insight', 'composite_insight', 'coach_commented'],
  },
];

/** Categories quiet-mode never silences (Part XXII exemption list). */
const QUIET_EXEMPT: ReadonlySet<NotificationCategory> = new Set([
  'round_review_ready',
  'coach_assigned_goal',
]);

const DEFAULT_CHANNELS: ChannelPref = { push: false, email: false, in_app: true };

/** Every category rendered in the matrix (flattened from the groups). */
const ALL_CATEGORIES: NotificationCategory[] = CATEGORY_GROUPS.flatMap(
  (group) => group.categories,
);

/** Pending key shared by the bulk actions (reset / mute push / mute email). */
const BULK_KEY = 'bulk';

export interface FairwaySettingsNotificationsProps {
  prefs: PrefsByCategory;
  quietMode: boolean;
}

export function FairwaySettingsNotifications({
  prefs: initialPrefs,
  quietMode: initialQuiet,
}: FairwaySettingsNotificationsProps) {
  const [prefs, setPrefs] = useState<PrefsByCategory>(initialPrefs);
  const [quiet, setQuiet] = useState(initialQuiet);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  function setPending(key: string, pending: boolean) {
    setPendingKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleToggle(
    cat: NotificationCategory,
    channel: keyof ChannelPref,
    enabled: boolean,
  ) {
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

  /**
   * Persist the WHOLE prefs object in one atomic server write. Bulk
   * actions (reset / mute push / mute email) must never fan out N
   * parallel single-category writes — concurrent read-modify-writes
   * against the shared prefs JSONB clobber each other (last-write-wins).
   */
  async function applyBulkPrefs(
    nextPrefs: PrefsByCategory,
    successMessage: string,
    failureMessage: string,
  ) {
    if (pendingKeys.has(BULK_KEY)) return;
    const previousPrefs = prefs;

    setPrefs(nextPrefs);
    setPending(BULK_KEY, true);

    const result = await setAllChannels(nextPrefs);
    if (!result.ok) {
      setPrefs(previousPrefs);
      toast.error(result.error || failureMessage);
    } else {
      // Visibility of system status: a multi-second bulk write that succeeds
      // must confirm itself — without it the buttons re-enable with no signal.
      toast.success(successMessage);
    }
    setPending(BULK_KEY, false);
  }

  async function resetDefaults() {
    const nextPrefs: PrefsByCategory = {};
    for (const cat of ALL_CATEGORIES) {
      nextPrefs[cat] = { ...DEFAULT_CHANNELS };
    }
    await applyBulkPrefs(
      nextPrefs,
      'Reset to defaults',
      'Failed to reset notification preferences',
    );
  }

  async function muteChannel(channel: keyof ChannelPref) {
    const nextPrefs: PrefsByCategory = {};
    for (const cat of ALL_CATEGORIES) {
      const current = prefs[cat] ?? DEFAULT_CHANNELS;
      nextPrefs[cat] = { ...current, [channel]: false };
    }
    const channelLabel = channel === 'push' ? 'push' : 'email';
    await applyBulkPrefs(
      nextPrefs,
      `Muted ${channelLabel} for every update`,
      'Failed to mute notifications',
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Settings"
        title="Notifications"
        description="Choose how each kind of update reaches you. Quiet mode silences everything except round-review-ready and coach-assigned goals."
      />

      {/* ── Quiet mode — the one master switch ──────────────────────────────── */}
      <Surface
        elevation="border"
        padding="md"
        className="mt-8 flex items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <p className="font-fw-sans text-body font-medium text-text-primary">
            Quiet mode
          </p>
          <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
            Silences everything except round-review-ready + coach-assigned goals.
          </p>
        </div>
        <Switch
          checked={quiet}
          onCheckedChange={handleQuiet}
          disabled={pendingKeys.has('quiet')}
          aria-label="Quiet mode"
        />
      </Surface>

      {/* ── Per-category channel matrix ─────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">
              Per-update preferences
            </h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Pick the channels for each update type. Some updates ignore quiet mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => muteChannel('push')}
              disabled={pendingKeys.has(BULK_KEY)}
            >
              Mute push
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => muteChannel('email')}
              disabled={pendingKeys.has(BULK_KEY)}
            >
              Mute email
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetConfirmOpen(true)}
              disabled={pendingKeys.has(BULK_KEY)}
            >
              Reset defaults
            </Button>
          </div>
        </div>

        <Surface elevation="border" padding="none">
          <div className="border-b border-border-subtle bg-surface-sunken/40 px-4 py-3 sm:px-5">
            <p className="font-fw-sans text-caption text-text-secondary">
              Defaults keep in-app updates on and push/email off until you opt in.
            </p>
          </div>

          {/* Column header */}
          <div className="grid grid-cols-12 items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
            <span className="col-span-6 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Update
            </span>
            {CHANNELS.map((c) => (
              <span
                key={c.key}
                className="col-span-2 text-center font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary"
              >
                {c.label}
              </span>
            ))}
          </div>

          <div>
            {CATEGORY_GROUPS.map((group) => (
              <section key={group.label} aria-labelledby={`notification-group-${group.label}`}>
                <h3
                  id={`notification-group-${group.label}`}
                  className="border-b border-border-subtle bg-surface-sunken/30 px-4 py-2 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary sm:px-5"
                >
                  {group.label}
                </h3>
                <ul className="divide-y divide-border-subtle">
                  {group.categories.map((cat) => {
                    const channels = prefs[cat] ?? DEFAULT_CHANNELS;
                    const exempt = QUIET_EXEMPT.has(cat);
                    const silenced = quiet && !exempt;
                    return (
                      <li
                        key={cat}
                        className={`grid grid-cols-12 items-center gap-2 px-4 py-3.5 transition-colors sm:px-5 ${
                          silenced ? 'bg-surface-sunken/35' : 'hover:bg-surface-tint'
                        }`}
                      >
                        <div className="col-span-6 min-w-0">
                          <span className="block font-fw-sans text-body-sm text-text-primary">
                            {CATEGORY_LABEL[cat]}
                          </span>
                          {exempt && quiet && (
                            <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">
                              Always delivered in quiet mode
                            </span>
                          )}
                          {silenced && (
                            <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">
                              Silenced by quiet mode
                            </span>
                          )}
                        </div>
                        {CHANNELS.map((c) => (
                          <div key={c.key} className="col-span-2 flex justify-center">
                            <Switch
                              checked={channels[c.key]}
                              onCheckedChange={(enabled) => handleToggle(cat, c.key, enabled)}
                              disabled={pendingKeys.has(`${cat}:${c.key}`)}
                              aria-label={`${CATEGORY_LABEL[cat]} · ${c.label}`}
                            />
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Surface>
      </section>

      {/* Error prevention: Reset defaults discards every per-update channel
          choice, so gate it behind an explicit confirm. */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset notification preferences?"
        message="This replaces every per-update channel choice with the defaults (in-app on, push and email off). This can't be undone."
        confirmLabel="Reset to defaults"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={pendingKeys.has(BULK_KEY)}
        onConfirm={() => {
          setResetConfirmOpen(false);
          void resetDefaults();
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}

export default FairwaySettingsNotifications;
