import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { stationFigures, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { TeamHole } from '../TeamHole';

/**
 * F-0007 (audit, 13 Nov 2026): the course map was role="img" with twelve station buttons inside it. An image's children are
 * presentational, so a screen reader never reached a station (axe nested-interactive, IBM aria_descendant_valid). The live hole is
 * a named group that keeps its buttons; each button's name starts with the words drawn on it (label in name), so a voice user can
 * say what they see. The empty hole, with nothing to press, stays one image.
 */

vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => true }));

afterEach(cleanup);

const stations = stationFigures(PREVIEW_TEAM_BOARD.players.list);
const base = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
/** Five players losing most at Putting: two coins and a "+3" button. */
const crowd = ['Mason Reed', 'Ethan Brooks', 'Cole Bennett', 'Dylan Park', 'Owen Carter'].map((name, i) => ({ ...base, id: `p-${i}`, name, first: name.split(' ')[0]!, worst: 'putting' as const, early: false }));

const hole = (bare = false) => render(<TeamHole stations={stations} players={bare ? [] : crowd} station="approach" onStation={() => {}} orientation="h" bare={bare} />).container;
const said = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('the course map’s stations reach a screen reader (F-0007)', () => {
  it('the live hole is a named group, not an image, and its station buttons are inside it', () => {
    const svg = hole().querySelector('.holesvg')!;
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    expect(svg.querySelectorAll('[role="button"]').length).toBeGreaterThanOrEqual(4);
  });

  it('each station’s name starts with its drawn label and figure', () => {
    const buttons = [...hole().querySelectorAll<SVGGElement>('[data-ch-team-station]')];
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      const label = said([...b.querySelectorAll('text')].map((t) => t.textContent ?? '').join(' '));
      expect(said(b.getAttribute('aria-label') ?? '').replace(/,/g, '')).toMatch(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    }
  });

  it('the "+N" button’s name starts with "+N"', () => {
    const more = hole().querySelector('[data-ch-team-more]')!;
    expect(more.textContent).toBe('+3');
    expect(more.getAttribute('aria-label')).toMatch(/^\+3 /);
  });

  it('the empty hole has nothing to press and stays one image', () => {
    const svg = hole(true).querySelector('.holesvg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelectorAll('[role="button"]')).toHaveLength(0);
  });
});
