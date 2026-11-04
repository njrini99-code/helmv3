/** The four start tiles, by screen (coachhelm 05 "starts per screen"). Fixed copy; a tile only seeds a turn. */
export interface QuickStart {
  id: 'cal' | 'msg' | 'qual' | 'plan' | 'stat';
  title: string;
  line: string;
  ask: string;
}

const COMMON: QuickStart[] = [
  { id: 'cal', title: 'Add a practice', line: 'Say the day, time and place', ask: 'Add a team practice' },
  { id: 'msg', title: 'Message a thread', line: 'It drafts, you send', ask: 'Message the team' },
  { id: 'qual', title: 'Set a qualifier', line: 'Rounds, squad, your picks', ask: 'Set up a qualifier' },
  { id: 'stat', title: 'Who’s slipping?', line: 'Reads your team’s rounds', ask: 'Who has slipped most in the last month?' },
];
/** Each tile's own glyph (06 S-PANEL.hello: every icon the same green). */
export const START_ICON: Record<QuickStart['id'], string> = {
  cal: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  msg: 'M21 12a8 8 0 0 1-11.8 7L4 20l1-5A8 8 0 1 1 21 12z',
  qual: 'M6 21V4m0 0h11l-2 4 2 4H6',
  plan: 'M9 4h6v3H9zM8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16M9 12h6M9 16h4',
  stat: 'M4 19h16M7 16v-5M12 16V7M17 16v-3',
};
const PLAN: QuickStart = { id: 'plan', title: 'Make a practice plan', line: 'It asks what you want first', ask: 'Make a practice plan' };

export function quickStarts(pathname: string, planOn: boolean): QuickStart[] {
  const list = pathname.includes('/qualifiers') ? [COMMON[2]!, COMMON[0]!, COMMON[1]!, COMMON[3]!] : pathname.includes('/messages') ? [COMMON[1]!, COMMON[0]!, COMMON[2]!, COMMON[3]!] : COMMON;
  return planOn ? [...list.slice(0, 3), PLAN] : list;
}
