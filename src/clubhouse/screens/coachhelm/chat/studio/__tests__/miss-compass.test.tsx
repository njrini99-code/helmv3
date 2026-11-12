/**
 * The Miss Compass, drawn (CoachHelm Studio Phase 1; the data half is lib/coachhelm/v3/chat/__tests__/miss-compass-data.test.ts).
 * Off (no team flag) is today's drawing, byte for byte, whatever the stored block holds. On: eight labelled directions, chosen by
 * tap or arrow keys with no network and no model call, a drawer of the shots behind one (each opening its round, capped with
 * the true count said), and "Ask about these shots" handing Ask's page the selection to send.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

import type { MissPatternBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { STUDIO_SPECIMENS } from '../../../../../preview/fixtures-chat-studio';
import { Studio } from '..';
import { MissCompassGate, type MissCompassGateValue } from '../compass-gate';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom has no <dialog> methods (the phone's sheet is the app's Modal).
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
};

const spec = STUDIO_SPECIMENS.find((s) => s.id === 'distance_compass')!;
const WITH = (spec.part.data as { misses: MissPatternBlock }).misses;
const { shots: _shots, ...WITHOUT } = WITH;
const part = (misses: MissPatternBlock) => ({ kind: 'distance_profile', data: { form: 'misses', misses } });
const gated = (value: MissCompassGateValue, node: ReactNode) => <MissCompassGate.Provider value={value}>{node}</MissCompassGate.Provider>;

describe('off: today’s drawing, byte for byte', () => {
  it.each(['full', 'compact'] as const)('%s: no gate, a gate that is off, or a block stored without shots all draw the old pattern', (size) => {
    const today = renderToStaticMarkup(<Studio part={part(WITHOUT as MissPatternBlock)} size={size} read="r7" />);
    expect(renderToStaticMarkup(<Studio part={part(WITH)} size={size} read="r7" />)).toBe(today);
    expect(renderToStaticMarkup(gated({ on: false }, <Studio part={part(WITH)} size={size} read="r7" />))).toBe(today);
    expect(renderToStaticMarkup(gated({ on: true }, <Studio part={part(WITHOUT as MissPatternBlock)} size={size} read="r7" />))).toBe(today);
    expect(today).toContain('ch-aks-miss');
    expect(today).not.toContain('ch-aks-compass');
  });
});

const draw = (askAbout = vi.fn(() => true), misses: MissPatternBlock = WITH, size: 'full' | 'compact' = 'full') => {
  render(gated({ on: true, askAbout }, <Studio part={part(misses)} size={size} read="r7" />));
  return { askAbout, group: screen.getByRole('radiogroup') };
};
const radio = (name: RegExp) => screen.getByRole('radio', { name });

describe('on: eight labelled directions, chosen locally', () => {
  it('each direction is named with its count and its share; the shots with none are counted apart; never places on a green', () => {
    const { group } = draw();
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(8);
    const directed = WITH.wedges.reduce((a, w) => a + w.count, 0);
    expect(radio(/^Right,/)).toHaveAccessibleName(`Right, 46 shots, ${Math.round((46 / directed) * 100)}%`);
    expect(radio(/^Long left,/)).toHaveAccessibleName(`Long left, 2 shots, ${Math.round((2 / directed) * 100)}%`);
    expect(group).toHaveAccessibleName(`Where the misses finished, by direction: ${directed} shots with a direction logged`);
    const caption = document.querySelector('.ch-aks-compass figcaption')!.textContent!;
    expect(caption).toContain('6 with no direction logged, not in the shares');
    expect(caption).toContain('Directions, not places on the green.');
    // One stop in the tab order, on the commonest direction.
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radio(/^Right,/)]);
    expect(radio(/^Right,/).className).toContain('is-most');
  });

  it('arrow keys walk the compass, skipping a direction with no shots, and choose as they go', () => {
    const empty: MissPatternBlock = { ...WITH, wedges: WITH.wedges.map((w) => (w.direction === 'long' ? { ...w, count: 0 } : w)) };
    draw(undefined, empty);
    expect(radio(/^Long,/)).toBeDisabled();
    const right = radio(/^Right,/);
    right.focus();
    fireEvent.keyDown(right, { key: 'ArrowUp' });
    expect(radio(/^Long right,/)).toHaveFocus();
    expect(radio(/^Long right,/)).toHaveAttribute('aria-checked', 'true');
    // Long has no shots: the walk passes over it to Long left.
    fireEvent.keyDown(radio(/^Long right,/), { key: 'ArrowLeft' });
    expect(radio(/^Long left,/)).toHaveFocus();
    // Down from Long left: Left, then Short left; at the edge it stays.
    fireEvent.keyDown(radio(/^Long left,/), { key: 'ArrowDown' });
    expect(radio(/^Left,/)).toHaveFocus();
    fireEvent.keyDown(radio(/^Left,/), { key: 'ArrowDown' });
    fireEvent.keyDown(radio(/^Short left,/), { key: 'ArrowDown' });
    expect(radio(/^Short left,/)).toHaveFocus();
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toEqual([radio(/^Short left,/)]);
  });

  it('a tap or a key makes no request and asks no model', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network here')));
    const { askAbout } = draw();
    fireEvent.click(radio(/^Right,/));
    fireEvent.keyDown(radio(/^Right,/), { key: 'ArrowDown' });
    fireEvent.click(radio(/^Short,/));
    expect(fetch).not.toHaveBeenCalled();
    expect(askAbout).not.toHaveBeenCalled();
  });
});

describe('the drawer: the shots behind one direction', () => {
  it('lists them newest round first, each opening its round, and says when the list is capped', () => {
    draw();
    fireEvent.click(radio(/^Right,/));
    const drawer = screen.getByRole('region', { name: '46 shots missed right' });
    expect(within(drawer).getByText('The newest 40 of 46, by round.')).toBeInTheDocument();
    const links = within(drawer).getAllByRole('link');
    expect(links).toHaveLength(40);
    const kept = WITH.shots!.directions.right!.shots;
    links.forEach((a, i) => expect(a).toHaveAttribute('href', `/golf/dashboard/rounds/${kept[i]!.round_id}`));
    expect(links[0]).toHaveAccessibleName(/^Open the round: Wed, Nov 4, Hilltop Golf Club, \d+ yd from the fairway · \d+ ft left$/);
    // The distance left is said after its number, as the round review says it, never as a direction ("left 18 ft").
    for (const a of links) expect(a.textContent).not.toMatch(/\bleft \d/);
  });

  it('a direction under the cap says no cap, and closing the drawer clears the choice', () => {
    draw();
    fireEvent.click(radio(/^Short right,/));
    const drawer = screen.getByRole('region', { name: '11 shots missed short right' });
    expect(within(drawer).queryByText(/The newest/)).toBeNull();
    expect(within(drawer).getAllByRole('link')).toHaveLength(11);
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close the shots' }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(radio(/^Short right,/)).toHaveAttribute('aria-checked', 'false');
  });

  it('“Ask about these shots” hands Ask the selection: the read and the direction, nothing else', () => {
    const { askAbout } = draw();
    fireEvent.click(radio(/^Right,/));
    fireEvent.click(screen.getByRole('button', { name: 'Ask about these shots' }));
    expect(askAbout).toHaveBeenCalledTimes(1);
    expect(askAbout).toHaveBeenCalledWith('Ask about the 46 shots that missed right', { evidence_ref: 'e7', key: 'shots:right' });
  });

  it('with no way to send (a host that gives none), the drawer still lists the shots and offers no ask', () => {
    render(gated({ on: true }, <Studio part={part(WITH)} size="full" read="r7" />));
    fireEvent.click(radio(/^Right,/));
    expect(screen.getAllByRole('link')).toHaveLength(40);
    expect(screen.queryByRole('button', { name: 'Ask about these shots' })).toBeNull();
  });
});

/** Every `selector { body }` in the studio sheet, comments dropped. */
const sheet = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-ask-studio.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => {
  const hit = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, s]) => s!.split(',').map((x) => x.trim()).includes(sel));
  expect(hit, sel).toBeTruthy();
  return hit![2]!;
};
const px = (decl: string, body: string) => Number(body.match(new RegExp(`(?:^|[;\\s])${decl}:\\s*(\\d+)px`))?.[1] ?? NaN);

