import type { ChConv, ChMsg, ChPerson, ChReaction, ChReactionKey } from '../screens/messages/model';
import type { Poll, PollResponseRow } from '@/lib/golf/message-polls';

/**
 * The cast of the approved Messages design page (design-refresh/messages/redesign/prototype.js `INIT`), for
 * `/clubhouse-preview/messages?state=design&view=<route>`: same people, conversations, messages, reactions, poll and files, on the
 * page's clock (Friday, 8:21 AM). Synthetic. The other preview states keep their own cast.
 */
const TZ_OFFSET = 4; // Eastern, October.
const at = (day: number, h: number, m: number) => new Date(Date.UTC(2026, 9, day, h + TZ_OFFSET, m)).toISOString();

export const DESIGN_NOW = at(16, 8, 21);

/** Grad years for the 2026-27 season: 2027 Senior, 2028 Junior, 2029 Sophomore, 2030 Freshman. */
const player = (id: string, name: string, subtitle: string, gradYear: number): ChPerson => ({ userId: id, name, role: 'player', subtitle, playerId: `p-${id}`, gradYear });

export const DESIGN_PEOPLE: ChPerson[] = [
  { userId: 'dana', name: 'Dana Reyes', role: 'coach', subtitle: 'Assistant Coach', playerId: null, gradYear: null },
  player('eli', 'Eli Brandt', 'Junior', 2028),
  player('maya', 'Maya Ortiz', 'Senior', 2027),
  player('sam', 'Sam Carter', 'Sophomore', 2029),
  player('jack', 'Jack Liu', 'Freshman', 2030),
  player('owen', 'Owen Park', 'Junior', 2028),
  player('luca', 'Luca Ferri', 'Senior', 2027),
  player('ben', 'Ben Hale', 'Sophomore', 2029),
  player('cole', 'Cole Mercer', 'Freshman', 2030),
  player('ryan', 'Ryan Shaw', 'Junior', 2028),
];
const TEAM = DESIGN_PEOPLE.map((p) => p.userId);
const QUALS = ['dana', 'maya', 'eli', 'owen', 'luca'];

const conv = (id: string, over: Partial<ChConv> & Pick<ChConv, 'title' | 'lastAt' | 'lastSenderId' | 'lastText'>): ChConv =>
  ({ id, group: false, subtitle: '', memberIds: [id], memberCount: 2, unread: 0, ...over }) as ChConv;

export const DESIGN_CONVS: ChConv[] = [
  conv('team', { group: true, title: 'Demo University Golf', memberIds: TEAM, memberCount: 11, unread: 1, lastAt: at(16, 7, 31), lastSenderId: 'jack', lastText: 'Asking the real questions' }),
  conv('eli', { title: 'Eli Brandt', subtitle: 'Junior', lastAt: at(16, 8, 14), lastSenderId: 'me', lastText: 'Send me the card when you get a sec' }),
  conv('dana', { title: 'Dana Reyes', subtitle: 'Assistant Coach', lastAt: at(15, 16, 52), lastSenderId: 'dana', lastText: 'I can drive the second van tomorrow' }),
  conv('quals', { group: true, title: 'Qualifier group', memberIds: QUALS, memberCount: 6, lastAt: at(15, 18, 11), lastSenderId: 'dana', lastText: 'You, Eli and Owen' }),
  conv('maya', { title: 'Maya Ortiz', subtitle: 'Senior', lastAt: at(14, 19, 20), lastSenderId: 'me', lastText: 'Proud of how you handled 16' }),
  conv('sam', { title: 'Sam Carter', subtitle: 'Sophomore', unread: 1, lastAt: at(13, 14, 5), lastSenderId: 'sam', lastText: 'Can I miss Thursday lift for a lab?' }),
  conv('owen', { title: 'Owen Park', subtitle: 'Junior', lastAt: at(12, 21, 12), lastSenderId: 'owen', lastText: 'Sent a file: Swing video' }),
];

export const designMsg = (id: string, senderId: string, when: string, text: string, extra: Partial<ChMsg> = {}): ChMsg => ({
  id,
  senderId,
  text,
  at: when,
  mine: senderId === 'me',
  seen: senderId === 'me',
  failed: null,
  edited: false,
  deleted: false,
  hasAttachments: false,
  ...extra,
});
const msg = designMsg;

export const DESIGN_POLL: Poll = {
  question: 'Practice round at Lonnie Poole: which day?',
  options: [
    { id: 'o1', label: 'Tue 7:30 AM' },
    { id: 'o2', label: 'Wed 3:15 PM' },
    { id: 'o3', label: 'Thu 7:30 AM' },
  ],
  multi: false,
  closesAt: null,
  closedAt: null,
};

export const DESIGN_VOTES: PollResponseRow[] = [
  ...['maya', 'eli', 'owen', 'luca'].map((user_id) => ({ message_id: 't2', user_id, choice: 'o1' })),
  ...['sam', 'ben'].map((user_id) => ({ message_id: 't2', user_id, choice: 'o2' })),
];

