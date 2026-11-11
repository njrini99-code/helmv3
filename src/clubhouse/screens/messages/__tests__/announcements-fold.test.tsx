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

const css = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/messages.css'), 'utf8'));
const decls = (selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
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
