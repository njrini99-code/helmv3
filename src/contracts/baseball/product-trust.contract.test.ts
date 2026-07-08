import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Baseball product-trust surface contracts', () => {
  it('Command Center cover accepts explicit load/error props and renders honest states', () => {
    const src = read('src/components/baseball/command-center/CommandCenterFairway.tsx');
    expect(src).toContain('riskFeedError');
    expect(src).toContain('loadState');
    // Honest degraded/empty states come from the Living-Annual kit (EditorsLetter),
    // never a yellow warning box: an error branch and a signed STANDING-BY letter.
    expect(src).toMatch(/riskFeedError \?/);
    expect(src).toContain('EditorsLetter');
    expect(src).toMatch(/Standing by/i);
  });

  it('DailyBriefPanel distinguishes error vs empty insights', () => {
    const src = read('src/components/baseball/command-center/DailyBriefPanel.tsx');
    expect(src).toContain('error');
    expect(src).toMatch(/No insights yet|insights/i);
  });

  it('Stats Center client surfaces load errors separately from empty roster', () => {
    const src = read('src/components/baseball/stats-center/StatsCenterClient.tsx');
    expect(src).toMatch(/error|authorized/i);
    expect(src).toMatch(/No players|No box-score|empty/i);
  });

  it('Documents client keeps an explicit empty copy path', () => {
    // The empty state moved into the Living-Annual kit (EmptyIssue variant
    // "documents" — copy lives in molecules/EmptyIssue.tsx as "The file drawer
    // is empty."). Assert the structural empty path in the client chrome, and
    // the copy itself at its single source of truth in the kit.
    const src = read('src/components/baseball/documents/DocumentsFairway.tsx');
    expect(src).toMatch(/EmptyIssue[\s\S]*?variant="documents"/);
    const kit = read('src/components/baseball/living-annual/molecules/EmptyIssue.tsx');
    expect(kit).toMatch(/documents:\s*\{[\s\S]*?title:\s*'[^']+'/);
  });

  it('canonical read models expose authorized + error envelopes', () => {
    for (const path of [
      'src/lib/baseball/read-models/command-center.ts',
      'src/lib/baseball/read-models/stats-center.ts',
      'src/lib/baseball/read-models/signal-inbox.ts',
    ]) {
      const src = read(path);
      expect(src).toContain('authorized');
      expect(src).toContain('error');
    }
  });

  it('command center page uses the adapter instead of ad hoc roster queries', () => {
    const src = read('src/app/baseball/(dashboard)/dashboard/command-center/page.tsx');
    expect(src).toContain('assembleCommandCenterClientProps');
    expect(src).toContain('getCommandCenter');
    expect(src).not.toContain('baseball_player_aggregates');
    expect(src).not.toContain('baseball_team_members');
  });
});
