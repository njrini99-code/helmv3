import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The Ask composer's `@` picker (P013, CH-13821) where it is hosted outside the Ask page: the shell's Ask sheet, which
 * loads no roster (`roster={false}`), and any host that clips it (the sheet's panel). The picker's keys and rows on the
 * Ask page are in coachhelm-ask.test.tsx.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { ASK_PLAYERS } from '../preview/fixtures-ask-thread';
import { AskComposer, type AskComposerProps } from '../screens/coachhelm/chat/Composer';
import { ToastProvider } from '../ui/Toast';

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const pickPanel = () => document.querySelector('.ch-ask-pick') as HTMLElement;
const names = (list: HTMLElement) => within(list).getAllByRole('option').map((o) => o.querySelector('.ch-ask-pick__name')?.textContent ?? o.textContent);

function show(props: Partial<AskComposerProps> = {}, clip = false) {
  const composer = (
    <AskComposer variant="dock" phone={false} players={[]} busy={false} failed={false} blocked={false} onSend={vi.fn()} onStop={vi.fn()} {...props} />
  );
  return render(<ToastProvider>{clip ? <div className="host-panel" style={{ overflow: 'hidden' }}>{composer}</div> : composer}</ToastProvider>);
}

/** Lays the page out: jsdom has no layout, so each element the picker measures gets the rectangle a browser would give it. */
function layout(rects: Record<string, { top: number; bottom: number }>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const hit = Object.entries(rects).find(([selector]) => this.matches(selector));
    const r = hit ? hit[1] : { top: 0, bottom: 0 };
    return { top: r.top, bottom: r.bottom, left: 0, right: 400, width: 400, height: r.bottom - r.top, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
  });
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
});
afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CH-13821 the picker without a roster (the shell’s Ask sheet)', () => {
  it('offers the stats alone: no Players group, and no “No active players” that is not true of the team', async () => {
    show({ roster: false });
    await userEvent.type(box(), '@');
    const list = screen.getByRole('listbox', { name: 'Mention a stat' });
    expect(within(list).queryByRole('group', { name: 'Players' })).toBeNull();
    expect(screen.queryByText('No active players')).toBeNull();
    expect(names(within(list).getByRole('group', { name: 'Stats' }))[0]).toBe('Scoring average');
    await userEvent.keyboard('{Enter}');
    expect(box().value).toBe('@Scoring average ');
  });

  it('says so when no stat matches, as one dimmed row', async () => {
    show({ roster: false });
    await userEvent.type(box(), '@zz');
    expect(screen.getByRole('option', { name: 'No stat by that name' })).toHaveAttribute('aria-disabled', 'true');
    expect(box()).not.toHaveAttribute('aria-activedescendant');
  });

  it('with a roster the players come back (the default)', async () => {
    show({ players: ASK_PLAYERS });
    await userEvent.type(box(), '@');
    expect(names(within(screen.getByRole('listbox', { name: 'Mention a player or stat' })).getByRole('group', { name: 'Players' }))[0]).toBe('Jonah Okafor');
  });
});

describe('CH-13821 the picker never runs past the edge that would clip it', () => {
  it('above the box, it is capped to the room between the box and the clipping panel’s top', async () => {
    layout({ '.host-panel': { top: 100, bottom: 420 }, '.ch-ask-cmp__box': { top: 250, bottom: 300 } });
    show({ roster: false }, true);
    await userEvent.type(box(), '@');
    // 250 - 100, less the 8px gap to the box and 8px kept from the edge.
    expect(pickPanel().style.getPropertyValue('--ch-ask-pick-room')).toBe('134px');
  });

  it('below the desktop’s new-chat box, it is capped to the room under the box', async () => {
    layout({ '.host-panel': { top: 0, bottom: 520 }, '.ch-ask-cmp__box': { top: 300, bottom: 420 } });
    show({ variant: 'hero', players: ASK_PLAYERS }, true);
    await userEvent.type(box(), '@');
    expect(pickPanel().style.getPropertyValue('--ch-ask-pick-room')).toBe('84px');
  });

  it('with nothing clipping it, the visible viewport is the edge', async () => {
    layout({ '.ch-ask-cmp__box': { top: 500, bottom: 560 } });
    show({ players: ASK_PLAYERS });
    await userEvent.type(box(), '@');
    expect(pickPanel().style.getPropertyValue('--ch-ask-pick-room')).toBe('484px');
  });
});
