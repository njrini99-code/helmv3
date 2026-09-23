/**
 * The two HELD.md parsers must read the same file the same way.
 *
 * `command-deck/decisions.ts` and `engineering/held-migrations.ts` both parse
 * `supabase/migrations/HELD.md`, and they disagreed: the Command Deck required
 * the status cell be pure uppercase, so every row carrying a qualifier
 * (`**HOLD — R3, not yet reviewed**`) fell through and the Decision Inbox
 * rendered "no held migrations" for five decisions genuinely waiting on the
 * owner. A silent zero standing in for unknown — the one thing this console's
 * read models exist not to do.
 *
 * This runs against the REAL HELD.md, not a fixture. A fixture would have kept
 * passing while the live file drifted into shapes neither parser matched,
 * which is exactly how the original bug survived: both parsers had passing
 * unit tests over hand-written rows.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseHeldMigrations as parseForDeck } from '@/lib/admin/command-deck/decisions';
import { parseHeldMigrations as parseForEngineering } from '@/lib/admin/engineering/held-migrations';

const markdown = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/HELD.md'),
  'utf8',
);

describe('HELD.md parsers', () => {
  it('the register still has the table shape both parsers assume', () => {
    // Guards against a vacuous pass if HELD.md is ever restructured.
    expect(markdown.split('\n').filter((l) => l.trim().startsWith('| `')).length).toBeGreaterThan(20);
  });

  it('both parsers find the same HOLD migrations in the real register', () => {
    const deck = parseForDeck(markdown)
      .filter((r) => r.status === 'HOLD')
      .map((r) => r.migration)
      .sort();
    const engineering = parseForEngineering(markdown).map((r) => r.migrationFile).sort();

    expect(deck.length).toBeGreaterThan(0);
    expect(deck).toEqual(engineering);
  });

  it('a qualified status is still classified by its leading keyword', () => {
    // The exact shape that used to vanish.
    const rows = parseForDeck(
      '| `20260906120000_x.sql` | **HOLD — R3, not yet reviewed** | why | 2026-09-06 |\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('HOLD');
    expect(rows[0]!.migration).toBe('20260906120000_x.sql');
  });

  it('every real HOLD row is reported, not a subset', () => {
    const holds = parseForDeck(markdown).filter((r) => r.status === 'HOLD');
    // Every line whose status cell begins with HOLD, counted independently of
    // either parser's own regex.
    const independent = markdown
      .split('\n')
      .filter((l) => /^\|\s*`[^`]+`.*\|\s*\*\*HOLD/.test(l.trim())).length;
    expect(holds.length).toBe(independent);
  });
});
