// =============================================================================
// src/components/baseball/source-trust/build-source-trust.ts
//
// Adapters that turn the low-level honesty model (@/lib/baseball/source-record)
// into the render-ready `SourceTrust` the badge/drawer consume. Read models call
// these so the read + render sides agree on a single provenance model.
//
// Pure module (no 'use client', no I/O) — safe from server read models.
// =============================================================================

import {
  toSourceBadge,
  type SourcedRecord,
  type SourceRef,
  type CaptureMode,
} from '@/lib/baseball/source-record';
import type { SourceTrust, TrustLevel } from './source-trust-types';

/**
 * Build a `SourceTrust` from raw fields. Use when a read model has the pieces
 * but not a full `SourcedRecord`. `verified`/`conflict` MUST be passed
 * explicitly — they are never inferred, so an unverified value never reads as
 * verified.
 */
export function buildSourceTrust(input: {
  ref: SourceRef;
  confidence: number | null;
  captureMode: CaptureMode;
  verified?: boolean;
  conflict?: boolean;
  trustLevel?: TrustLevel;
}): SourceTrust {
  const badge = toSourceBadge({
    source: input.ref,
    confidence: input.confidence,
    captureMode: input.captureMode,
  });
  return {
    label: input.ref.label,
    kind: input.ref.source,
    trustLevel: input.trustLevel,
    captureMode: input.captureMode,
    confidencePct: badge.confidencePct,
    verified: input.verified ?? false,
    conflict: input.conflict ?? false,
  };
}

/**
 * Build a `SourceTrust` directly from a `SourcedRecord<T>` produced by a read
 * model via `toSourcedRecord(...)`. The honesty flags (`verified`/`conflict`)
 * are still explicit because they live outside the SourcedRecord shape.
 */
export function trustFromSourcedRecord<T>(
  rec: SourcedRecord<T>,
  flags?: { verified?: boolean; conflict?: boolean; trustLevel?: TrustLevel },
): SourceTrust {
  return buildSourceTrust({
    ref: rec.source,
    confidence: rec.confidence,
    captureMode: rec.captureMode,
    verified: flags?.verified,
    conflict: flags?.conflict,
    trustLevel: flags?.trustLevel,
  });
}
