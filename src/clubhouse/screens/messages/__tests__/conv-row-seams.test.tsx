import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

import '../../../__tests__/dialog-polyfill';
import { ConvRow, type ChMessagesApi } from '../MessagesView';
import type { ChConv } from '../model';

/**
 * The phone inbox's seams (lane B leftover, "ConvRow seams"). A conversation's sheets (its long-press menu, Mute,
 * Delete) are <dialog>s rendered in place after its swipe frame, and they stay mounted once opened so they can ease
 * out. The seam between frames was `.ch-ms-swipe + .ch-ms-swipe`, so once a row's sheet had opened, the dialog sat
 * between that frame and the next and the seam under the row was gone for good. The seam reads any earlier frame
 * (`~`), and a pressed or swiped row's neighbour steps its seam aside across those dialogs too.
 */
const css = readFileSync(join(__dirname, '../../../styles/messages.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const api = { selectedId: null, select: vi.fn(), now: new Date('2026-10-18T12:00:00Z'), timeZone: 'America/New_York', viewer: { userId: 'me' }, directory: [], setRead: vi.fn(async () => true) } as unknown as ChMessagesApi;
const conv = (id: string, title: string): ChConv => ({ id, group: false, title, subtitle: 'Player', memberIds: [`u-${id}`], memberCount: 2, unread: 0, lastAt: '2026-10-18T11:00:00Z', lastSenderId: null, lastText: 'See you at 3', creatorId: null });

afterEach(cleanup);

/** The phone's seam rule: the selectors of the block that draws `::before` on a framed row, without the pseudo. */
function seamSelectors(): string[] {
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (/content: '';/.test(m[2]!) && /height: var\(--ch-hairline-w\);/.test(m[2]!) && m[1]!.includes('.ch-ms-swipe') && m[1]!.includes('.ch-ms-row::before')) {
      return m[1]!.split(',').map((s) => s.trim().replace(/::before$/, ''));
    }
  }
  return [];
}

describe('phone inbox seams across a row’s sheets', () => {
  it('a row whose sheet has opened keeps the seam under it', () => {
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <div className="ch-msp">
            <div className="ch-ms-sec__card">
              <ConvRow api={api} c={conv('c1', 'Maya Reyes')} phone />
              <ConvRow api={api} c={conv('c2', 'Ava Thompson')} phone />
              <ConvRow api={api} c={conv('c3', 'Sam Lee')} phone />
            </div>
          </div>
        </div>
      </LazyMotion>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Maya Reyes' }));
    const frames = [...document.querySelectorAll<HTMLElement>('.ch-ms-swipe')];
    expect(frames).toHaveLength(3);
    // The sheet is in place, between the first frame and the second.
    expect(frames[0]!.nextElementSibling?.tagName).toBe('DIALOG');
    const selectors = seamSelectors();
    expect(selectors.length).toBeGreaterThan(0);
    const seamed = (el: HTMLElement) => selectors.some((s) => el.querySelector('.ch-ms-row')!.matches(s));
    expect(frames.map(seamed)).toEqual([false, true, true]);
  });

  it('the pressed and swiped rows step their neighbour’s seam aside across up to three sheets', () => {
    const hide = [...css.matchAll(/([^{}]*)\{\s*opacity: 0;\s*\}/g)].map((m) => m[1]!).find((s) => s.includes('.ch-ms-swipe[data-side]'));
    expect(hide).toBeTruthy();
    for (const between of ['', ' + dialog', ' + dialog + dialog', ' + dialog + dialog + dialog']) {
      expect(hide).toContain(`.ch-msp .ch-ms-swipe[data-side]${between} + .ch-ms-swipe .ch-ms-row::before`);
      expect(hide).toContain(`.ch-msp .ch-ms-swipe:has(.ch-ms-row[data-ch-pressed])${between} + .ch-ms-swipe .ch-ms-row::before`);
    }
  });
});

describe('desktop rail seams across a row’s mounted dialog', () => {
  // A desktop row's Mute or Delete <dialog> stays mounted beside it after it first opens (Modal does not portal), so the
  // seam rule must not need the next row to be the adjacent sibling (review of #2361).
  it('draws the seam on any later row in the card, not only the adjacent one', () => {
    expect(css).toMatch(/^\.ch-ms-row ~ \.ch-ms-row::before \{/m);
    expect(css).not.toMatch(/^\.ch-ms-row \+ \.ch-ms-row::before/m);
  });

  it('a selected or hovered row hides its neighbour’s seam across one or two dialogs', () => {
    for (const x of ['.ch-ms-row.is-sel', '.ch-ms-row:hover']) {
      expect(css).toContain(`${x} + dialog + .ch-ms-row::before`);
      expect(css).toContain(`${x} + dialog + dialog + .ch-ms-row::before`);
    }
  });
});
