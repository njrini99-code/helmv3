import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { isQualifierRulesMissing, qualifierRulesTable } from '@/lib/golf/qualifier-rules';

/**
 * Qualifier exemptions (launch readiness F-06; owner, 16 Nov 2026: "Exempt before, from coach picks"). A coach exempts an
 * entrant before the qualifier starts, with a reason; when selection closes the exemption becomes one of the qualifier's
 * coach's picks, carrying the reason, so the places on score are untouched. Kept in golf_qualifier_exemptions from
 * migration 20261116100000 (HELD): coach-only, because the reason is coach-only like a pick's (D-33).
 *
 * The table is untyped until the migration is applied and the types regenerate (the same one cast as the rules). Every
 * reader goes through `readQualifierExemptions`, so a missing table reads as nobody exempt instead of failing the page.
 */

export interface QualifierExemption {
  playerId: string;
  reason: string;
}

export interface QualifierExemptionsRead {
  exemptions: QualifierExemption[];
  /** The table isn't there yet (migration held): nobody is exempt, and exempting waits on the update. */
  missing: boolean;
  error: { code: string | null; message: string } | null;
}

export const EXEMPTION_REASON_MAX = 280;

/** The reasoning an exemption's coach's pick is written with, so the squad says why. */
export const exemptPickReason = (reason: string) => `Exempt: ${reason.trim()}`;

/** One qualifier's exemptions, through RLS (a player reads none). Never throws. */
export async function readQualifierExemptions(sb: SupabaseClient<Database>, qualifierId: string): Promise<QualifierExemptionsRead> {
  try {
    const res = await qualifierRulesTable(sb)
      .from('golf_qualifier_exemptions')
      .select('player_id, reason')
      .eq('qualifier_id', qualifierId)
      .order('created_at', { ascending: true });
    if (res.error) {
      const code = (res.error as { code?: string }).code ?? null;
      return { exemptions: [], missing: isQualifierRulesMissing(code), error: isQualifierRulesMissing(code) ? null : { code, message: res.error.message } };
    }
    const rows = (res.data ?? []) as Array<{ player_id: string; reason: string }>;
    return { exemptions: rows.map((r) => ({ playerId: r.player_id, reason: r.reason })), missing: false, error: null };
  } catch (e) {
    return { exemptions: [], missing: false, error: { code: null, message: e instanceof Error ? e.message : String(e) } };
  }
}
