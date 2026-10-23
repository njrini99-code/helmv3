import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { FormLine, FormRange } from '../FormLine';

afterEach(cleanup);

/** B5: a table's form lines share one range and one set of round slots, so height and position compare across rows. */
describe('FormRange', () => {
  const dot = (name: string) => screen.getByRole('img', { name }).querySelector('circle')!;

  it('the same newest score sits at the same height in every row, and a shorter line ends under the others', () => {
    render(
      <FormRange trends={[[76, 75, 74, 73, 72], [74, 72]]}>
        <FormLine data={[76, 75, 74, 73, 72]} label="Long" />
        <FormLine data={[74, 72]} label="Short" />
      </FormRange>,
    );
    expect(dot('Short').getAttribute('cy')).toBe(dot('Long').getAttribute('cy'));
    expect(dot('Short').getAttribute('cx')).toBe(dot('Long').getAttribute('cx'));
  });

  it('a row too short to draw does not stretch the range', () => {
    const one = render(
      <FormRange trends={[[74, 73, 72]]} earlyBelow={3}>
        <FormLine data={[74, 73, 72]} earlyBelow={3} label="A" />
      </FormRange>,
    );
    const alone = dot('A').getAttribute('cy');
    one.unmount();
    render(
      <FormRange trends={[[74, 73, 72], [90, 60]]} earlyBelow={3}>
        <FormLine data={[74, 73, 72]} earlyBelow={3} label="A" />
        <FormLine data={[90, 60]} earlyBelow={3} label="Early" />
      </FormRange>,
    );
    expect(dot('A').getAttribute('cy')).toBe(alone);
    expect(screen.getByRole('img', { name: 'Early' }).textContent).toBe('Early read');
  });

  it('the line itself is hidden inside its named image', () => {
    render(<FormLine data={[74, 73, 72]} label="Form" />);
    const img = screen.getByRole('img', { name: 'Form' });
    expect(img.querySelector('.ch-line')!.getAttribute('aria-hidden')).toBe('true');
    expect(img.querySelector('[tabindex]')).toBeNull();
  });
});