describe('touch and motion', () => {
  it('every target is 44 or more: a direction, a shot, the close key', () => {
    const dir = rule('.ch-aks-compass__dir');
    expect(px('min-height', dir)).toBeGreaterThanOrEqual(44);
    expect(px('min-width', dir)).toBeGreaterThanOrEqual(44);
    expect(px('min-height', rule('.ch-aks-compass__shot'))).toBeGreaterThanOrEqual(44);
    const close = rule('.ch-aks-compass__close');
    expect(px('width', close)).toBeGreaterThanOrEqual(44);
    expect(px('height', close)).toBeGreaterThanOrEqual(44);
  });

  it('it draws in place: nothing moves when a direction is chosen, with or without reduced motion (the studio’s look)', () => {
    const compass = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => /ch-aks-compass/.test(s!));
    expect(compass.length).toBeGreaterThan(10);
    for (const [, sel, body] of compass) expect(body, sel).not.toMatch(/animation|transition/);
    expect(sheet).not.toMatch(/@keyframes ch-aks-compass/);
    // Rules, not boxes: no fill or shadow on a direction, the chosen one ruled in the selected ink.
    expect(rule('.ch-aks-compass__dir')).toMatch(/background: none;/);
    expect(rule('.ch-aks-compass__dir')).not.toMatch(/box-shadow/);
    // Selected ink (light at night), not --ch-selected-strong, a plate's fill that stays deep green in the dark.
    expect(rule('.ch-aks-compass__dir.is-on')).toMatch(/border-bottom: 2px solid var\(--ch-selected-ink\);/);
    expect(rule('.ch-aks-compass__dir.is-on .ch-aks-compass__word')).toMatch(/color: var\(--ch-selected-ink\);/);
  });
});

