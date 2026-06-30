import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Golf access and tenant-boundary source-shape advisory contracts', () => {
  it('CH-AI-010 preserves CoachHelm insight reads through player/team scope and RLS', () => {
    const insightDelivery = read('src/app/golf/actions/insight-delivery.ts');

    expect(insightDelivery).toContain('verifyPlayerAccess');
    expect(insightDelivery).toContain('.eq(\'player_id\', playerId)');
    expect(insightDelivery).toContain('RLS restricts reads to teams the coach staffs');
    expect(insightDelivery).toContain('recordInsightExposure');
  });

  it('CH-AI-010 preserves coach ownership through golf_team_coach_staff in core CoachHelm services', () => {
    const budget = read('src/lib/coachhelm/v3/llm/budget.ts');
    const ranking = read('src/lib/coachhelm/v3/ranking/score.ts');
    const coachhelmData = read('src/app/golf/actions/coachhelm-data.ts');

    expect(budget).toContain(".from('golf_team_coach_staff')");
    expect(ranking).toContain(".from('golf_team_coach_staff')");
    expect(coachhelmData).toContain('golf_team_coach_staff');
  });

  it('CH-AI-010 has behavioral RLS coverage for cross-tenant insight isolation', () => {
    const rls = read('supabase/tests/rls/golf_coach_insights_cross_tenant_select.sql');

    expect(rls).toContain('coach B CANNOT read coach A cross-tenant insight');
    expect(rls).toContain('coach A CANNOT read coach B cross-tenant insight');
    expect(rls).toContain('golf_team_coach_staff');
  });
});
