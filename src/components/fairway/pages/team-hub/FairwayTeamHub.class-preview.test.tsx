/**
 * Team Hub "Class schedule" card: at 390px the days · time label sat beside
 * the class name and squeezed it to "MATH 2415 - C…", too short to read. The
 * name now has the full row width (two lines before clamping) and days · time
 * sit on their own line under it.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayTeamHub, type TeamHubClass } from './FairwayTeamHub';

const CALCULUS: TeamHubClass = {
  id: 'class-1',
  class_name: 'MATH 2415 - Calculus III',
  instructor: null,
  days: ['M', 'W', 'F'],
  start_time: '09:00',
  end_time: '09:50',
  building: null,
  room: null,
  credits: 4,
  color: null,
};

function renderHub(classes: TeamHubClass[]) {
  return render(
    <FairwayTeamHub
      tasks={[]}
      announcements={[]}
      classes={classes}
      teammates={[]}
      todayInTeamZone="2026-08-18"
      teamName="Wildcats Golf"
      onCompleteTask={async () => {}}
    />,
  );
}

describe('Team Hub class preview row', () => {
  it('lets the class name wrap instead of truncating it to a single line', () => {
    renderHub([CALCULUS]);

    const name = screen.getByText('MATH 2415 - Calculus III');
    expect(name.className).not.toMatch(/\btruncate\b/);
    expect(name.className).toContain('line-clamp-2');
  });

  it('puts days and time on their own line under the name', () => {
    renderHub([CALCULUS]);

    const name = screen.getByText('MATH 2415 - Calculus III');
    const when = screen.getByText('MWF · 9:00 AM – 9:50 AM');
    // Stacked in one column, not competing with the name for row width.
    expect(name.nextElementSibling).toBe(when);
    expect(when.parentElement?.className).not.toMatch(/\bitems-center\b/);
  });

  it('renders the name alone when a class has no days or time', () => {
    renderHub([{ ...CALCULUS, days: null, start_time: null, end_time: null }]);

    const name = screen.getByText('MATH 2415 - Calculus III');
    expect(name.nextElementSibling).toBeNull();
  });
});
