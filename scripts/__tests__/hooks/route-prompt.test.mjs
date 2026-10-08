// Fixture-stdin tests for .claude/hooks/route-prompt.mjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  extractPaths,
  matchDoorHints,
  stripPastedBlocks,
  pickDocs,
  MAX_DOCS,
} from '../../../.claude/hooks/route-prompt.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/route-prompt.mjs');

function run(prompt, cwd = process.cwd()) {
  return execFileSync('node', [HOOK], {
    input: JSON.stringify({ prompt, cwd }),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('route-prompt pure logic', () => {
  it('extracts repo-relative paths under the five gated roots', () => {
    expect(extractPaths('please look at src/lib/foo.ts and fix it')).toEqual(['src/lib/foo.ts']);
    expect(extractPaths('see supabase/migrations/0001_init.sql')).toEqual([
      'supabase/migrations/0001_init.sql',
    ]);
    expect(extractPaths('run scripts/knowledge/map-changed-files.mjs')).toEqual([
      'scripts/knowledge/map-changed-files.mjs',
    ]);
    expect(extractPaths('read memory/features/crm_outreach.md now')).toEqual([
      'memory/features/crm_outreach.md',
    ]);
    expect(extractPaths('check docs/REPO_MAP.md.')).toEqual(['docs/REPO_MAP.md']);
  });

  it('returns an empty list for prompts with no repo-relative path', () => {
    expect(extractPaths('just say hello')).toEqual([]);
    expect(extractPaths('what does /etc/passwd look like')).toEqual([]);
  });

  it('deduplicates repeated paths', () => {
    expect(extractPaths('src/lib/foo.ts and again src/lib/foo.ts')).toEqual(['src/lib/foo.ts']);
  });
});

describe('route-prompt pasted blocks', () => {
  it('ignores paths that appear inside a pasted block (attribute id)', () => {
    const prompt =
      'fix src/lib/real.ts <pasted_content id="ab12">trace at src/lib/noise.ts:10</pasted_content id="ab12"> thanks';
    expect(extractPaths(prompt)).toEqual(['src/lib/real.ts']);
  });

  it('ignores paths inside a pasted block (id in the tag name)', () => {
    const prompt = 'x <pasted_content_ab12>src/lib/noise.ts</pasted_content_ab12> y src/lib/real.ts';
    expect(extractPaths(prompt)).toEqual(['src/lib/real.ts']);
  });

  it('drops everything after an unterminated pasted block', () => {
    expect(extractPaths('src/a.ts <pasted_content id="1">src/b.ts and more')).toEqual(['src/a.ts']);
  });

  it('leaves prompts without a pasted block untouched', () => {
    expect(stripPastedBlocks('plain src/a.ts')).toBe('plain src/a.ts');
  });

  it('does not fire door hints from pasted text', () => {
    const prompt = 'hello <pasted_content id="1">Sentry production error</pasted_content id="1">';
    expect(matchDoorHints(stripPastedBlocks(prompt))).toEqual([]);
  });
});

describe('route-prompt doc cap', () => {
  it('uses the mapper shortlist, capped at MAX_DOCS', () => {
    const docs = pickDocs({ contextDocs: { docs: ['a', 'b', 'c', 'd', 'e'] } });
    expect(docs).toEqual(['a', 'b', 'c']);
    expect(MAX_DOCS).toBe(3);
  });

  it('falls back to the first MAX_DOCS mapped docs for older mapper output', () => {
    const docs = pickDocs({
      impactedFeatures: [{ docs: ['a', 'b'] }, { docs: ['b', 'c', 'd'] }],
    });
    expect(docs).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for empty mapper output', () => {
    expect(pickDocs({})).toEqual([]);
  });
});

describe('route-prompt door hints', () => {
  it('maps a landing prompt to /land', () => {
    expect(matchDoorHints('can you land this PR now')).toContain('/land');
  });

  it('maps a new-task prompt to /worktree', () => {
    expect(matchDoorHints('start a new task for the golf leaderboard fix')).toContain('/worktree');
  });

  it('maps a gates prompt to /gates', () => {
    expect(matchDoorHints('run the gates before I push')).toContain('/gates');
  });

  it('maps a held-migrations prompt to /held', () => {
    expect(matchDoorHints('are there any held migrations right now')).toContain('/held');
  });

  it('maps a Sentry prompt to the helm-sentry skill', () => {
    expect(matchDoorHints('there is a production error in Sentry')).toContain('helm-sentry skill');
  });

  it('maps a Supabase/migration prompt to the helm-supabase skill', () => {
    expect(matchDoorHints('write a new supabase migration for golf_rounds')).toContain(
      'helm-supabase skill',
    );
  });

  it('returns no hints for an unrelated prompt', () => {
    expect(matchDoorHints('what is the capital of France')).toEqual([]);
  });

  it('can return multiple hints for one prompt', () => {
    const hints = matchDoorHints('run the gates then land this PR');
    expect(hints).toContain('/gates');
    expect(hints).toContain('/land');
  });
});

describe('route-prompt subprocess contract', () => {
  it('exits 0 silently for a prompt with no path', () => {
    const stdout = run('hello there');
    expect(stdout).toBe('');
  });

  it('exits 0 and never throws on malformed stdin', () => {
    expect(() =>
      execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf-8' }),
    ).not.toThrow();
  });

  it('exits 0 for a prompt naming a path, even if mapping finds nothing', () => {
    // Uses a path that maps to no registry feature; must not throw or block.
    expect(() => run('look at src/does/not/exist.ts')).not.toThrow();
  });
});
