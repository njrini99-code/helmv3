/**
 * Guards the calibration contract: a question set cannot change without its
 * evaluator version bumping (the pinned hashes live in
 * evals/judgment/evaluator-versions.json), and a fixture directory cannot
 * silently shrink.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));
vi.mock('@/lib/typesafe/client', () => ({ askJev: async () => null, isTypeSafeConfigured: () => false, TYPESAFE_MODEL: 'jev-latest' }));

import { canonicalJson, sha256Hex } from '../hashing';
import { SHOT_TRACE_EVALUATOR_VERSION, SHOT_TRACE_QUESTIONS } from '../use-cases/shot-trace';
import { BUG_TRIAGE_EVALUATOR_VERSION, BUG_TRIAGE_QUESTIONS } from '../use-cases/bug-triage';

const ROOT = path.resolve(__dirname, '../../../../../evals/judgment');
const pinned = JSON.parse(readFileSync(path.join(ROOT, 'evaluator-versions.json'), 'utf8')) as {
  evaluators: Record<string, string>;
  fixtureCounts: Record<string, number>;
};

describe('evaluator versions', () => {
  it.each([
    [SHOT_TRACE_EVALUATOR_VERSION, SHOT_TRACE_QUESTIONS],
    [BUG_TRIAGE_EVALUATOR_VERSION, BUG_TRIAGE_QUESTIONS],
  ])('%s question set matches its pinned hash (bump the version when questions change)', (version, questions) => {
    const hash = sha256Hex(canonicalJson(questions));
    expect(pinned.evaluators[version], `pin ${version} in evals/judgment/evaluator-versions.json: ${hash}`).toBe(hash);
  });
});

describe('fixtures', () => {
  it.each(Object.entries(pinned.fixtureCounts))('%s has at least %d parseable fixtures', (dir, count) => {
    const files = readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(count);
    for (const f of files) {
      const fx = JSON.parse(readFileSync(path.join(ROOT, dir, f), 'utf8')) as { useCase: string; input: unknown; expected: { disposition: string } };
      expect(fx.useCase).toBeTruthy();
      expect(fx.input).toBeTruthy();
      expect(['pass', 'observe', 'collect_more_evidence', 'escalate', 'block', 'unassessed']).toContain(fx.expected.disposition);
    }
  });
});