describe('the phone: the shots in a sheet', () => {
  it('a direction opens a sheet with its shots and the ask; a sent ask closes it, so it never sits over the answer', () => {
    const { askAbout } = draw(undefined, WITH, 'compact');
    fireEvent.click(radio(/^Short,/));
    const sheetEl = screen.getByRole('dialog');
    expect(sheetEl).toHaveAccessibleName('9 shots missed short');
    expect(within(sheetEl).getAllByRole('link')).toHaveLength(9);
    // In the sheet's footer, not at the end of the list: in reach without scrolling past every shot.
    expect(sheetEl.querySelector('.ch-aks-compass__drawer .ch-aks-compass__ask')).toBeNull();
    expect(within(sheetEl).getAllByRole('button', { name: 'Ask about these shots' })).toHaveLength(1);
    fireEvent.click(within(sheetEl).getByRole('button', { name: 'Ask about these shots' }));
    expect(askAbout).toHaveBeenCalledWith('Ask about the 9 shots that missed short', { evidence_ref: 'e7', key: 'shots:short' });
    expect(radio(/^Short,/)).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('an ask that is not sent (a reply on its way, offline) leaves the sheet open; on a desk the drawer stays after a send', () => {
    draw(vi.fn(() => false), WITH, 'compact');
    fireEvent.click(radio(/^Short,/));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ask about these shots' }));
    expect(radio(/^Short,/)).toHaveAttribute('aria-checked', 'true');
    cleanup();
    draw();
    fireEvent.click(radio(/^Short,/));
    fireEvent.click(screen.getByRole('button', { name: 'Ask about these shots' }));
    expect(screen.getByRole('region', { name: '9 shots missed short' })).toBeInTheDocument();
  });
});
