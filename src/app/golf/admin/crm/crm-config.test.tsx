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

  // `accent-*` IS the Fairway green scale (--fw-color-accent-* in
  // src/styles/design-tokens.css). It replaced the legacy `primary-*` alias
  // when the CRM moved onto the design system.
  it('keeps nurture in the Fairway green family across every CRM view', () => {
    expect(STATUS_CONFIG.nurture.bgColor).toContain('accent');
    expect(STATUS_CONFIG.nurture.color).toContain('accent');
    expect(STATUS_COLORS.nurture.bg).toContain('accent');
    expect(STATUS_COLORS.nurture.text).toContain('accent');
    expect(`${STATUS_COLORS.nurture.bg} ${STATUS_COLORS.nurture.text}`).not.toMatch(/teal|blue|violet/);
  });

  // Fairway's green-forward palette means several statuses share the accent
  // family — `won` and `nurture` are both "closed" greens. Keep them on
  // DIFFERENT steps of the ramp so the two columns stay distinguishable.
  it('separates won from nurture on the accent ramp', () => {
    expect(STATUS_COLORS.won.bg).not.toBe(STATUS_COLORS.nurture.bg);
    expect(STATUS_COLORS.won.text).not.toBe(STATUS_COLORS.nurture.text);
  });

  it('assigns every persisted status to exactly one pipeline stage', () => {
    const staged = PIPELINE_STAGES.flatMap((stage) => stage.statuses);
    expect(staged).toHaveLength(STATUSES.length);
    expect(new Set(staged)).toEqual(new Set(STATUSES));
  });
});
