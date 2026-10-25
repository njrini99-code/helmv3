import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../../../data/class-day-shape';
import { directClassPlayer, type ChThreadClassDay } from '../class-thread';
import type { ChConv, ChPerson } from '../model';
import { ThreadClassSub } from '../ThreadClassSub';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string): ChClassBlock => ({ classId: 'c', label: 'STAT 201 - Probability', kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const theo: ChClassDayPlayer = { playerId: 'p-theo', firstName: 'Theo', lastName: 'Park', avatarUrl: null, tracked: true, holds: true, onCourse: false, offToday: false, away: null, blocks: [block('13:30', '15:50')] };
const day = (players: ChClassDayPlayer[]): ChClassDay => ({ on: '2026-10-26', teamTimeZone: 'America/New_York', classTimeZone: 'America/New_York', term: null, nextTerm: null, players, fetchedAt: 0 });
const conv = (over: Partial<ChConv> = {}): ChConv => ({ id: 'c1', group: false, title: 'Theo Park', subtitle: 'Senior', memberIds: ['u-theo'], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...over });
const other = (over: Partial<ChPerson> = {}): ChPerson => ({ userId: 'u-theo', name: 'Theo Park', role: 'player', subtitle: 'Senior', playerId: 'p-theo', ...over });
const cls = (over: Partial<ChThreadClassDay> = {}): ChThreadClassDay => ({ day: day([theo]), now: at('14:30'), teamId: 't1', convTeamId: 't1', ...over });

afterEach(() => cleanup());

describe('directClassPlayer', () => {
  it('is the player of a 1:1 on the coach’s own team', () => {
    expect(directClassPlayer(cls(), conv(), other())?.playerId).toBe('p-theo');
  });
  it.each([
    ['no class day (a player viewer, or the flag off)', undefined, conv(), other()],
    ['a group', cls(), conv({ group: true }), other()],
    ['a coach on the other side', cls(), conv(), other({ role: 'coach', playerId: null })],
    ['a conversation with no team', cls({ convTeamId: null }), conv(), other()],
    ['a conversation whose team is not known yet', cls({ convTeamId: undefined }), conv(), other()],
    ['a conversation of another team', cls({ convTeamId: 't2' }), conv(), other()],
    ['a player not on the coach’s class day', cls({ day: day([]) }), conv(), other()],
  ])('is null for %s', (_what, c, v, o) => {
    expect(directClassPlayer(c, v, o)).toBeNull();
  });
});

describe('ThreadClassSub', () => {
  const view = (c: ChThreadClassDay | undefined, where: 'desktop' | 'phone' = 'desktop', v = conv(), o = other()) =>
    render(
      <LazyMotion features={domAnimation}>
        <ThreadClassSub cls={c} conv={v} other={o} sub="Senior" where={where} />
      </LazyMotion>,
    );

  it('desktop: the status, then the usual subtitle after a dot', () => {
    expect(view(cls()).container.textContent).toBe('In class until 11:50 AM · Senior');
  });
  it('phone: the status replaces the subtitle', () => {
    expect(view(cls(), 'phone').container.textContent).toBe('In class until 11:50 AM');
  });
  it('never names the class: the header is visible over a shoulder', () => {
    expect(view(cls()).container.textContent).not.toMatch(/STAT/);
  });
  it('without a status it is exactly the usual subtitle', () => {
    expect(view(cls({ now: at('16:30') })).container.textContent).toBe('Senior');
    expect(view(undefined).container.textContent).toBe('Senior');
    expect(view(cls({ convTeamId: 't2' })).container.textContent).toBe('Senior');
  });
});
