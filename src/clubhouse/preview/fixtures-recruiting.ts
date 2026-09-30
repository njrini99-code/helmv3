import type { ChDocument, ChProspect, ChRecruiting } from '../data/recruiting-shape';

/**
 * Recruiting's sample data: the eight prospects on the owner's boards (design/handoff/recruiting), with Mason Reilly's
 * three documents. "Now" is fixed, at midday UTC, so every relative date reads as the board's does and no test or
 * screenshot drifts with the calendar.
 */
export const PREVIEW_RECRUITING_NOW = '2026-09-25T16:00:00.000Z';

const p = (
  id: string,
  firstName: string,
  lastName: string,
  classYear: number,
  hometown: string,
  state: string,
  stage: ChProspect['stage'],
  createdAt: string,
  updatedAt: string,
  more: Partial<ChProspect> = {},
): ChProspect => ({
  id,
  firstName,
  lastName,
  name: `${firstName} ${lastName}`,
  classYear,
  email: null,
  phone: null,
  hometown,
  state,
  notes: null,
  stage,
  createdAt,
  updatedAt,
  ...more,
});

export const PREVIEW_PROSPECTS: ChProspect[] = [
  p('p-mason', 'Mason', 'Reilly', 2027, 'Charlotte', 'NC', 'offered', '2026-08-12T15:00:00.000Z', '2026-09-23T16:00:00.000Z', {
    email: 'mason.reilly@example.com',
    phone: '(555) 010-4418',
    notes: 'Saw Mason at the Carolinas Junior in July. Long hitter, needs work inside 100 yards. Official visit planned for October; parents want a decision by December.',
  }),
  p('p-caleb', 'Caleb', 'Nguyen', 2028, 'Raleigh', 'NC', 'recruiting', '2026-08-20T15:00:00.000Z', '2026-09-22T16:00:00.000Z', { email: 'caleb.nguyen@example.com' }),
  p('p-lila', 'Lila', 'Brennan', 2027, 'Greenville', 'SC', 'committed', '2026-07-30T15:00:00.000Z', '2026-09-21T16:00:00.000Z', { phone: '(555) 010-2290', notes: 'Committed on the September visit.' }),
  p('p-hannah', 'Hannah', 'Duarte', 2028, 'Savannah', 'GA', 'recruiting', '2026-08-01T15:00:00.000Z', '2026-09-19T16:00:00.000Z', { email: 'hannah.duarte@example.com' }),
  p('p-maya', 'Maya', 'Castillo', 2028, 'Charleston', 'SC', 'recruiting', '2026-08-05T15:00:00.000Z', '2026-09-16T16:00:00.000Z', { notes: 'Plays out of the Charleston junior program.' }),
  p('p-owen', 'Owen', 'Park', 2029, 'Columbia', 'SC', 'watched', '2026-09-12T15:00:00.000Z', '2026-09-12T15:00:00.000Z'),
  p('p-jack', 'Jack', 'Whitfield', 2027, 'Asheville', 'NC', 'watched', '2026-08-25T15:00:00.000Z', '2026-09-08T16:00:00.000Z', { email: 'jack.whitfield@example.com' }),
  p('p-ben', 'Ben', 'Adler', 2029, 'Durham', 'NC', 'watched', '2026-08-10T15:00:00.000Z', '2026-08-30T16:00:00.000Z'),
];

export const PREVIEW_DOCUMENTS: Record<string, ChDocument[]> = {
  'p-mason': [
    { id: 'd-1', title: 'Fall tournament schedule.pdf', category: 'schedule', fileName: 'Fall tournament schedule.pdf', fileType: 'application/pdf', size: 184_000, createdAt: '2026-09-02T15:00:00.000Z' },
    { id: 'd-2', title: 'Transcript, junior year.pdf', category: 'transcript', fileName: 'Transcript, junior year.pdf', fileType: 'application/pdf', size: 312_000, createdAt: '2026-08-28T15:00:00.000Z' },
    { id: 'd-3', title: 'Swing, down the line.mov', category: 'film', fileName: 'Swing, down the line.mov', fileType: 'video/quicktime', size: 9_400_000, createdAt: '2026-08-20T15:00:00.000Z' },
  ],
};

export const PREVIEW_RECRUITING: ChRecruiting = { prospects: PREVIEW_PROSPECTS, error: false, now: PREVIEW_RECRUITING_NOW };
export const PREVIEW_RECRUITING_EMPTY: ChRecruiting = { prospects: [], error: false, now: PREVIEW_RECRUITING_NOW };
export const PREVIEW_RECRUITING_FAILED: ChRecruiting = { prospects: [], error: true, now: PREVIEW_RECRUITING_NOW };
