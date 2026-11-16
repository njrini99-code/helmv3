import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { QUALIFIER_TIE_RULES, type QualifierTieRule } from '@/lib/coachhelm/v3/qualifying/ranking';

/**
 * A qualifier's standings rules (launch readiness F-04): how players level on to par and strokes are separated. Kept in
 * golf_qualifier_rules, one row a qualifier, from migration 20261115240000 (HELD). A qualifier with no row keeps the rule
 * every qualifier had before it, `coach` (Q-114: nobody is separated, and a tie at the cut waits for the coach); a new
 * qualifier is saved with `last_round` unless the coach picks otherwise (owner, 15 Nov 2026: "Last round, then the one
 * before").
 *
 * The table is untyped until the migration is applied and the types regenerate: `qualifierRulesTable` is the one cast.
 * Every reader goes through `readQualifierRules`, so the board, the selection workspace and its confirm rank with the
 * same rule, and a missing table reads as the defaults instead of failing the page.
 */

export interface QualifierRules {
  tieRule: QualifierTieRule;
}

/** What a qualifier with no stored rules ranks by: every qualifier made before F-04. */
export const STORED_DEFAULT_RULES: QualifierRules = { tieRule: 'coach' };
/** What the form starts a new qualifier on. */
export const NEW_QUALIFIER_RULES: QualifierRules = { tieRule: 'last_round' };

export interface QualifierRulesRead {
  rules: QualifierRules;
  /** The table isn't there yet (the migration is held): the rules are the defaults and can't be saved. */
  missing: boolean;
  /** The read failed for another reason: the rules shown are the defaults. */
  error: { code: string | null; message: string } | null;
}

export function qualifierRulesTable(sb: SupabaseClient<Database>): SupabaseClient {
  return sb as unknown as SupabaseClient;
}

const MISSING = new Set(['42P01', 'PGRST205']);
export const isQualifierRulesMissing = (code: string | null | undefined) => !!code && MISSING.has(code);

const TIE: ReadonlySet<string> = new Set(QUALIFIER_TIE_RULES);
export const isTieRule = (v: unknown): v is QualifierTieRule => typeof v === 'string' && TIE.has(v);

export interface QualifierRulesRow {
  qualifier_id: string;
  team_id: string;
  tie_rule: string;
}

export function rulesFromRow(row: Pick<QualifierRulesRow, 'tie_rule'> | null | undefined): QualifierRules {
  return { tieRule: row && isTieRule(row.tie_rule) ? row.tie_rule : STORED_DEFAULT_RULES.tieRule };
}

/** One qualifier's rules, through RLS. Never throws. */
export async function readQualifierRules(sb: SupabaseClient<Database>, qualifierId: string): Promise<QualifierRulesRead> {
  try {
    const res = await qualifierRulesTable(sb).from('golf_qualifier_rules').select('tie_rule').eq('qualifier_id', qualifierId).maybeSingle();
    if (res.error) {
      const code = (res.error as { code?: string }).code ?? null;
      return {
        rules: STORED_DEFAULT_RULES,
        missing: isQualifierRulesMissing(code),
        error: isQualifierRulesMissing(code) ? null : { code, message: res.error.message },
      };
    }
    return { rules: rulesFromRow(res.data as Pick<QualifierRulesRow, 'tie_rule'> | null), missing: false, error: null };
  } catch (e) {
    return { rules: STORED_DEFAULT_RULES, missing: false, error: { code: null, message: e instanceof Error ? e.message : String(e) } };
  }
}

/** The sentence the standings state the rule in, for the coach or for a player. */
export function tieRuleSentence(rule: QualifierTieRule, coach: boolean): string {
  const decides = coach ? 'you decide a tie at the cut' : 'your coach decides a tie at the cut';
  return rule === 'last_round'
    ? `Ties: players level on to par and strokes are separated by the lower last round, then the round before. Still level, they share a place, and ${decides}.`
    : `Ties: players level on to par and strokes share a place, and ${decides}.`;
}

/** Several qualifiers' rules at once (the list), through RLS. Never throws; a qualifier without a row reads as the default. */
export async function readQualifierRulesMany(
  sb: SupabaseClient<Database>,
  qualifierIds: readonly string[],
): Promise<{ byId: Map<string, QualifierRules>; missing: boolean; error: { code: string | null; message: string } | null }> {
  const byId = new Map<string, QualifierRules>();
  if (!qualifierIds.length) return { byId, missing: false, error: null };
  try {
    const res = await qualifierRulesTable(sb)
      .from('golf_qualifier_rules')
      .select('qualifier_id, tie_rule')
      .in('qualifier_id', [...qualifierIds]);
    if (res.error) {
      const code = (res.error as { code?: string }).code ?? null;
      return { byId, missing: isQualifierRulesMissing(code), error: isQualifierRulesMissing(code) ? null : { code, message: res.error.message } };
    }
    for (const row of (res.data ?? []) as Array<Pick<QualifierRulesRow, 'qualifier_id' | 'tie_rule'>>) byId.set(row.qualifier_id, rulesFromRow(row));
    return { byId, missing: false, error: null };
  } catch (e) {
    return { byId, missing: false, error: { code: null, message: e instanceof Error ? e.message : String(e) } };
  }
}
