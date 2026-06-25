// =============================================================================
// src/components/baseball/source-trust/source-trust-types.ts
//
// SHARED CONTRACT — Source Trust System (V5 System 2 / V2 §AI Source Contract).
//
// THIS FILE IS OWNED BY THE SOURCE-TRUST FOUNDATION PACKET. Fan-out surfaces
// (stat rows, import rows, signals, AI cards) IMPORT these types + the
// SourceTrustBadge / SourceDrawer pair; they never re-declare the shape.
//
// The honesty model is anchored to the pure helpers in
// `@/lib/baseball/source-record` (SourceKind / SourceRef / CaptureMode /
// SourceBadge). This file adds ONLY the render-time props the badge + drawer
// need on top of that model — it does not invent a second provenance model.
//
// Baseball-only. No golf labels. Cream/green GolfHelm look (see the components).
// Pure types module (no 'use client', no I/O) so server read models and client
// components can both import it.
// =============================================================================

import type {
  SourceKind,
  SourceRef,
  CaptureMode,
  SourceBadge,
} from '@/lib/baseball/source-record';

// Re-export the canonical model so consumers have a single import surface.
export type { SourceKind, SourceRef, CaptureMode, SourceBadge };

/**
 * The V5 "trust label" vocabulary (System 2). These are the human-facing trust
 * tiers a coach reasons about. They are DERIVED from the lower-level
 * (SourceKind × CaptureMode × confidence × verified/conflict) model — a surface
 * may pass an explicit `trustLevel`, or let the badge derive one. Kept distinct
 * from `SourceKind` because two records with the same kind can carry different
 * trust (e.g. an unreviewed manual entry vs a verified one).
 */
export type TrustLevel =
  | 'official' // governing/official feed (e.g. conference box score)
  | 'device_export' // exported from a measurement device/integration
  | 'staff_entered' // entered by a staff member
  | 'player_entered' // entered by the player
  | 'imported' // came through the CSV/import pipeline
  | 'attached_report' // attached document/report
  | 'ai_derived' // produced by CoachHelm AI (never a raw measurement)
  | 'unreviewed' // present but not yet reviewed/verified by staff
  | 'conflict'; // two sources disagree — needs resolution

/**
 * The render-ready trust descriptor a surface hands to <SourceTrustBadge>. It is
 * a strict superset of the pure `SourceBadge` so a read model can build it with
 * `toSourceBadge(...)` and spread in the extra honesty flags.
 *
 * Honesty rules encoded here (binding):
 *  - `verified` MUST be explicit. Absence/false is NOT "verified".
 *  - `conflict` overrides everything visually — a conflicting value is never
 *    shown as trustworthy.
 *  - `captureMode === 'logged_intent'` means planned/assigned, NOT observed.
 *  - `confidencePct === null` renders as "—", never a fake 0%.
 */
export interface SourceTrust {
  /** Short provenance label, e.g. "Conference box score", "Coach entry". */
  label: string;
  /** The canonical low-level kind (drives icon family + fallbacks). */
  kind: SourceKind;
  /** Optional explicit trust tier; derived from kind+flags when omitted. */
  trustLevel?: TrustLevel;
  /** "Active capture" vs "Logged intent" — the central honesty distinction. */
  captureMode: CaptureMode;
  /** 0–100 integer percent, or null when not applicable (renders "—"). */
  confidencePct: number | null;
  /** Has a staff member explicitly verified this value? Defaults to false. */
  verified?: boolean;
  /** Does this value conflict with another source? Overrides tone to warn. */
  conflict?: boolean;
}

/**
 * Optional rich provenance for the drawer. Everything here is nullable — the
 * drawer shows honest "Not recorded" rows rather than fabricating values. This
 * mirrors the V5 Source Drawer spec (source name, imported by/at, raw file, row
 * number, mapped field, confidence, related objects, visibility, audit).
 */