export const DESIGN_THREADS: Record<string, ChMsg[]> = {
  team: [
    msg('t1', 'me', at(15, 16, 12), 'Qualifier pairings for next week are up in Documents. Three rounds at Lonnie Poole, Monday to Wednesday.'),
    msg('t2', 'me', at(15, 16, 13), DESIGN_POLL.question, { poll: DESIGN_POLL }),
    msg('t3', 'maya', at(15, 16, 20), 'Any chance Tuesday can be a 7:45 tee time?'),
    msg('t4', 'maya', at(15, 16, 20), 'The range opens at 7, so we’d still get a full warm-up'),
    msg('t5', 'owen', at(15, 16, 31), 'Seconding 7:45'),
    msg('t6', 'me', at(16, 7, 5), 'Van leaves the field house at 6:40 tomorrow. Yardage books are in your lockers.'),
    msg('t7', 'sam', at(16, 7, 22), 'Will there be breakfast on the way?'),
    msg('t8', 'jack', at(16, 7, 31), 'Asking the real questions'),
  ],
  eli: [
    msg('e1', 'eli', at(15, 17, 48), 'Coach, could we move my lesson to Friday? My lab ran over.'),
    msg('e2', 'me', at(15, 17, 52), 'Friday at 3 works'),
    msg('e3', 'me', at(15, 17, 52), 'Bring the 52 and the 56. We’re doing wedge ladders'),
    msg('e4', 'eli', at(15, 17, 53), 'Perfect, thank you'),
    msg('e5', 'eli', at(16, 8, 9), 'Played the back nine at Lonnie Poole this morning'),
    msg('e6', 'eli', at(16, 8, 9), 'Hit 7 of 9 greens. The wedge ladders are paying off'),
    msg('e7', 'eli', at(16, 8, 10), '', { hasAttachments: true }),
    msg('e8', 'me', at(16, 8, 14), 'That’s the round we’ve been waiting on'),
    msg('e9', 'me', at(16, 8, 14), 'Send me the card when you get a sec'),
  ],
  quals: [
    msg('q1', 'dana', at(15, 18, 2), 'Pairings are posted for Monday'),
    msg('q2', 'maya', at(15, 18, 10), 'Who has the 8:10 group?'),
    msg('q3', 'dana', at(15, 18, 11), 'You, Eli and Owen'),
  ],
  dana: [
    msg('d1', 'me', at(15, 16, 40), 'Can you take one of the vans tomorrow?'),
    msg('d2', 'dana', at(15, 16, 52), 'I can drive the second van tomorrow'),
  ],
  maya: [
    msg('y1', 'maya', at(14, 19, 15), 'Sorry about the double on 16'),
    msg('y2', 'me', at(14, 19, 20), 'Proud of how you handled 16'),
  ],
  sam: [msg('s1', 'sam', at(13, 14, 5), 'Can I miss Thursday lift for a lab?')],
  owen: [msg('o1', 'owen', at(12, 21, 12), '', { hasAttachments: true })],
};

const rx = (key: ChReactionKey, count: number, mine = false): ChReaction => ({ key, count, mine });
export const DESIGN_REACTIONS: Record<string, ChReaction[]> = {
  t5: [rx('Like', 2)],
  t6: [rx('Like', 4)],
  t8: [rx('Laugh', 3)],
  e3: [rx('Like', 1)],
  e8: [rx('Love', 1)],
};

export const designAttachments = async (messageId: string) => {
  if (messageId === 'o1') return [{ id: 'da-o1', name: 'Swing video.mov', size: 42 * 1024 * 1024, mime: 'video/quicktime', url: null }];
  if (messageId === 'e7') return [{ id: 'da-e7', name: 'Back nine.jpg', size: 2 * 1024 * 1024, mime: 'image/jpeg', url: null }];
  return [];
};

/** Which conversation each page route opens; the rest stay on the inbox (spec section 12). Overlays open in the PRs that build them. */
export const DESIGN_ROUTE_CONV: Record<string, string> = {
  thread: 'eli',
  times: 'eli',
  typing: 'eli',
  failed: 'eli',
  long: 'eli',
  datepill: 'team',
  jump: 'team',
  toast: 'eli',
  attach: 'eli',
  file: 'owen',
  reply: 'eli',
  edit: 'eli',
  pollnew: 'team',
  team: 'team',
  grouptyping: 'team',
  hold: 'eli',
  holdseen: 'team',
  react: 'eli',
  seen: 'team',
  poll: 'team',
  votes: 'team',
  details: 'eli',
  groupdetails: 'team',
  mute: 'eli',
  fresh: 'sam',
};

/** Pins per route: the page's three, with Dana unpinned for `rowmenu` so Pin is live; none on the first run (spec section 12). */
export const designPins = (view?: string): string[] => (view === 'rowmenu' ? ['team', 'eli'] : view === 'empty' ? [] : ['team', 'eli', 'dana']);

/** `rowtyping`: Eli typing in his thread, Maya in the Qualifier group. */
export const designRowTyping = (view?: string): ReadonlyMap<string, string[]> => new Map(view === 'rowtyping' ? [['eli', ['eli']], ['quals', ['maya']]] : []);

/** Every state the design page draws (05-SCREENS, README), the routes `?view=` takes. */
export const DESIGN_ROUTES = [
  'inbox', 'unread', 'rowtyping', 'longinbox', 'loading', 'rowmenu', 'pinlimit', 'thread', 'team', 'typing', 'grouptyping', 'times', 'failed', 'long', 'datepill', 'jump', 'toast',
  'attach', 'file', 'reply', 'edit', 'pollnew', 'hold', 'holdseen', 'react', 'seen', 'poll', 'votes', 'details', 'groupdetails', 'mute', 'empty', 'new', 'fresh',
] as const;
