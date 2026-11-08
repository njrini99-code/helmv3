import type { ClaimReference } from '../llm/claims-block';
import { matchesValue, norm, parseWritten, sameSubject, type Cite } from './cites';
import type { ToolEnvelope } from './provenance';

/**
 * The typed claim list of a turn, derived from its per-figure citations instead of a second `<<<CLAIMS>>>` block.
 *
 * The two blocks said nearly the same thing twice: for each figure, which measurement (metric, player, window) it was. A cite already names the
 * read, the metric and the player; the window, unit and denominator are the measurement's own, so the server copies them from it instead of the
 * model writing them out (about a thousand output tokens a turn). Only the figures that are a measurement's own value become claims, which is
 * what the claims block held; a figure beside it (a team average, a sample size) was never in it. A cite no measurement answers to makes no claim
 * (the cites check has already judged it).
 */
export function claimsFromCites(cites: readonly Cite[], evidence: ReadonlyMap<string, ToolEnvelope>): ClaimReference[] {
  const out: ClaimReference[] = [];
  const seen = new Set<string>();
  for (const cite of cites) {
    const written = parseWritten(cite.v);
    const env = evidence.get(cite.ref);
    if (written === null || !env) continue;
    const key = norm(cite.key);
    const hits = env.measurements.filter(
      (m) =>
        m.value !== null &&
        // A count (goals per player, rows of a state) is a tally the count rules audit, not a rate over a sample that a floor could call thin (live Q1: "Cole Bennett (2) and Owen Carter (3)").
        m.unit !== 'count' &&
        m.window_start !== null &&
        m.window_end !== null &&
        norm(m.metric_id) === key &&
        (cite.subject === 'team' ? m.entity.kind === 'team' : sameSubject(cite.subject, m.entity.id)) &&
        matchesValue(m.value, written, cite.v) &&
        (!cite.w || (m.window_start === cite.w[0] && m.window_end === cite.w[1])),
    );
    const m = hits[0];
    if (!m) continue;
    const id = `${m.entity.id}|${m.metric_id}|${m.window_start}|${m.window_end}|${cite.c ? 'c' : 'f'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      claim_id: `c${out.length + 1}`,
      metric_id: m.metric_id,
      value: m.value as number,
      player_id: m.entity.id,
      window_start: m.window_start as string,
      window_end: m.window_end as string,
      unit: m.unit,
      denominator: m.denominator,
      claim_type: cite.c ? 'causal' : 'fact',
    });
  }
  return out;
}
