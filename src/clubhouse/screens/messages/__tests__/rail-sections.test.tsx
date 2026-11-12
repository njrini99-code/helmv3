// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChMessagesApi } from '../api/types';
import { InboxSkeleton } from '../inbox/InboxSkeleton';
import { PinnedAndRecent } from '../inbox/PinnedAndRecent';
import { MessagesSkeleton } from '../MessagesSkeleton';
import type { ChConv } from '../model';

const conv = (id: string): ChConv => ({ id, group: false, title: `Person ${id}`, subtitle: 'Player', memberIds: [`u-${id}`], memberCount: 2, unread: 0, lastAt: '2026-10-18T11:00:00Z', lastSenderId: null, lastText: 'See you at 3', creatorId: null });
const list = [conv('a'), conv('b'), conv('c')];
const api = (pinned: string[]) => ({ pins: { ids: pinned, has: (id: string) => pinned.includes(id), atLimit: false, toggle: () => {} } }) as unknown as ChMessagesApi;
const rail = (pinned: string[]) =>
  render(
    <LazyMotion features={domAnimation}>
      <PinnedAndRecent api={api(pinned)} list={list} row={(c) => <button key={c.id} type="button" className="ch-ms-row">{c.title}</button>} />
    </LazyMotion>,
  ).container;

afterEach(cleanup);

/**
 * "Recent" stood over the rail's conversations even when they were its only list. A label tells two lists apart; over the
 * one list it told nothing, under a rail that already says "Messages" and how many. It is drawn only beside "Pinned".
 */
describe('Messages rail · "Recent" is a label only beside "Pinned"', () => {
  it('with nothing pinned the conversations carry no label, and the section keeps its name', () => {
    const c = rail([]);
    expect(c.querySelectorAll('.ch-ms-sec__l')).toHaveLength(0);
    const recent = screen.getByRole('region', { name: 'Recent' });
    expect(recent.querySelectorAll('.ch-ms-row')).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Pinned' })).toBeNull();
  });

  it('with a pin both lists are labelled, Pinned first', () => {
    const c = rail(['b']);
    expect([...c.querySelectorAll('.ch-ms-sec__l')].map((l) => l.textContent)).toEqual(['Pinned', 'Recent']);
    expect(screen.getByRole('region', { name: 'Pinned' }).querySelectorAll('.ch-ms-row')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Recent' }).querySelectorAll('.ch-ms-row')).toHaveLength(2);
  });

  it('the rail skeleton draws the label’s placeholder only when something is pinned, so rows wait where they land', () => {
    const bare = render(<InboxSkeleton layout="rail" />).container;
    expect(bare.querySelector('.ch-ms-sec__l')).toBeNull();
    expect(bare.querySelector('.ch-inb-skel.is-rail')!.firstElementChild!.classList.contains('ch-inb-skrow')).toBe(true);
    cleanup();
    const labelled = render(<InboxSkeleton layout="rail" labelled />).container;
    expect(labelled.querySelectorAll('.ch-ms-sec__l .ch-inb-sk.is-label')).toHaveLength(1);
    cleanup();
    // The route skeleton cannot know the pins: it waits as the rail with nothing pinned does.
    expect(render(<MessagesSkeleton />).container.querySelector('.ch-ms-rail .ch-ms-sec__l')).toBeNull();
  });
});
