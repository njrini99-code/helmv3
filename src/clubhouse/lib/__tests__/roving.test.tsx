import { fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useRovingRows } from '../roving';

/** B11's arrow-key rows: a loading skeleton's placeholder rows share the row class but never take the Tab stop (#2361 audit). */
function List({ loading }: { loading: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useRovingRows(root, '.row');
  return (
    <div ref={root}>
      {loading ? (
        <>
          <div className="row" />
          <div className="row" />
        </>
      ) : (
        <>
          <button type="button" className="row">
            A
          </button>
          <button type="button" className="row" disabled>
            B
          </button>
          <a className="row" href="/c">
            C
          </a>
        </>
      )}
    </div>
  );
}

describe('useRovingRows', () => {
  it('gives a skeleton placeholder row no Tab stop', () => {
    const { container } = render(<List loading />);
    for (const r of container.querySelectorAll<HTMLElement>('.row')) expect(r.hasAttribute('tabindex')).toBe(false);
  });

  it('walks only links and enabled buttons once the rows land', async () => {
    const { container, rerender } = render(<List loading />);
    rerender(<List loading={false} />);
    const [a, b, c] = [...container.querySelectorAll<HTMLElement>('.row')];
    // The rows are settled as they arrive (a MutationObserver).
    await waitFor(() => expect(c!.tabIndex).toBe(-1));
    expect(a!.tabIndex).toBe(0);
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(c);
    expect(b!.hasAttribute('tabindex')).toBe(false);
  });
});
