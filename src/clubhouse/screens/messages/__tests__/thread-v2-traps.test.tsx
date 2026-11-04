import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreadDatePill, ThreadJumpKey } from '../thread-v2';

afterEach(cleanup);

const raf = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });

function setBox(el: HTMLElement, box: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  for (const [k, v] of Object.entries(box)) Object.defineProperty(el, k, { configurable: true, writable: true, value: v });
}

/** A scroller already laid out, set before the hook's first read: the layout jsdom hasn't got. */
function Jump({ box, unseen = 0, onJump = () => undefined }: { box: { scrollHeight: number; clientHeight: number; scrollTop: number }; unseen?: number; onJump?: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div
        data-testid="s"
        ref={(el) => {
          ref.current = el;
          if (el) setBox(el, box);
        }}
      />
      <ThreadJumpKey scroller={ref} unseen={unseen} onJump={onJump} />
    </>
  );
}

/**
 * Messages trap 5 (MSG-JUMP-02), the part jsdom can hold: the rule for when the key shows. Whether the thread stays a screen up through
 * `document.fonts.ready` needs a real layout (the lane's Playwright check) and is not asserted here.
 */
describe('the jump key', () => {
  it('shows past 0.9 of the scroller above the end', async () => {
    render(<Jump box={{ scrollHeight: 2000, clientHeight: 500, scrollTop: 1000 }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeTruthy());
  });

  it('does not show at or within 0.9', async () => {
    render(<Jump box={{ scrollHeight: 2000, clientHeight: 500, scrollTop: 1050 }} />);
    await raf();
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).toBeNull();
  });

  it('shows at the end when something arrived unseen, with the count', () => {
    render(<Jump box={{ scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 }} unseen={2} />);
    const key = screen.getByRole('button', { name: 'Jump to latest, 2 new' });
    expect(key.querySelector('b')!.textContent).toBe('2');
  });

  it('calls its jump', async () => {
    const onJump = vi.fn();
    render(<Jump box={{ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 }} onJump={onJump} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to latest' }));
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('a scroll down to the end takes it away; a scroll back up brings it back', async () => {
    render(<Jump box={{ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 }} />);
    await screen.findByRole('button', { name: 'Jump to latest' });
    const s = screen.getByTestId('s');
    s.scrollTop = 1500;
    fireEvent.scroll(s);
    await raf();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull());
    s.scrollTop = 0;
    fireEvent.scroll(s);
    await raf();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeTruthy());
  });
});

function Dated({ tops }: { tops: Array<[string, number]> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div
        data-testid="s"
        ref={(el) => {
          ref.current = el;
          if (el) el.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
        }}
      >
        {tops.map(([label, top]) => (
          <div
            key={label}
            className="ch-ms-day"
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => ({ top }) as DOMRect;
            }}
          >
            <span>{label}</span>
          </div>
        ))}
      </div>
      <ThreadDatePill scroller={ref} forced />
    </>
  );
}

/** The date pill's choice of day (MSG-DATEPILL); trap 6's bounding boxes during a scroll stay with the Playwright check. */
describe('the date pill', () => {
  const pill = () => document.querySelector('.ch-msv-datepill');

  it('reads the day last passed, not the one coming', async () => {
    render(<Dated tops={[['Mon', -300], ['Tue', -40], ['Wed', 400]]} />);
    await waitFor(() => expect(pill()?.textContent).toBe('Tue'));
  });

  it('is hidden from assistive tech, the in-flow day is what is read', async () => {
    render(<Dated tops={[['Mon', -300]]} />);
    await waitFor(() => expect(pill()).not.toBeNull());
    expect(pill()!.getAttribute('aria-hidden')).toBe('true');
  });

  it('with no day above, there is no pill', async () => {
    render(<Dated tops={[['Wed', 400]]} />);
    await raf();
    expect(pill()).toBeNull();
  });
});

/** Trap 1 (MSG-THREAD-12), as a rule check: the conversation bar's CSS never reaches the shell's glass canvas bar. */
describe('the conversation bar stays on its own bar', () => {
  it('no Messages rule names the shell’s header.glass.top', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/messages.css'), 'utf8');
    expect(css).not.toMatch(/header\.glass/);
    expect(css).not.toMatch(/\.glass\.top/);
  });

  it('no screen under Messages sets it from script either', () => {
    const dir = resolve(process.cwd(), 'src/clubhouse/screens/messages');
    for (const f of readdirSync(dir)) {
      if (!/\.tsx?$/.test(f)) continue;
      expect(readFileSync(resolve(dir, f), 'utf8'), f).not.toMatch(/glass\.top/);
    }
  });
});
