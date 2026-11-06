import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';
import { toSheetModel } from '../../coachhelm/plan/sheet/plan-sheet-model';
import { PrintStudio, qrSvg } from '../PrintStudio';

const print = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
vi.mock('../../coachhelm/plan/PrintPlan', () => ({ printNode: (...a: unknown[]) => print(...a) }));

const model = (rotation: boolean) => {
  const b = PP_PLAN_PART.draft.body;
  const body = rotation ? b : { ...b, variants: { ...b.variants, main: { blocks: b.variants.main.blocks.filter((x) => x.kind !== 'stations') } } };
  return toSheetModel({ body, why: PP_PLAN_PART.draft.why, title: 'Short game', team: 'Demo', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach');
};
const drills = [{ name: 'Lag ladder', line: 'Putting · 20 min', setup: 'Tees at 20 feet.', goal: 'Inside 3 feet.' }];

describe('PrintStudio', () => {
  it('starts on the coach copy and the range board', () => {
    render(<PrintStudio plan={model(true)} drills={drills} planHref="/x" />);
    expect(screen.getByRole('switch', { name: 'Coach copy' })).toHaveProperty('checked', true);
    expect(screen.getByRole('switch', { name: 'Range board' })).toHaveProperty('checked', true);
    expect(screen.getByRole('switch', { name: 'Pocket cards' })).toHaveProperty('checked', false);
    expect(screen.getAllByText(/^Range board · Page/).length).toBeGreaterThan(0);
  });
  it('offers no board for a plan with no rotation, and no appendix with no drills', () => {
    render(<PrintStudio plan={model(false)} drills={[]} planHref="/x" />);
    expect(screen.queryByRole('switch', { name: 'Range board' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Drills appendix' })).toBeNull();
  });
  it('previews what the switches pick', () => {
    const { container } = render(<PrintStudio plan={model(true)} drills={drills} planHref="/x" />);
    expect(container.querySelector('.ch-prt-card')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Pocket cards' }));
    expect(container.querySelectorAll('.ch-prt-card').length).toBe(model(true).groups.length);
    fireEvent.click(screen.getByRole('switch', { name: 'Drills appendix' }));
    expect(container.querySelector('.ch-prt-drills h3')?.textContent).toBe('Lag ladder');
  });
  it('numbers the sheets across the pieces, coach copy two pages', () => {
    const { container } = render(<PrintStudio plan={model(true)} drills={drills} planHref="/x" />);
    const caps = [...container.querySelectorAll('figcaption')].map((c) => c.textContent);
    expect(caps[0]).toBe('Coach copy · Page 1 of 3');
    expect(caps[2]).toBe('Range board · Page 3 of 3');
  });
  it('puts Draft on a draft', () => {
    render(<PrintStudio plan={model(true)} drills={drills} planHref="/x" draft />);
    expect(screen.getAllByText(/Draft/).length).toBeGreaterThan(0);
  });
  it('makes a code that can be scanned', () => {
    expect(qrSvg('https://example.test/golf/dashboard/practice/plan/p1')).toContain('<svg');
  });
  it('has nothing to print with every switch off', () => {
    render(<PrintStudio plan={model(false)} drills={[]} planHref="/x" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Coach copy' }));
    expect(screen.getByRole('button', { name: 'Print' })).toHaveProperty('disabled', true);
  });
  it('prints the picked pages', () => {
    render(<PrintStudio plan={model(true)} drills={drills} planHref="/x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
