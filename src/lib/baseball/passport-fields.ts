// =============================================================================
// src/lib/baseball/passport-fields.ts
//
// V5 Player Passport — the CANONICAL passport field catalog + base visibility.
//
// Spec: v5_player_passport_and_recruiting_showcase_system.md §"Visibility Controls"
//   "Every passport field needs visibility."
//
// This is the SINGLE SOURCE OF TRUTH shared by:
//   * the READ model  (src/lib/baseball/read-models/player-passport.ts) — to
//     resolve a field's effective visibility for a viewer, and
//   * the WRITE action (src/app/baseball/actions/passport-settings.ts) — to
//     validate an incoming override map and enforce the honesty rule on the way
//     IN, not just on the way out.
//
// Keeping the catalog here (rather than duplicated on both sides) is what stops
// the read and write halves from drifting: if a field is added/removed, both the
// resolver and the validator move together.
//
// HONESTY RULE (binding, enforced on BOTH sides):
//   An override may only NARROW a field's base visibility, never WIDEN a
//   staff_only base. A field whose base is `staff_only` is a staff-private
//   underlying datum; no player/program override can expose it. Fields whose base
//   is `player_visible` MAY be exposed up to public/scout (that is the player's
//   own number to share) — that is not "widening a staff-private record", it is
//   the player electing to publish their own data, which the spec explicitly
//   allows under public_profile / scout_packet.
//
// Pure module — no 'server-only', no 'use client', no I/O. Safe to import from a
// client visibility-controls editor AND from server read/write code.
// Baseball-only; no golf labels.
// =============================================================================

import type { PassportFieldVisibility } from '@/lib/types/baseball-passport';

/** A passport field the visibility system understands. */
export interface PassportFieldDef {
  /** Stable key used in the field_visibility jsonb map + the read model. */
  key: string;
  /** Human label for the visibility-controls editor. */
  label: string;
  /** A short grouping for the editor UI. */
  group: 'identity' | 'measurables' | 'academic';
  /**
   * The DEFAULT (base) visibility for the field, before any override. A base of
   * `staff_only` is a hard floor: an override can never widen it.
   */
  base: PassportFieldVisibility;
}

/**
 * The canonical passport field catalog. The keys MUST match the keys the read
 * model resolves (pushIdentity / resolveFieldVisibility('measurable')) so a
 * saved override is actually honored on render.
 *
 * Note: `measurable` is a SINGLE collective key (all measurables share one
 * visibility) — matching the read model, which resolves every measurable through
 * resolveFieldVisibility('measurable'). This is intentional: a player exposes
 * "my measurables" as a group, not 60-yard separately from exit-velo.
 */
export const PASSPORT_FIELD_DEFS: readonly PassportFieldDef[] = [
  // ---- Identity ----
  { key: 'name', label: 'Name', group: 'identity', base: 'player_visible' },
  { key: 'preferred_name', label: 'Preferred name', group: 'identity', base: 'player_visible' },
  { key: 'grad_year', label: 'Class / grad year', group: 'identity', base: 'player_visible' },
  { key: 'positions', label: 'Positions', group: 'identity', base: 'player_visible' },
  { key: 'bats_throws', label: 'Bats / Throws', group: 'identity', base: 'player_visible' },
  { key: 'height_weight', label: 'Height / Weight', group: 'identity', base: 'player_visible' },
  { key: 'hometown', label: 'Hometown', group: 'identity', base: 'player_visible' },
  { key: 'high_school', label: 'High school', group: 'identity', base: 'player_visible' },
  // ---- Measurables (single collective control) ----
  {
    key: 'measurable',
    label: 'Measurables (60-yard, velo, pop time)',
    group: 'measurables',
    base: 'player_visible',
  },
  // ---- Academic (more sensitive — base stays player_visible, never auto-public) ----
  { key: 'academic', label: 'Academics (GPA)', group: 'academic', base: 'player_visible' },
] as const;

/** All valid passport field keys (override map keys must be in this set). */
export const PASSPORT_FIELD_KEYS: ReadonlySet<string> = new Set(
  PASSPORT_FIELD_DEFS.map((d) => d.key),
);

/** Base (default) visibility per field key. */
export const PASSPORT_FIELD_BASE: Readonly<Record<string, PassportFieldVisibility>> =
  Object.fromEntries(PASSPORT_FIELD_DEFS.map((d) => [d.key, d.base]));



/** Rank used to compare visibility breadth (higher = more exposed). */
export const PASSPORT_VISIBILITY_RANK: Readonly<Record<PassportFieldVisibility, number>> = {
  staff_only: 0,
  player_visible: 1,
  public: 2,
  scout: 2,
};

/**
 * The honesty rule, enforced on the WRITE side. Returns the override clamped so
 * it can NEVER widen a `staff_only` base. Any other base allows the override as
 * given (a player_visible field may be elected up to public/scout).
 *
 * @returns the override to persist, or `null` when the override equals the base
 *          (in which case the caller should DROP the key — a no-op override is
 *          noise, and absent keys fall back to the base in the read model).
 */
export function clampOverrideToBase(
  fieldKey: string,
  requested: PassportFieldVisibility,
): PassportFieldVisibility | null {
  const base = PASSPORT_FIELD_BASE[fieldKey] ?? 'player_visible';
  // Hard floor: a staff_only base can never be widened by an override.
  const effective: PassportFieldVisibility =
    base === 'staff_only' && PASSPORT_VISIBILITY_RANK[requested] > PASSPORT_VISIBILITY_RANK[base]
      ? base
      : requested;
  // Drop no-op overrides (they just duplicate the base).
  if (effective === base) return null;
  return effective;
}

/** Type guard: is a string a recognized per-field visibility level? */
export function isPassportFieldVisibility(v: unknown): v is PassportFieldVisibility {
  return (
    v === 'staff_only' || v === 'player_visible' || v === 'public' || v === 'scout'
  );
}
