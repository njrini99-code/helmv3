import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGrounding } from '../grounding';
import type { ToolEnvelope } from '../provenance';

/**
 * The 165 stored staging turns with their hand labels (`ask-turn-labels.json`), as the regression set of the grounding
 * check. A label says whether a person judged the answer's figures true to the reads. The check only logs, so the
 * numbers pinned here are a floor on how well its log agrees with those people, not a gate on any answer.
 */
const DIR = join(__dirname, 'fixtures', 'ask-turns');
type Evidence = { envelope: ToolEnvelope };
type Fixture = { id: string; turn: { content: string; evidence: Evidence[] }; priorMessages?: Array<{ evidence?: Evidence[] }> };
const labels = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ask-turn-labels.json'), 'utf8')) as Record<string, { expect: 'accepted' | 'rejected' | 'incomplete'; why: string }>;
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture);

const ACCEPTED_GROUNDED = 141;
const REJECTED_FLAGGED = 3;

function verdicts() {
  const rows: Array<{ id: string; expect: 'accepted' | 'rejected'; grounded: boolean; unmatched: string[] }> = [];
  for (const f of fixtures) {
    const label = labels[f.id];
    if (!label || label.expect === 'incomplete') continue;
    const reads = [...f.turn.evidence, ...(f.priorMessages ?? []).flatMap((m) => m.evidence ?? [])].map((e) => e.envelope).filter(Boolean);
    const result = checkGrounding(f.turn.content, reads);
    rows.push({ id: f.id, expect: label.expect, ...result });
  }
  return rows;
}

describe('grounding check against the labelled staging turns', () => {
  const rows = verdicts();
  const accepted = rows.filter((r) => r.expect === 'accepted');
  const rejected = rows.filter((r) => r.expect === 'rejected');
  const trueGrounded = accepted.filter((r) => r.grounded).length;
  const trueFlagged = rejected.filter((r) => !r.grounded).length;

  it('covers every labelled turn', () => {
    expect(fixtures.length).toBe(165);
    expect(rows.length).toBeGreaterThanOrEqual(160);
  });

  it('reports its agreement with the hand labels', () => {
    // eslint-disable-next-line no-console
    console.info(`grounding agreement: accepted ${trueGrounded}/${accepted.length} grounded, rejected ${trueFlagged}/${rejected.length} flagged, overall ${trueGrounded + trueFlagged}/${rows.length}`);
    // eslint-disable-next-line no-console
    console.info(`flagged though labelled accepted: ${accepted.filter((r) => !r.grounded).map((r) => `${r.id}[${r.unmatched.join(' ')}]`).join(', ')}`);
    // eslint-disable-next-line no-console
    console.info(`grounded though labelled rejected: ${rejected.filter((r) => r.grounded).map((r) => r.id).join(', ')}`);
    // Measured 2026-11-10. The turns labelled rejected are mostly a wrong place ("7th of 7"), a wrong tally or a figure given to the wrong
    // player: things a number-presence check cannot see and the new reads answer at the source (places and tallies arrive computed).
    expect(trueGrounded).toBeGreaterThanOrEqual(ACCEPTED_GROUNDED);
    expect(trueFlagged).toBeGreaterThanOrEqual(REJECTED_FLAGGED);
  });
});
