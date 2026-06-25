// =============================================================================
// src/lib/types/baseball-ai-audit.ts
//
// Hand-written TypeScript types for the AI audit log added by:
//   supabase/migrations/20260624000450_baseball_ai_audit_log.sql
//
// Generated src/lib/types/database.ts does NOT reflect the unapplied migration
// (no live apply; prod GolfHelm shares the DB), so this file hand-mirrors the
// EXACT column names/types so the engine write path + the AI Settings read model
// compile today. Column names/types match the SQL byte-for-byte.
// =============================================================================

import type { BaseballJson } from '@/lib/types/baseball-coachhelm';
import type { AiVisibility, AiWithholdReason } from '@/lib/baseball/ai-policy';

export type BaseballAiOutputKind = 'signal' | 'insight' | 'brief';
export type BaseballAiAuditDisposition = 'approved' | 'pending' | 'withheld';

/** A row of the AI audit log (the v4 §AI Settings AI-audit row). */
export interface BaseballAiAuditRow {
  id: string;
  team_id: string;
  player_id: string | null;
  output_kind: BaseballAiOutputKind;
  generator: string | null;
  dedupe_key: string | null;
  output_table: string | null;
  output_id: string | null;
  model: string | null;
  provider: string | null;
  prompt_version: string | null;
  source_refs: BaseballJson;
  confidence: number | null;
  visibility: AiVisibility;
  desired_visibility: AiVisibility | null;
  disposition: BaseballAiAuditDisposition;
  withheld_reason: AiWithholdReason | null;
  guardrail_redacted: boolean;
  guardrail_medical: boolean;
  guardrail_academic: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  generated_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert shape (NOT NULL DEFAULT cols optional; nullable cols `| null`). */
export interface BaseballAiAuditInsert {
  id?: string;
  team_id: string;
  player_id?: string | null;
  output_kind?: BaseballAiOutputKind;
  generator?: string | null;
  dedupe_key?: string | null;
  output_table?: string | null;
  output_id?: string | null;
  model?: string | null;
  provider?: string | null;
  prompt_version?: string | null;
  source_refs?: BaseballJson;
  confidence?: number | null;
  visibility?: AiVisibility;
  desired_visibility?: AiVisibility | null;
  disposition?: BaseballAiAuditDisposition;
  withheld_reason?: AiWithholdReason | null;
  guardrail_redacted?: boolean;
  guardrail_medical?: boolean;
  guardrail_academic?: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  generated_at?: string;
  created_by?: string | null;
}

export type BaseballAiAuditUpdate = Partial<Omit<BaseballAiAuditInsert, 'team_id'>>;
