// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRovingRows } from '../../../lib/roving';
import { RAIL_ROWS } from '../inbox/Rail';

/** The rail's markup as it is drawn: two conversations, the Announcements row, and what it opens to. */
function RailBody({ open }: { open: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useRovingRows(root, RAIL_ROWS);
  return (
    <div ref={root}>
      <button type="button" className="ch-ms-row" aria-current="true">
        Varsity team
      </button>
      <button type="button" className="ch-ms-row">
        Dan Whitfield
      </button>
      <section className="ch-ms-sec is-ann">
        <button type="button" className="ch-ms-fold" aria-expanded={open}>
          Announcements
        </button>
        {open && (
          <div className="ch-ms-fold__body">
            <button type="button" className="ch-ms-row is-ann">
              Bus at 6:15
            </button>
            <button type="button" className="ch-ms-more">
              2 earlier announcements
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });
const text = () => document.activeElement?.textContent;

afterEach(cleanup);

/**
 * ↑ and ↓ walked `.ch-ms-row` only. The Announcements row is a `.ch-ms-fold`, so ↓ stopped on the last conversation, and
 * as a second Tab stop Safari's Tab went past it to the thread: a keyboard could not open the team's announcements.
 */
describe('Messages rail · the arrows reach Announcements', () => {
  it('↓ from the last conversation lands on the Announcements row, and ↑ comes back', () => {
    const { container } = render(<RailBody open={false} />);
    container.querySelectorAll<HTMLElement>('.ch-ms-row')[1]!.focus();
    key('ArrowDown');
    expect(text()).toBe('Announcements');
    key('ArrowDown');
    expect(text()).toBe('Announcements');
    key('ArrowUp');
    expect(text()).toBe('Dan Whitfield');
  });

  it('open, the walk goes on through its announcements to "earlier announcements"', () => {
    const { container } = render(<RailBody open />);
    container.querySelector<HTMLElement>('.ch-ms-fold')!.focus();
    key('ArrowDown');
    expect(text()).toBe('Bus at 6:15');
    key('ArrowDown');
    expect(text()).toBe('2 earlier announcements');
    key('Home');
    expect(text()).toBe('Varsity team');
    key('End');
    expect(text()).toBe('2 earlier announcements');
  });

  it('the rail stays one Tab stop: the open conversation, with the Announcements row inside the walk', () => {
    const { container } = render(<RailBody open />);
    const stops = [...container.querySelectorAll<HTMLElement>('button')].filter((b) => b.tabIndex === 0);
    expect(stops.map((b) => b.textContent)).toEqual(['Varsity team']);
  });
});
