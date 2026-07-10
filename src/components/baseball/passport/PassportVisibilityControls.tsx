'use client';

// =============================================================================
// src/components/baseball/passport/PassportVisibilityControls.tsx
//
// V5 Player Passport — Visibility Controls editor.
//
// Spec: v5_player_passport_and_recruiting_showcase_system.md §"Visibility Controls"
//   "Every passport field needs visibility." + the Exposure section.
//
// This is the WRITE surface that turns the passport's exposure on/off and sets
// per-field visibility. It is the missing half of the mechanic: the table + RLS
// existed, the read model read settings, but nothing ever let a player/program
// SET them — so exposure was a dead state and overrides were inert.
//
// COMPOSITION (re-composed for the user's task = "control exactly what is
// exposed and to whom"):
//   1. EXPOSURE — the single most important decision, as a prominent 4-option
//      selector (staff_only → player_visible → public_profile → scout_packet),
//      with a plain-language consequence line per state.
//   2. HEADLINE — the one-line program/player framing shown atop the passport.
//   3. FIELD VISIBILITY — grouped, scannable per-field overrides. The honesty
//      rule is shown inline: a staff_only base field cannot be widened (the
//      higher options are disabled with a reason), matching the server clamp.
//   4. One prominent primary Save action, dirty-aware, with an honest reset.
//
// HONESTY:
//   * The exposure-state copy never overpromises (public_profile = "visible to
//     anyone with the link / via discovery", scout_packet = "exportable to a
//     scout packet"). Field options that would widen a staff_only base are
//     DISABLED with an explanation — the UI never offers an action the server
//     will silently clamp.
//   * Granular field changes go through setPassportFieldVisibility immediately;
//     exposure-state + headline go through updatePassportVisibility on Save.
//
// Cream/green GolfHelm look + primitives. No golf labels. No new palette.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';

import { PaperCard } from '@/components/baseball/living-annual';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/sonner';
import {
  IconLock,
  IconEye,
  IconShieldCheck,
  IconCheckCircle2,
  IconAlertCircle,
  IconCopy,
  IconExternalLink,
} from '@/components/icons';
import {
  updatePassportVisibility,
  setPassportFieldVisibility,
  clearPassportFieldOverride,
} from '@/app/baseball/actions/passport-settings';
import {
  PASSPORT_FIELD_DEFS,
  PASSPORT_FIELD_BASE,
  PASSPORT_VISIBILITY_RANK,
} from '@/lib/baseball/passport-fields';
import type {
  PassportVisibilityState,
  PassportFieldVisibility,
  PassportFieldVisibilityMap,
} from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface Props {
  /**
   * The subject player id. Omit (undefined) on the SELF path; staff editing a
   * roster player pass the target's id. The actions resolve the self path when
   * this is undefined.
   */
  playerId?: string;
  /**
   * The RESOLVED subject player id — always present (self or staff-target),
   * unlike `playerId` above. Display-only: builds the public-profile link
   * (conn-baseball-player Finding 3) so a player can share the exact URL that
   * `/baseball/player/[id]` (public-profile-access.ts) actually gates.
   */
  publicProfilePlayerId: string;
  initialState: PassportVisibilityState;
  initialHeadline: string | null;
  initialFieldVisibility: PassportFieldVisibilityMap;
  /** False renders the read-only state (caller may not edit). */
  canEdit: boolean;
}

// -----------------------------------------------------------------------------
// Exposure-state catalog (copy is the honesty layer)
// -----------------------------------------------------------------------------

const STATE_OPTIONS: ReadonlyArray<{
  value: PassportVisibilityState;
  label: string;
  consequence: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'staff_only',
    label: 'Staff only',
    consequence: 'Internal roster-evaluation passport. Only your team staff can open it.',
    icon: <IconLock size={15} />,
  },
  {
    value: 'player_visible',
    label: 'Visible to you',
    consequence: 'You can view your own assembled passport. Still private from outside the team.',
    icon: <IconEye size={15} />,
  },
  {
    value: 'public_profile',
    label: 'Public profile',
    consequence: 'Exposure is ON — anyone with the link (or via discovery) sees the public fields.',
    icon: <IconEye size={15} />,
  },
  {
    value: 'scout_packet',
    label: 'Scout packet',
    consequence: 'Exposure is ON and the packet is exportable to scouts (staff mint share links).',
    icon: <IconShieldCheck size={15} />,
  },
];

// Per-field override options. `public` and `scout` only mean anything once the
// exposure state is public_profile/scout_packet — we surface that honestly.
const FIELD_OPTIONS: ReadonlyArray<{
  value: PassportFieldVisibility;
  label: string;
}> = [
  { value: 'staff_only', label: 'Staff only' },
  { value: 'player_visible', label: 'Player' },
  { value: 'public', label: 'Public' },
  { value: 'scout', label: 'Scout' },
];

const GROUP_LABEL: Record<string, string> = {
  identity: 'Identity',
  measurables: 'Measurables',
  academic: 'Academics',
};

// -----------------------------------------------------------------------------
// Field row — one passport field's override control
// -----------------------------------------------------------------------------