export interface SourceProvenance {
  /** Canonical SourceRef ({ source, sourceId, label }). */
  ref: SourceRef;
  /** Display name of the source system/feed. */
  sourceName?: string | null;
  /** Who imported/entered it (display name). */
  importedBy?: string | null;
  /** When it was imported/observed/generated (ISO timestamp). */
  importedAt?: string | null;
  /** When an AI/derived value was generated (ISO timestamp). */
  generatedAt?: string | null;
  /** When the value/output expires or goes stale (ISO timestamp). */
  expiresAt?: string | null;
  /** Original uploaded filename, when from an import. */
  rawFileName?: string | null;
  /** Row number within the import file, when applicable. */
  rowNumber?: number | null;
  /** Source column → mapped field, when from an import. */
  mappedField?: string | null;
  /** Visibility classification of the underlying record. */
  visibility?: 'staff_only' | 'player_visible' | 'restricted' | null;
  /** Related objects this value is tied to (for the drawer's "related" list). */
  relatedObjects?: SourceRelatedObject[];
  /** Audit/disposition history entries (most recent first). */
  auditHistory?: SourceAuditEntry[];
  /**
   * For AI/derived values: the facts the output was built from. Renders the
   * V2 AI contract's "facts vs interpretation" split honestly.
   */
  facts?: string[];
  /** For AI/derived values: the interpretation layer (clearly labeled). */
  interpretation?: string | null;
}

export interface SourceRelatedObject {
  /** e.g. "Player", "Game", "Import run". */
  kind: string;
  label: string;
  /** Optional href to navigate to the related object. */
  href?: string;
}

export interface SourceAuditEntry {
  /** ISO timestamp. */
  at: string;
  /** Short action label, e.g. "Imported", "Verified", "Marked conflict". */
  action: string;
  /** Optional actor display name. */
  actor?: string | null;
  /** Optional detail note. */
  detail?: string | null;
}

/**
 * Props contract for <SourceTrustBadge>. THIS is the stable prop type every
 * fan-out surface mounts. Pass a `trust` descriptor; optionally pass
 * `provenance` so the badge can open its own <SourceDrawer> on click. If
 * `provenance` is omitted the badge is a non-interactive pill.
 */
export interface SourceTrustBadgeProps {
  trust: SourceTrust;
  /** Rich detail for the drawer. When present the badge becomes clickable. */
  provenance?: SourceProvenance;
  /** Visual size. `sm` for dense stat rows, `md` default, `lg` for cards. */
  size?: 'sm' | 'md' | 'lg';
  /** Hide the confidence figure (e.g. when the row already shows it). */
  hideConfidence?: boolean;
  /** Render only the icon (no text) — for ultra-dense tables. */
  iconOnly?: boolean;
  /**
   * Controlled drawer open state. When provided, the badge does NOT manage its
   * own drawer (the parent owns it) — letting a row open one shared drawer.
   */
  onOpenDrawer?: (provenance: SourceProvenance, trust: SourceTrust) => void;
  /**
   * Viewer role context forwarded to the internal <SourceDrawer>. When 'player',
   * staff-internal visibility labels are omitted from the drawer. Defaults to
   * 'coach' (show all fields).
   */
  viewerRole?: 'coach' | 'player';
  className?: string;
}

/**
 * Props contract for <SourceDrawer>. Can be mounted standalone (controlled) by
 * a surface that wants ONE drawer for a whole table, or used internally by the
 * badge. Empty/missing provenance renders an honest empty state.
 */
export interface SourceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trust: SourceTrust | null;
  provenance: SourceProvenance | null;
  /**
   * Viewer role context. When 'player', staff-internal visibility labels are
   * omitted from the drawer — a player's own data may be classified "staff_only"
   * as an internal routing decision, but showing that label to the player adds
   * confusion without enabling any action. Staff (coach / undefined) see all rows.
   */
  viewerRole?: 'coach' | 'player';
}
