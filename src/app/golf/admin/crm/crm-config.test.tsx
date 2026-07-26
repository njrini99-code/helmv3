import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STAGES,
  STATUS_COLORS,
  STATUS_CONFIG,
  type CoachStatus,
} from './crm-config';

const STATUSES: CoachStatus[] = [
  'new_lead',
  'contacted',
  'engaged',
  'proposal',
  'won',
  'lost',
  'nurture',
];

describe('CRM presentation contracts', () => {
  it('defines one complete label and color treatment for every persisted status', () => {
    for (const status of STATUSES) {
      expect(STATUS_CONFIG[status].label).toBeTruthy();
      expect(STATUS_COLORS[status].bg).toBeTruthy();
      expect(STATUS_COLORS[status].text).toBeTruthy();
      expect(STATUS_COLORS[status].border).toBeTruthy();
      expect(STATUS_COLORS[status].dot).toBeTruthy();
    }
  });

  it('keeps nurture in the Fairway green family across every CRM view', () => {
    expect(STATUS_CONFIG.nurture.bgColor).toContain('primary');
    expect(STATUS_CONFIG.nurture.color).toContain('primary');
    expect(STATUS_COLORS.nurture.bg).toContain('primary');
    expect(STATUS_COLORS.nurture.text).toContain('primary');
    expect(`${STATUS_COLORS.nurture.bg} ${STATUS_COLORS.nurture.text}`).not.toMatch(/teal|blue|violet/);
  });

  it('assigns every persisted status to exactly one pipeline stage', () => {
    const staged = PIPELINE_STAGES.flatMap((stage) => stage.statuses);
    expect(staged).toHaveLength(STATUSES.length);
    expect(new Set(staged)).toEqual(new Set(STATUSES));
  });
});
