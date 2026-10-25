import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TrustChip } from '../TrustChip';

afterEach(cleanup);

describe('TrustChip', () => {
  it('names each trust state in words', () => {
    for (const [state, label] of [
      ['upcoming', 'Upcoming'],
      ['live', 'Live'],
      ['suspended', 'Suspended'],
      ['final', 'Final'],
      ['official', 'Official'],
    ] as const) {
      const { container } = render(<TrustChip state={state} />);
      expect(container.querySelector('.ch-trust')).toHaveClass(`ch-trust--${state}`);
      expect(container.textContent).toBe(label);
      cleanup();
    }
  });

  it('draws the live dot only for Live and the check only for Official, both hidden from assistive tech', () => {
    const live = render(<TrustChip state="live" />).container;
    expect(live.querySelector('.ch-trust__dot')).toHaveAttribute('aria-hidden', 'true');
    expect(live.querySelector('svg')).toBeNull();
    cleanup();
    const official = render(<TrustChip state="official" />).container;
    expect(official.querySelector('.ch-trust__dot')).toBeNull();
    expect(official.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the source a quiet label that never changes the tone', () => {
    const { container } = render(<TrustChip state="final" at="as of 10:42" source="pasted" />);
    expect(container.querySelector('.ch-trust')).toHaveClass('ch-trust--final');
    expect(container.textContent).toBe('Finalas of 10:42· Pasted');
    expect(container.querySelector('.ch-trust__src')?.textContent).toBe('· Pasted');
  });
});
