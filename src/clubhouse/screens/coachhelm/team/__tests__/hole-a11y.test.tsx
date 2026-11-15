import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { stationFigures, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { TeamHole } from '../TeamHole';
import { Huddle } from '../Huddle';
import { StationControl } from '../StationControl';
import { SpotCard } from '../SpotCard';
import { accessibleName, expectLabelInName } from '../../../../__tests__/label-in-name';

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

describe('the Huddle chart’s coins reach a screen reader (SWP-10)', () => {
  it('the chart is a named group, not an image, and its coins are buttons inside it', () => {
    const svg = render(<Huddle data={PREVIEW_TEAM_BOARD} onPlayer={() => {}} />).container.querySelector('.hudsvg')!;
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-label')).toMatch(/^Huddle chart/);
    expect(svg.querySelectorAll('[role="button"]').length).toBeGreaterThan(0);
  });
});

describe('the Team board’s chips and bars are named by what they show (SWP-04, MAC-09: Voice Control)', () => {
  it('each station chip’s name starts with its short name and figure; Course with its read words', () => {
    const { container } = render(<StationControl value="approach" onChange={() => {}} stations={PREVIEW_TEAM_BOARD.stations} courseReads={0} courseTab />);
    const chips = [...container.querySelectorAll('.stchips button')];
    expect(chips).toHaveLength(5);
    for (const chip of chips) expectLabelInName(chip);
    expect(accessibleName(chips[0]!)).toMatch(/^Tee, .*, off the tee$/);
    expect(accessibleName(chips[4]!)).toBe('Course, No reads, course and scoring');
  });

  it('a spot’s player rows have no aria-label to disagree with their face, and open with the first name shown', () => {
    const { container } = render(<SpotCard data={PREVIEW_TEAM_BOARD} station="approach" onRead={() => {}} onPlayer={() => {}} />);
    const rows = [...container.querySelectorAll('button.br')];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hasAttribute('aria-label')).toBe(false);
      const first = row.querySelector('.bn')!.childNodes;
      const shown = [...first].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
      expectLabelInName(row, shown);
    }
  });
});
