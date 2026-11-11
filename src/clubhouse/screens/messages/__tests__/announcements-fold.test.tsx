// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsSection } from '../announcements';
import type { ChAnnouncement } from '../model';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chTrail: vi.fn() }));

const ann = (over: Partial<ChAnnouncement>): ChAnnouncement => ({
  id: 'a1',
  title: 'Bus at 6:15',
  body: 'Bus leaves the field house at 6:15.',
  urgent: false,
  publishedAt: '2026-10-14T12:05:00Z',
  requiresAck: false,
  ackCount: 0,
  total: 6,
  acknowledgedByMe: false,
  taskCount: 0,
  completedTaskCount: 0,
  docCount: 0,
  ...over,
});
const api = (announcements: ChAnnouncement[], role: 'coach' | 'player' = 'player') =>
  ({
    announcements,
    annError: false,
    refetchAnns: () => {},
    selectedAnnId: null,
    selectAnn: () => {},
    viewer: { userId: 'me', role, name: 'Me' },
    now: '2026-10-14T18:00:00Z',
    timeZone: 'UTC',
    clock: '12h',
  }) as never;

const sheet = (file: string) => postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles', file), 'utf8'));
const css = sheet('messages.css');
const inbox = sheet('messages-inbox.css');
const decls = (selector: string, from = css) => {
  const out: Record<string, string> = {};
  from.walkRules((r) => {
    if (r.selector === selector && r.parent?.type === 'root') r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

afterEach(cleanup);

/**
 * The Announcements row was the one square icon tile in a list of round faces, and it wore a warning triangle whenever
 * the newest post was urgent. It is the section's row, not an announcement: its face is always the megaphone in the
 * announcement coin, and urgency is said on the announcement's own row.
 */
describe('Messages · the Announcements row’s face', () => {
  it('is the megaphone in the round announcement coin, even when the newest post is urgent', () => {
    render(<AnnouncementsSection api={api([ann({ urgent: true, requiresAck: true }), ann({ id: 'a2', title: 'Pairings posted' })])} q="" />);
    const face = screen.getByRole('button', { name: /^Announcements/ }).querySelector('.ch-ms-grp')!;
    expect(face.className).toBe('ch-ms-grp is-ann');
    expect(face.querySelector('svg.lucide-megaphone')).not.toBeNull();
    expect(face.querySelector('svg.lucide-triangle-alert')).toBeNull();
  });

  it('keeps the amber triangle on the urgent announcement’s own row', () => {
    render(<AnnouncementsSection api={api([ann({ urgent: true }), ann({ id: 'a2', title: 'Pairings posted' })])} q="bus" />);
    const row = document.querySelector('.ch-ms-row.is-ann')!;
    expect(row.querySelector('.ch-ms-grp.is-ann.is-urgent svg.lucide-triangle-alert')).not.toBeNull();
  });

  it('takes its shape and fill from the coin, with no square of its own', () => {
    const fold = decls('[data-ch-ms-v2] .ch-ms-fold .ch-ms-grp.is-ann');
    expect(fold).toEqual({ width: '44px', height: '44px' });
    expect(decls('.ch-ms-grp')).toMatchObject({ 'border-radius': '50%' });
  });
});

/**
 * The row carried two bare figures: a grey total after its title and the green count that waits on you. A figure with no
 * word is a guess, and two side by side were two guesses. The total is said in words on the line under the title; the
 * one figure left is the count that waits on you.
 */
describe('Messages · the Announcements row’s counts', () => {
  it('says how many posts there are in words, before the newest title', () => {
    render(<AnnouncementsSection api={api([ann({}), ann({ id: 'a2', title: 'Pairings posted' })])} q="" />);
    const fold = screen.getByRole('button', { name: /^Announcements/ });
    expect(fold.querySelector('.ch-ms-fold__b b')!.textContent).toBe('Announcements');
    expect(fold.querySelector('.ch-ms-fold__b b .ch-num')).toBeNull();
    expect(fold.querySelector('.ch-ms-fold__b > span')!.textContent).toBe('2 posts · Bus at 6:15');
  });

  it('says one post as one post', () => {
    render(<AnnouncementsSection api={api([ann({})])} q="" />);
    expect(document.querySelector('.ch-ms-fold__b > span')!.textContent).toBe('1 post · Bus at 6:15');
  });

  it('keeps the count that waits on a player, named, and shows a coach none', () => {
    const list = [ann({ requiresAck: true }), ann({ id: 'a2', title: 'Pairings posted' })];
    const { unmount } = render(<AnnouncementsSection api={api(list)} q="" />);
    const count = document.querySelector('.ch-ms-fold > .ch-ms-count')!;
    expect(count.textContent).toBe('1');
    expect(count.getAttribute('aria-label')).toBe('1 need your acknowledgement');
    unmount();
    render(<AnnouncementsSection api={api(list, 'coach')} q="" />);
    expect(document.querySelector('.ch-ms-fold > .ch-ms-count')).toBeNull();
  });

  it('gives the line two lines on the phone, as the rail does, so the words never cut the title', () => {
    const two = { display: '-webkit-box', 'white-space': 'normal', '-webkit-line-clamp': '2' };
    expect(decls('[data-ch-ms-v2] .ch-inb--phone .ch-ms-fold__b > span', inbox)).toMatchObject(two);
    expect(decls('[data-ch-ms-v2] .ch-inb--rail .ch-ms-fold__b > span', inbox)).toMatchObject(two);
  });
});
