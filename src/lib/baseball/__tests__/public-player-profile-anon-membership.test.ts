import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const accessSource = readFileSync(
  join(REPO_ROOT, 'src/lib/baseball/public-profile-access.ts'),
  'utf8',
);
const pageSource = readFileSync(
  join(REPO_ROOT, 'src/app/baseball/(public)/player/[id]/page.tsx'),
  'utf8',
);

describe('anonymous public player profiles — private membership table boundary (#888)', () => {
  it('uses the anon-safe public-profile RPC instead of reading memberships for the public gate', () => {
    expect(accessSource).toMatch(
      /if\s*\(\s*!viewerUserId\s*\)[\s\S]*get_baseball_public_player_stats/,
    );
  });

  it('only includes the baseball_team_members relationship for an authenticated viewer', () => {
    expect(pageSource).toMatch(/const teamMembershipSelect = user \?/);
    expect(pageSource).toMatch(/\$\{teamMembershipSelect\}/);
  });
});
