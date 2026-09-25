import { describe, it, expect } from 'vitest';
import { buildBreadcrumbs } from '../FairwayDashboardShell';

const last = (p: string) => buildBreadcrumbs(p).at(-1)?.label;

describe('buildBreadcrumbs — CoachHelm sub-pages (walk-through 2026-09-24)', () => {
  it('titles the qualifier selection workspace "Selection", not "Ask"', () => {
    expect(last('/golf/dashboard/coachhelm/qualifying/0a000000-0000-4000-a000-000000000001')).toBe('Selection');
  });

  it('titles genome compare by its registry name', () => {
    expect(last('/golf/dashboard/coachhelm/genome/compare')).toBe('Genome Compare');
  });

  it('keeps "Ask" for the chat', () => {
    expect(last('/golf/dashboard/coachhelm/chat')).toBe('Ask');
  });
});
