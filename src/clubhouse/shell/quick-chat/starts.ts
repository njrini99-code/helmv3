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
const PLAN: QuickStart = { id: 'plan', title: 'Make a practice plan', line: 'It asks what you want first', ask: 'Make a practice plan' };

export function quickStarts(pathname: string, planOn: boolean): QuickStart[] {
  const list = pathname.includes('/qualifiers') ? [COMMON[2]!, COMMON[0]!, COMMON[1]!, COMMON[3]!] : pathname.includes('/messages') ? [COMMON[1]!, COMMON[0]!, COMMON[2]!, COMMON[3]!] : COMMON;
  return planOn ? [...list.slice(0, 3), PLAN] : list;
}
