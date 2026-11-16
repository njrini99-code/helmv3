import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-S-29: a state a page reaches in production has a preview fixture, so it can be looked at without a database. The
 * preview page lists its states in its doc comment (` *   /clubhouse-preview/<screen> ?state=a | b`) and draws each in
 * that screen's entry (`state === 'a'`). Every state below is one a route returns (its failed, not-found, no-team, off
 * and loading pages) or a partial read the gap pass found had no fixture; each must be listed and drawn. Add a state
 * here when a route gains one.
 */
const REQUIRED: Record<string, readonly string[]> = {
  home: ['noteam', 'failed', 'loading', 'error-offline'],
  'home-player': ['noteam', 'failed', 'loading'],
  hub: ['noteam', 'failed', 'partial', 'loading'],
  'hub-player': ['noteam', 'failed', 'loading'],
  round: ['failed', 'notfound', 'loading'],
  stats: ['noteam', 'failed', 'partial', 'loading'],
  calendar: ['noteam', 'failed', 'partial', 'planfailed', 'loading'],
  'calendar-player': ['noteam'],
  messages: ['noteam', 'loading-route'],
  qualifiers: ['notfound', 'loading'],
  'qualifier-new': ['coachonly', 'loading'],
  'qualifier-selection': ['failed', 'coachonly', 'loading'],
  'coachhelm-practice-home': ['failed', 'off', 'noteam'],
  'coachhelm-practice-library': ['failed', 'off'],
  'coachhelm-practice-builder': ['failed'],
};

const SOURCE = readFileSync(join(__dirname, '..', '[screen]', 'page.tsx'), 'utf8');

/** The doc comment's table: each listed screen and the states its line names. */
function listed(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const line of SOURCE.split('\n')) {
    const m = /^ \*\s+\/clubhouse-preview\/([a-z0-9-]+(?:,\s*[a-z0-9-]+)*)\s+(.*)$/.exec(line);
    if (!m) continue;
    const screens = m[1]!.split(/,\s*/);
    const states = /[?&]state=([^,(]*)/.exec(m[2]!)?.[1] ?? '';
    for (const screen of screens) {
      const set = out.get(screen) ?? new Set<string>();
      for (const s of states.split('|')) if (s.trim()) set.add(s.trim());
      out.set(screen, set);
    }
  }
  return out;
}

/** One screen's entry in the `screens` table, from its key to the next key at the same depth. */
function entry(screen: string): string {
  const lines = SOURCE.split('\n');
  const key = new RegExp(`^ {4}(?:'${screen}'|${screen}): \\{`);
  const start = lines.findIndex((l) => key.test(l));
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && /^ {4}(?:'[a-z0-9-]+'|[a-z0-9]+): \{/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('Clubhouse preview state table (GAP-S-29)', () => {
  const table = listed();

  it.each(Object.entries(REQUIRED))('%s lists every state its route reaches', (screen, states) => {
    const have = table.get(screen) ?? new Set<string>();
    expect(states.filter((s) => !have.has(s))).toEqual([]);
  });

  it.each(Object.entries(REQUIRED))('%s draws every state it lists', (screen, states) => {
    const body = entry(screen);
    expect(body, `no entry for ${screen}`).not.toBe('');
    expect(states.filter((s) => !body.includes(`state === '${s}'`))).toEqual([]);
  });
});