function FieldRow({
  fieldKey,
  label,
  effective,
  exposureEnabled,
  disabled,
  onChange,
}: {
  fieldKey: string;
  label: string;
  effective: PassportFieldVisibility;
  exposureEnabled: boolean;
  disabled: boolean;
  onChange: (key: string, next: PassportFieldVisibility) => void;
}) {
  const base = PASSPORT_FIELD_BASE[fieldKey] ?? 'player_visible';
  const isOverridden = effective !== base;
  // The honesty floor: a staff_only base can never be widened. We disable the
  // wider options so the UI never offers what the server would clamp.
  const optionDisabled = (opt: PassportFieldVisibility): boolean => {
    if (base === 'staff_only' && PASSPORT_VISIBILITY_RANK[opt] > PASSPORT_VISIBILITY_RANK[base]) {
      return true;
    }
    return false;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-warm-800">{label}</p>
        <p className="text-eyebrow text-warm-400">
          {isOverridden ? 'Custom' : 'Default'}
          {(effective === 'public' || effective === 'scout') && !exposureEnabled
            ? ' · only applies once exposure is on'
            : ''}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={`${label} visibility`}
        className="inline-flex overflow-hidden rounded-lg border border-warm-200 bg-cream-50"
      >
        {FIELD_OPTIONS.map((opt) => {
          const active = effective === opt.value;
          const isDisabled = disabled || optionDisabled(opt.value);
          return (
            // eslint-disable-next-line helm/no-raw-button -- segmented radio control, not the ripple/haptic Button primitive
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isDisabled}
              title={
                optionDisabled(opt.value)
                  ? 'This field is staff-private and cannot be exposed.'
                  : undefined
              }
              onClick={() => !isDisabled && !active && onChange(fieldKey, opt.value)}
              className={[
                'px-2.5 py-1.5 text-eyebrow font-medium transition-colors',
                active
                  ? 'bg-primary-500 text-white'
                  : isDisabled
                    ? 'cursor-not-allowed text-warm-300'
                    : 'text-warm-500 hover:bg-warm-100',
              ].join(' ')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function PassportVisibilityControls({
  playerId,
  publicProfilePlayerId,
  initialState,
  initialHeadline,
  initialFieldVisibility,
  canEdit,
}: Props) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const [state, setState] = useState<PassportVisibilityState>(initialState);
  const [headline, setHeadline] = useState<string>(initialHeadline ?? '');
  // The OVERRIDE map (only non-default entries). Field rows resolve effective =
  // overrides[key] ?? base.
  const [overrides, setOverrides] = useState<PassportFieldVisibilityMap>(
    initialFieldVisibility ?? {},
  );

  const exposureEnabled = state === 'public_profile' || state === 'scout_packet';
  // The SERVER-CONFIRMED equivalent of exposureEnabled — gates the live "Copy
  // link"/"Open" affordances, which point at a real public route. Deriving
  // those from `state` (the unsaved draft) would let a player flip the
  // exposure tile and immediately copy/share a link that 403s until Save
  // actually persists it.
  const publicLinkActive = initialState === 'public_profile' || initialState === 'scout_packet';

  const dirty = useMemo(
    () => state !== initialState || (headline.trim() || null) !== (initialHeadline ?? null),
    [state, headline, initialState, initialHeadline],
  );

  // ---- Per-field change (immediate, granular write) ----
  const onFieldChange = (key: string, next: PassportFieldVisibility) => {
    if (!canEdit) return;
    const base = PASSPORT_FIELD_BASE[key] ?? 'player_visible';
    // Optimistic: mirror the server clamp (drop no-op == base).
    setOverrides((prev) => {
      const out = { ...prev };
      if (next === base) delete out[key];
      else out[key] = next;
      return out;
    });
    startTransition(async () => {
      try {
        const res =
          next === base
            ? await clearPassportFieldOverride({ playerId, fieldKey: key })
            : await setPassportFieldVisibility({ playerId, fieldKey: key, visibility: next });
        if (!res.success) {
          showToast(res.error ?? 'Could not update field.', 'error');
          // Reconcile from server truth on failure.
          if (res.fieldVisibility) setOverrides(res.fieldVisibility);
          return;
        }
        if (res.fieldVisibility) setOverrides(res.fieldVisibility);
      } catch {
        showToast('Could not update field.', 'error');
      }
    });
  };

  // ---- Save exposure state + headline (primary action) ----
  const onSave = () => {
    if (!canEdit || pending) return;
    startTransition(async () => {
      try {
        const res = await updatePassportVisibility({
          playerId,
          visibilityState: state,
          headline: headline.trim() || null,
          fieldVisibility: overrides,
        });
        if (!res.success) {
          showToast(res.error ?? 'Could not save visibility.', 'error');
          return;
        }
        if (res.fieldVisibility) setOverrides(res.fieldVisibility);
        showToast('Visibility saved.', 'success');
      } catch {
        showToast('Could not save visibility.', 'error');
      }
    });
  };

  const onReset = () => {
    setState(initialState);
    setHeadline(initialHeadline ?? '');
  };

  // ---- Public link (Finding 3: give players a copy-my-link affordance once
  // exposure is actually on, instead of leaving "Exposure is ON" as a claim
  // with nothing to act on). Points at the real gated public route. ----
  const publicProfilePath = `/baseball/player/${publicProfilePlayerId}`;
  const onCopyPublicLink = async () => {
    try {
      const url = `${window.location.origin}${publicProfilePath}`;
      await navigator.clipboard.writeText(url);
      showToast('Public link copied', 'success');
    } catch {
      showToast('Could not copy the link', 'error');
    }
  };

  // Group field defs for a scannable, hand-composed layout.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof PASSPORT_FIELD_DEFS[number][]>();
    for (const def of PASSPORT_FIELD_DEFS) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <PaperCard className="p-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <IconShieldCheck size={16} />
        </span>
        <div>
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            Visibility Controls
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-warm-900">
            Control what your passport exposes
          </h2>
        </div>
      </div>

      {!canEdit && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warm-200 bg-warm-50 px-3.5 py-2.5">
          <IconLock size={15} className="mt-0.5 shrink-0 text-warm-400" />
          <p className="text-sm text-warm-500">
            You can view these settings but only the player or team staff can change them.
          </p>
        </div>
      )}

      {/* 1. EXPOSURE — the primary decision */}
      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-warm-700">Exposure</h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {STATE_OPTIONS.map((opt) => {
            const active = state === opt.value;
            return (
              // eslint-disable-next-line helm/no-raw-button -- segmented exposure-state selector tile, not the ripple/haptic Button primitive
              <button
                key={opt.value}
                type="button"
                disabled={!canEdit}
                aria-pressed={active}
                onClick={() => canEdit && setState(opt.value)}
                className={[
                  'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  active
                    ? 'border-primary-300 bg-primary-50/70 shadow-card-hover'
                    : 'border-warm-200 bg-cream-50 hover:border-primary-200',
                  !canEdit ? 'cursor-not-allowed opacity-70' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    active ? 'bg-primary-100 text-primary-600' : 'bg-warm-100 text-warm-500',
                  ].join(' ')}
                >
                  {opt.icon}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-warm-900">{opt.label}</span>
                    {active && <IconCheckCircle2 size={14} className="text-primary-600" />}
                  </span>
                  <span className="mt-0.5 block text-eyebrow leading-relaxed text-warm-500">
                    {opt.consequence}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {publicLinkActive && (
          <div className="mt-3 rounded-xl border border-warm-200 bg-cream-50 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <IconEye size={14} className="shrink-0 text-warm-400" />
                <p className="truncate text-sm text-warm-600">{publicProfilePath}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCopyPublicLink}
                  title="Copy public link"
                  leftIcon={<IconCopy size={14} />}
                >
                  Copy link
                </Button>
                <a
                  href={publicProfilePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open your public profile"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-700"
                >
                  <IconExternalLink size={15} />
                </a>
              </div>
            </div>
            {dirty && (
              <p className="mt-2 text-eyebrow text-warm-400">
                Unsaved changes — this link reflects what&apos;s currently live, not your pending edits.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 2. HEADLINE */}
      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-warm-700">Headline</h3>
        <Input
          type="text"
          value={headline}
          maxLength={140}
          disabled={!canEdit}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. RHP / SS · 2026 · uncommitted"
          hint={`One line shown atop the passport. ${140 - headline.length} characters left.`}
        />
      </section>

      {/* 3. FIELD VISIBILITY */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-warm-700">Per-field visibility</h3>
          {!exposureEnabled && (
            <span className="flex items-center gap-1 text-eyebrow text-warm-400">
              <IconAlertCircle size={11} />
              Public / Scout apply once exposure is on
            </span>
          )}
        </div>
        <div className="space-y-4">
          {grouped.map(([group, defs]) => (
            <div key={group}>
              <p className="mb-1 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                {GROUP_LABEL[group] ?? group}
              </p>
              <div className="divide-y divide-warm-100 rounded-xl border border-warm-200 bg-cream-50 px-2">
                {defs.map((def) => (
                  <FieldRow
                    key={def.key}
                    fieldKey={def.key}
                    label={def.label}
                    effective={overrides[def.key] ?? (PASSPORT_FIELD_BASE[def.key] ?? 'player_visible')}
                    exposureEnabled={exposureEnabled}
                    disabled={!canEdit || pending}
                    onChange={onFieldChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-eyebrow text-warm-400">
          <IconLock size={11} className="mt-0.5 shrink-0" />
          Field changes save immediately. A staff-private field can never be exposed — that
          option stays disabled.
        </p>
      </section>

      {/* 4. PRIMARY ACTION */}
      {canEdit && (
        <div className="mt-7 flex items-center justify-end gap-3 border-t border-warm-100 pt-5">
          {dirty && (
            <Button variant="ghost" size="md" onClick={onReset} disabled={pending}>
              Reset
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            isLoading={pending}
            disabled={!dirty && !pending}
            leftIcon={<IconShieldCheck size={16} />}
          >
            {dirty ? 'Save exposure' : 'Saved'}
          </Button>
        </div>
      )}
    </PaperCard>
  );
}
