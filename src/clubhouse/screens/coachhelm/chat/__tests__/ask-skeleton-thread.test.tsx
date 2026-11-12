import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AskSkeleton } from '../AskSkeleton';

/** #6 (preview, 12 Nov): opening a saved chat (`?c=`) drew the new chat's home while it loaded, then the thread replaced it. */
describe('AskSkeleton', () => {
  it('a saved chat waits in the thread shape: the question, the answer leaf and the docked composer, no home', () => {
    const { container } = render(<AskSkeleton chained thread />);
    expect(container.querySelector('.ch-ask-sk__thread .ch-ask-sk__q')).not.toBeNull();
    expect(container.querySelector('.ch-ask-sk__thread .ch-ask-sk__leaf')).not.toBeNull();
    expect(container.querySelector('.ch-ask-sk__dock')).not.toBeNull();
    expect(container.querySelector('.is-home, .ch-ask-sk__ph, .ch-ask-caps')).toBeNull();
  });

  it('a new chat still waits as the home', () => {
    const { container } = render(<AskSkeleton chained />);
    expect(container.querySelector('.ch-ask-scroll.is-home')).not.toBeNull();
    expect(container.querySelector('.ch-ask-sk__ph')).not.toBeNull();
    expect(container.querySelector('.ch-ask-sk__thread')).toBeNull();
  });

  it('either way it is one busy main with the screen\'s h1', () => {
    for (const thread of [true, false]) {
      const { container, unmount } = render(<AskSkeleton thread={thread} />);
      expect(container.querySelector('main[aria-busy="true"] h1')?.textContent).toBe('Ask CoachHelm');
      unmount();
    }
  });
});
