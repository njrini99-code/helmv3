import { describe, it, expect } from 'vitest';

import { planToMarkdown } from './plan-markdown';
import type { PracticePlan } from '@/lib/coachhelm/v3/practice-rx/composer';

const DRILLS = [
  { id: 'd1', title: 'Gate putting', duration_min: 20 },
  { id: 'd2', title: '9-ball windows', duration_min: 30 },
];

function plan(partial: Partial<PracticePlan> = {}): PracticePlan {
  return {
    goal_id: 'team:putting',
    used_llm: true,
    raw_text: '',
    days: [
      { day: 1, drill_ids: ['d1'], prose: 'Short putts under pressure.' },
      { day: 2, drill_ids: ['d2', 'd1'], prose: 'Distance control.' },
    ],
    ...partial,
  };
}

describe('planToMarkdown', () => {
  it('renders a titled, day-by-day markdown doc resolving drill ids to titles', () => {
    const md = planToMarkdown({
      areaLabel: 'Putting',
      kind: 'weakness',
      plan: plan(),
      drills: DRILLS,
    });
    expect(md).toContain('# Team practice — Putting');
    expect(md).toContain('## Day 1');
    expect(md).toContain('Short putts under pressure.');
    expect(md).toContain('- Gate putting (20 min)');
    expect(md).toContain('- 9-ball windows (30 min)');
    // drill ids must never leak into the saved document
    expect(md).not.toContain('d1');
    expect(md).not.toContain('drill_ids');
  });

  it('drops unresolved drill ids rather than printing raw uuids', () => {
    const md = planToMarkdown({
      areaLabel: 'Driving',
      kind: 'strength',
      plan: plan({ days: [{ day: 1, drill_ids: ['ghost'], prose: 'Tempo work.' }] }),
      drills: DRILLS,
    });
    expect(md).toContain('Tempo work.');
    expect(md).not.toContain('ghost');
  });

  it('flags a template fallback and sorts days ascending', () => {
    const md = planToMarkdown({
      areaLabel: 'Approach play',
      kind: 'weakness',
      plan: plan({
        used_llm: false,
        days: [
          { day: 2, drill_ids: [], prose: 'Second.' },
          { day: 1, drill_ids: [], prose: 'First.' },
        ],
      }),
      drills: DRILLS,
    });
    expect(md).toContain('template fallback');
    expect(md.indexOf('## Day 1')).toBeLessThan(md.indexOf('## Day 2'));
  });

  it('handles an empty plan honestly', () => {
    const md = planToMarkdown({
      areaLabel: 'Scoring',
      kind: 'weakness',
      plan: plan({ days: [] }),
      drills: [],
    });
    expect(md).toContain('# Team practice — Scoring');
    expect(md).toContain('No drills are tagged to this area yet');
  });
});
