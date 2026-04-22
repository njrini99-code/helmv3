import { describe, it, expect } from 'vitest';
import {
  renderCoachDigest,
  type CoachDigestData,
} from '@/lib/email/coach-digest-template';

function baseData(
  overrides: Partial<CoachDigestData> = {},
): CoachDigestData {
  return {
    coachName: 'Coach Smith',
    teamName: 'Crimson Tide',
    date: 'Tuesday, April 22',
    topInsights: [],
    celebration: null,
    watch: null,
    baseUrl: 'https://helmsportslabs.test',
    ...overrides,
  };
}

describe('renderCoachDigest', () => {
  it('returns a rendered email with subject, html, and text', () => {
    const result = renderCoachDigest(
      baseData({
        topInsights: [
          {
            title: 'Bunker save % has fallen to 0%',
            content: 'Jake has not converted a bunker save in 12 rounds.',
            player_name: 'Jake M.',
            strokes_impact: 1.3,
            deep_link: '/golf/dashboard/players/jake-id#insight-abc',
          },
        ],
        celebration: null,
        watch: null,
      }),
    );

    expect(Object.keys(result).sort()).toEqual(['html', 'subject', 'text']);
    expect(result.subject).toBe(
      '3 things to know about your team this morning',
    );
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('Good morning, Coach Smith');
    expect(result.html).toContain('Crimson Tide');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('renders 3 top insights / no celebration / no watch', () => {
    const result = renderCoachDigest(
      baseData({
        topInsights: [
          {
            title: 'A',
            content: 'ac',
            player_name: 'Alpha',
            strokes_impact: 1.1,
            deep_link: '/a',
          },
          {
            title: 'B',
            content: 'bc',
            player_name: 'Bravo',
            strokes_impact: 0.9,
            deep_link: '/b',
          },
          {
            title: 'C',
            content: 'cc',
            player_name: 'Charlie',
            strokes_impact: 0.7,
            deep_link: '/c',
          },
        ],
      }),
    );

    expect(result.html).toContain('Top concerns today');
    expect(result.html).toContain('Alpha');
    expect(result.html).toContain('Bravo');
    expect(result.html).toContain('Charlie');
    expect(result.html).not.toContain('Bright spot');
    expect(result.html).not.toContain('On the watch list');

    expect(result.text).toContain('- Alpha (1.1 strokes): A');
    expect(result.text).toContain('- Bravo (0.9 strokes): B');
    expect(result.text).toContain('- Charlie (0.7 strokes): C');
    expect(result.text).not.toContain('Bright spot');
  });

  it('renders 1 insight + celebration + watch', () => {
    const result = renderCoachDigest(
      baseData({
        topInsights: [
          {
            title: 'Driver accuracy trending down',
            content: 'Fairway % fell from 62% to 48% in 10 rounds.',
            player_name: 'Jordan W.',
            strokes_impact: 1.8,
            deep_link: '/golf/dashboard/players/jw#insight-1',
          },
        ],
        celebration: {
          title: 'their 3-putt habit',
          player_name: 'Sam P.',
          deep_link: '/golf/dashboard/players/sp#insight-2',
        },
        watch: {
          title: 'putting from 6-10ft',
          player_name: 'Riley K.',
          deep_link: '/golf/dashboard/players/rk#insight-3',
        },
      }),
    );

    expect(result.html).toContain('Top concern today');
    expect(result.html).toContain('Jordan W.');
    expect(result.html).toContain('Bright spot');
    expect(result.html).toContain('Sam P.');
    expect(result.html).toContain('On the watch list');
    expect(result.html).toContain('Riley K.');
    expect(result.html).toContain('putting from 6-10ft');

    // Deep links are present and absolute.
    expect(result.html).toContain('https://helmsportslabs.test/golf/dashboard/players/jw#insight-1');
    expect(result.html).toContain('https://helmsportslabs.test/golf/dashboard/players/sp#insight-2');
    expect(result.html).toContain('https://helmsportslabs.test/golf/dashboard/players/rk#insight-3');

    expect(result.text).toContain('Bright spot');
    expect(result.text).toContain('Sam P. just resolved their 3-putt habit');
    expect(result.text).toContain('On the watch list');
    expect(result.text).toContain('Riley K. is trending toward a concern');
  });

  it('escapes HTML in dynamic content', () => {
    const result = renderCoachDigest(
      baseData({
        coachName: 'Coach <script>alert(1)</script>',
        topInsights: [
          {
            title: 'Evil & dangerous "title"',
            content: "<img src=x onerror=alert(1)>",
            player_name: "O'Malley",
            strokes_impact: 0.5,
            deep_link: '/x',
          },
        ],
      }),
    );

    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).toContain('&amp;');
    expect(result.html).toContain('&#39;');
  });

  it('uses singular "Top concern today" when exactly one insight', () => {
    const result = renderCoachDigest(
      baseData({
        topInsights: [
          {
            title: 'Only one',
            content: '',
            player_name: 'Solo',
            strokes_impact: 1.0,
            deep_link: '/solo',
          },
        ],
      }),
    );
    expect(result.html).toContain('Top concern today');
    expect(result.html).not.toContain('Top concerns today');
    expect(result.text).toContain('Top concern today');
  });

  it('falls back to default base URL when not provided', () => {
    const result = renderCoachDigest({
      coachName: 'Coach',
      teamName: 'Team',
      date: 'Monday, April 21',
      topInsights: [
        {
          title: 't',
          content: 'c',
          player_name: 'p',
          strokes_impact: 0.5,
          deep_link: '/p',
        },
      ],
      celebration: null,
      watch: null,
    });

    // Default falls through to helmsportslabs.com (or NEXT_PUBLIC_APP_URL).
    expect(
      /(helmsportslabs\.com|helmsportslabs\.test|localhost)/.test(result.html),
    ).toBe(true);
  });

  it('always returns a non-empty subject and text', () => {
    const result = renderCoachDigest(baseData());
    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
  });
});
