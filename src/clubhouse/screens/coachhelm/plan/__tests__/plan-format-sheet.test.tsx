import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PracticePlanSheet } from '../sheet/PracticePlanSheet';
import { sheetFormat, toSheetModel } from '../sheet/plan-sheet-model';

const model = (format: ReturnType<typeof sheetFormat>, bring = true) => {
  const body = { ...PP_PLAN_PART.draft.body, bring: bring ? PP_PLAN_PART.draft.body.bring : [] };
  return toSheetModel({ body, why: PP_PLAN_PART.draft.why, title: 'Plan', team: 'Demo', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published Wed, Nov 4, 9:14 PM', format }, 'coach');
};
const headings = (c: HTMLElement) => [...c.querySelectorAll('.pp-h')].map((h) => h.firstChild?.textContent);

describe('the team’s format on the sheet (FID-PRAC-3)', () => {
  it('orders and names the sections as the format does', () => {
    const f = sheetFormat({ name: 'Fall practice sheet', sections: [{ key: 'header', name: 'Header' }, { key: 'schedule', name: 'Today' }, { key: 'groups', name: 'Squads' }] });
    const { container } = render(<PracticePlanSheet plan={model(f)} />);
    expect(headings(container).slice(0, 2)).toEqual(['Today', 'Squads']);
  });
  it('still prints what the format left out', () => {
    const f = sheetFormat({ name: 'Short', sections: [{ key: 'schedule', name: 'Today' }] });
    const { container } = render(<PracticePlanSheet plan={model(f)} />);
    expect(headings(container)).toEqual(['Today', 'Groups', 'Bring', 'Notes']);
  });
  it('says so in the foot, with the published time', () => {
    const f = sheetFormat({ name: 'Fall practice sheet', sections: [{ key: 'groups', name: 'Groups' }] });
    render(<PracticePlanSheet plan={model(f)} />);
    expect(screen.getByText('In your format · Fall practice sheet')).toBeTruthy();
    expect(screen.getByText('Published Wed, Nov 4, 9:14 PM')).toBeTruthy();
  });
  it('is the standard sheet with no format', () => {
    const { container } = render(<PracticePlanSheet plan={model(null)} />);
    expect(headings(container)).toEqual(['Groups', 'Schedule', 'Bring', 'Notes']);
    expect(screen.queryByText(/In your format/)).toBeNull();
  });
  it('gives Notes the full width with nothing to bring', () => {
    const { container } = render(<PracticePlanSheet plan={model(null, false)} />);
    expect(container.querySelector('.pp-two')).toBeNull();
    expect(headings(container)).toEqual(['Groups', 'Schedule', 'Notes']);
  });
  it('marks a loss, not a range, in a Why line', () => {
    const base = model(null);
    const plan = { ...base, rows: [{ ...base.rows[0]!, why: 'Holes 1-6 lost -0.9 a round, from 10-15 ft.' }] };
    const { container } = render(<PracticePlanSheet plan={plan} />);
    expect([...container.querySelectorAll('.neg')].map((n) => n.textContent)).toEqual(['−0.9']);
  });
});
