// Fidelity shots and clips for the CoachHelm Ask redesign (lane 4): the design page and the app, screen ID by screen ID.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). One headless Chromium, one page at a time, one dev server.
// No sign-in: the app side uses /clubhouse-preview/ fixture routes, the design side is the local file in ../redesign/.
// Nothing is written anywhere but --out (default: <package>/screenshots) and --clips (default: <package>/clips).
//
//   npm run dev -- -p 3100                                        (one terminal, only for app shots and app clips)
//   node <package>/capture/capture.mjs --id S-ASK.flow.f_annc.confirm --state default     (design and app, light and dark)
//   node <package>/capture/capture.mjs design --id 'S-ASK.flow.*' --state all            (design page only, every drawn state)
//   node <package>/capture/capture.mjs app --id all                                       (app only; before the fixture exists it shoots today's Ask)
//   node <package>/capture/capture.mjs compare                                            (built left, design right, into screenshots/compare)
//   node <package>/capture/capture.mjs --motion M-ASK-45                                  (design and app clips, with and without Reduce Motion)
//   node <package>/capture/capture.mjs --list                                             (the registry as JSON: IDs, anchors, selectors)
//   node <package>/capture/capture.mjs --dry --id all --state all                         (what would be shot, with counts; needs no browser)
//
// Options: --id <ID | prefix.* | all>   screen IDs from 05-SCREENS.md (default: all)
//          --state <state | all>         capture states from 05 (default: default)
//          --theme light|dark|both       (default: both)
//          --lean                        light only, state default only
//          --motion <M-ID | all>         clips for rows of 07-MOTION.md
//          --base http://localhost:3100/clubhouse-preview/
//          --out <dir>  --clips <dir>
//
// Files: screenshots/<ID>__<state>__{design,app}__{light,dark}.png, screenshots/compare/<ID>__<state>__compare__<theme>.png,
//        clips/<M-ID>__{design,app}__{motion,reduce}.webm plus a .json beside each with the ms where the move starts.
//
// How the design side works. The page has state links (applyHash in redesign/coachhelm-ask.html):
//   #<section>?play=<key>&stage=<stage>&device=phone|desk&viewer=coach|player&theme=light|dark&rm=1&ts=xxl
// play starts the scene at load; the main thread run then waits forever at <stage> if that stage is one of the page's
// holds (start, steps, reads, worked, brief, draft, confirm, adding, receipt, done), and <html data-stage> always names
// the last stage the run reached (also the markers brief-done, undone, cancelled, told). This script opens the link
// for the shot, pins the phone (or desktop) frame to the viewport at the app's own size (390 x 844, 430 x 932,
// 1440 x 900, 1280 x 800; no bezel), and steps a fake clock (Playwright page.clock) until the stage's DOM selector is
// true. A shot whose stage is a hold uses the hold, so it is frozen however long the clock runs; a stage that is not a
// hold (brief question 2, folded, skeleton, chart, artifact, save, publish, moments) is reached by stepping the clock
// and pressing what a coach would press. Then the clock holds, CSS and Web Animations settle for 900ms of real time,
// the thread scrolls to the piece and the shot is taken. Without page.clock (Playwright older than 1.45) it polls in
// real time instead. Stage selectors are the `wait` column of 05-SCREENS.md.
// XXL uses the link's ts=xxl, which sets the page's --k to 1.36 (the app's lib/dynamic-type.ts MAX_SCALE is 23/17, 1.353).
// The long state is a stress probe: the page draws no long names, so the script swaps in the longest real strings
// from 05 at the stage and shoots how the page's CSS handles them.
//
// How the app side works. The build adds (02-PLAN.md §3) /clubhouse-preview/coachhelm-ask-v2?id=<ID>&scene=<play>
// &stage=<stage>&viewer=coach|player[&answers=..][&state=<capture state>][&text=xxl], which renders that stage frozen
// and sets data-ch-ak-ready="1" on <html> when it has settled. answers is one entry per brief question, comma
// separated: an option index, several joined with +, or - for the default (so [1,null] is "1,-"). ?motion=<M-ID>
// renders the row's start and plays when the script fires the ch-ak-play event. Until that
// route exists, `app` shoots today's Ask (?state=… from src/clubhouse/preview/PreviewAsk.tsx) for the IDs that have a
// today equivalent, as the honest "before", and lists the rest.
// Exit 0 when every requested shot saved; 1 when any failed. A state the page doesn't draw is listed, not fatal.

import { existsSync, mkdirSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const MODES = ['design', 'app', 'both', 'compare', 'clips'];
const mode0 = MODES.includes(argv[0]) ? argv.shift() : null;
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const nx = argv[i + 1];
  args[a.slice(2)] = nx === undefined || nx.startsWith('--') ? true : (i++, nx);
}
const mode = args.motion ? 'clips' : mode0 ?? 'both';
const PAGE = pathToFileURL(resolve(HERE, '../redesign/coachhelm-ask.html')).href;
const ARTIFACT = 'https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA';
const BASE = (typeof args.base === 'string' ? args.base : process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');
const OUT = resolve(typeof args.out === 'string' ? args.out : join(HERE, '../screenshots'));
const CLIPS = resolve(typeof args.clips === 'string' ? args.clips : join(HERE, '../clips'));
const XXL = 1.353;

// ---------------------------------------------------------------------------------------------------------------
// Capture states (05-SCREENS.md, state matrix columns). Dark is not a state: every shot is written light and dark.
// ---------------------------------------------------------------------------------------------------------------
const STATES = {
  default: { w: 390, h: 844, note: 'Phone 390 x 844, default Text Size, motion on, settled' },
  loading: { w: 390, h: 844, data: true, note: 'Loading. Drawn only where 05 says; otherwise app only' },
  empty: { w: 390, h: 844, data: true, note: 'Nothing to show' },
  failed: { w: 390, h: 844, data: true, note: 'A read or a write failed' },
  long: { w: 390, h: 844, long: true, note: 'Longest real strings (stress probe on the design page)' },
  many: { w: 390, h: 844, data: true, note: '25 players, 40 rows, 8 reads' },
  one: { w: 390, h: 844, data: true, note: 'One player, one row, one read' },
  stale: { w: 390, h: 844, data: true, note: 'Offline or stale data' },
  xxl: { w: 390, h: 844, xxl: true, note: 'Text Size XXL: ts=xxl on the design page (--k 1.36), --ch-type-scale 1.353 in the app' },
  reduce: { w: 390, h: 844, reduce: true, note: 'Reduce Motion' },
  w430: { w: 430, h: 932, note: 'Large phone, 20px page edge' },
  desktop: { w: 1440, h: 900, desk: true, note: 'Desktop 1440 x 900' },
  'desktop-1280': { w: 1280, h: 800, desk: true, note: 'Desktop 1280 x 800' },
};
const DATA_STATES = Object.keys(STATES).filter((s) => STATES[s].data);

// ---------------------------------------------------------------------------------------------------------------
// Stage selectors. Each is a JS expression evaluated in the page with D = document, T = the scope element
// (#thread, or the board element for moment and piece IDs) and c = the confirm card the stage is about.
// ---------------------------------------------------------------------------------------------------------------
const qcur = (i) => `(()=>{const q=[...D.querySelectorAll('#thread .qcard')].pop();return !!q&&!q.querySelector('.qsum')&&!!q.querySelectorAll('.qdots i')[${i}]?.classList.contains('cur')})()`;
const phase = (i) => `!!T.querySelectorAll('.stagebar span')[${i}]?.classList.contains('on')`;
const STAGES = {
  home: `!!D.querySelector('#thread .home')`,
  typing: `!!D.querySelector('#inp.typing')&&!D.querySelector('#thread .msg-a')`,
  steps: `!!D.querySelector('#thread .step .dot')`,
  reads: `!!D.querySelector('#thread .step .dot')`,
  'steps-2': `D.querySelectorAll('#thread .work').length>=2&&!!D.querySelectorAll('#thread .work')[1].querySelector('.dot')`,
  skeleton: `!!D.querySelector('#thread .vcard .sk')`,
  chart: `!!D.querySelector('#thread .vcard:not(.pre) .vb svg')`,
  'chart-2': `D.querySelectorAll('#thread .vcard:not(.pre) .vb svg').length>=2`,
  worked: `!!D.querySelector('#thread .inf')&&!D.querySelector('#thread .qcard')`,
  brief: qcur(0), 'brief-2': qcur(1), 'brief-3': qcur(2), 'brief-4': qcur(3),
  'brief-free': `(()=>{const q=[...D.querySelectorAll('#thread .qcard')].pop();return !!q&&!q.querySelector('.qsum')&&!!q.querySelector('[data-free][data-val]')})()`,
  folded: `!!D.querySelector('#thread .qcard .qsum')`,
  tie: `!!c&&!!c.querySelector('.ls.tie')`,
  writing: `!!D.querySelector('#thread .acard .tile.busy')`,
  artifact: `D.querySelectorAll('#apanel .blk.in').length===5&&!!(D.querySelector('#pasheet.open')||D.querySelector('#dbody.panel'))`,
  save: `!!D.querySelector('#apanel .savecard .srow[aria-expanded="false"]')&&!D.querySelector('#apanel .savecard .dchip')`,
  'save-list': `!!D.querySelector('#apanel .savecard .srow[aria-expanded="true"]')&&!D.querySelector('#apanel .savecard .nfield')`,
  'new-folder': `!!D.querySelector('#apanel .savecard .nfield .cr:not([disabled])')`,
  'save-cancelled': `!D.querySelector('#apanel .savecard')&&!!D.querySelector('#apanel .af:not(.hid)')`,
  publish: `!!D.querySelector('.fpick.open .conf .btns .p')`,
  'publish-cancelled': `!D.querySelector('.fpick')`,
  popover: `!!D.querySelector('#pop.on')`,
  sources: `!!D.querySelector('#thread .srclist.open')`,
  'ask-about': `!!D.querySelector('#inp.typing')&&!!D.querySelector('#thread .vcard')`,
  // flows: the page's draft hold (built, before the fields fill); the plan's calendar card: mid-fill
  draft: `D.documentElement.dataset.flow==='plan'?(!!c&&!!c.querySelector('.f.wh')):(D.documentElement.dataset.stage==='draft'&&!!c&&!!c.querySelector('.evd, .ls, .hd'))`,
  confirm: `!!c&&!!c.querySelector('.dchip')&&!c.querySelector('.skl')&&!!c.querySelector('.btns .p:not(.cap):not(:disabled)')`,
  commit: `!!c&&!!c.querySelector('.btns .p.cap')`,
  receipt: `!!c&&!!c.querySelector('.receipt.in:not(.undone)')&&!c.querySelector('.told')&&!c.querySelector('.receipt .undo.gone')`,
  told: `(()=>{const t=c&&c.querySelector('.told');if(!t)return false;const cs=t.querySelectorAll('.coin');return !cs.length||t.querySelectorAll('.coin.lit').length===cs.length})()`,
  undone: `!!c&&!!c.querySelector('.receipt.undone')`,
  cancelled: `!!c&&!!c.querySelector('.cxl')`,
  // f_lineup only: the separate Lock card that rises after Told (a sibling of the confirm card)
  lock: `D.documentElement.dataset.stage==='lock'&&!!c&&!!c.nextElementSibling?.matches('.lockask')&&!!c.nextElementSibling.querySelector('.btns .p:not(.cap)')`,
  locked: `D.documentElement.dataset.stage==='locked'&&!!c&&!!c.nextElementSibling?.querySelector('.receipt.in')&&c.querySelectorAll('.ls.locked').length===5`,
  'not-locked': `!!c&&!!c.nextElementSibling?.matches('.lockask')&&!!c.nextElementSibling.querySelector('.cxl')`,
  answer: `D.querySelectorAll('#thread > .chips').length>0&&!D.querySelector('#thread .mark.busy')`,
  out: `!!D.querySelector('#thread .outcard .ask')`,
  // moments (T = .mo card): the page's own stage bar
  'mo-draft': phase(0), 'mo-confirm': `${phase(1)}&&!!c&&!!c.querySelector('.dchip')&&!c.querySelector('.skl')&&!!c.querySelector('.btns .p:not(.cap)')`,
  'mo-receipt': `${phase(3)}&&!!c&&!!c.querySelector('.receipt.in')`, 'mo-told': `${phase(4)}&&!!c&&!!c.querySelector('.told')`,
  static: 'true',
};
// Extra fake ms after a stage is true, so the shot shows its settled copy (Told's "Seen by" line lands 1.4s later).
const AFTER = { lock: 400, locked: 400, 'not-locked': 300, told: 1700, 'mo-told': 1700, receipt: 300, undone: 400, cancelled: 300, folded: 500, artifact: 400, worked: 450, chart: 500, 'chart-2': 500, answer: 300, out: 500, saved: 300, publish: 500 };
// Where the thread is scrolled before the shot: [selector inside c or thread, align].
const FOCUS = {
  reads: ['.work', 'top'], steps: ['.work', 'top'], 'steps-2': ['.work:last-of-type', 'top'], worked: ['.inf', 'center'],
  brief: ['.qcard', 'bottom'], 'brief-2': ['.qcard', 'bottom'], 'brief-3': ['.qcard', 'bottom'], 'brief-4': ['.qcard', 'bottom'], 'brief-free': ['.qcard', 'bottom'],
  folded: ['.qcard', 'center'], draft: ['@c', 'top'], tie: ['@c', 'top'], confirm: ['@c', 'bottom'], commit: ['@c', 'bottom'],
  receipt: ['@c .receipt', 'center'], told: ['@c .told', 'center'], lock: ['.lockask', 'center'], locked: ['.lockask', 'center'], 'not-locked': ['.lockask', 'center'], undone: ['@c .receipt', 'center'], cancelled: ['@c', 'bottom'],
  skeleton: ['.vcard', 'center'], chart: ['.vcard', 'top'], 'chart-2': ['.vcard:last-of-type', 'top'], writing: ['.acard', 'center'],
};

// ---------------------------------------------------------------------------------------------------------------
// The registry: every screen ID in 05-SCREENS.md. Built from a few tables so the IDs stay stable.
// ---------------------------------------------------------------------------------------------------------------
// Fields: id, family, kind, how, roles, sec (page section id), play (data-play / FL / moment key), stage,
// dev (phone | desk | board), view (coach | player), ops (steps from a fresh page), conf (expression for c),
// el (board element selector), focus, nd (not drawn on the design page: rule only), app ({scene, stage, today}),
// piece (the piece name 02-PLAN maps to a PR).
const REG = [];
const add = (o) => { REG.push({ dev: 'phone', view: 'coach', roles: 'coach', conf: '__akC()', ...o }); };
const chain = (play, stages) => [['play', play], ...stages.map((s) => ['wait', s])];
// The page's state links. HOLDS are awaited (the run waits there forever); MARKS only set <html data-stage>.
const HOLDS = ['start', 'steps', 'reads', 'worked', 'brief', 'draft', 'confirm', 'adding', 'receipt', 'done'];
const MARKS = ['brief-done', 'undone', 'cancelled', 'told', 'lock', 'locked'];
// This script's stage name -> the page's stage name for the same moment. (This script's flow "reads" is the page's
// "steps": the first read row running. The page's "reads" is the steps folded, which no screen ID shoots on its own.)
const TO_PAGE = { steps: 'steps', reads: 'steps', worked: 'worked', brief: 'brief', folded: 'brief-done', draft: 'draft', confirm: 'confirm', commit: 'adding', receipt: 'receipt', undone: 'undone', cancelled: 'cancelled', told: 'told', lock: 'lock', locked: 'locked', 'not-locked': 'lock', answer: 'done' };
// Which holds a scene really reaches. stageAt() ignores nodes outside #convo (the artifact pane and the save card),
// the plan's calendar card is not built by runFlow (no draft or confirm hold), and only runFlow has worked.
const HOLDABLE = (play) => (/^f_/.test(play) ? HOLDS : play === 'plan' || play === 'limit' ? ['steps', 'brief', 'adding', 'receipt', 'done'] : ['steps', 'done']);
// The hold a shot can use: the last wait that maps to a reachable hold, kept only when nothing after it needs the run
// to move on. After receipt only Undo may follow; after done anything may (popovers, sources, publish).
function holdFor(r) {
  if (!r.play || !PLAY_KEYS.includes(r.play) || !r.ops.length || r.ops[0][0] !== 'play') return null;
  const ok = HOLDABLE(r.play);
  let at = -1;
  r.ops.forEach(([op, a], i) => { if (op === 'wait' && ok.includes(TO_PAGE[a])) at = i; });
  if (at < 0) return null;
  const h = TO_PAGE[r.ops[at][1]], tail = r.ops.slice(at + 1);
  if (h === 'done') return h;
  if (h === 'receipt') return tail.every(([op, a]) => op === 'focus' || op === 'advance' || (op === 'wait' && a === 'undone') || (op === 'click' && /\.undo/.test(a))) ? h : null;
  return tail.every(([op]) => op === 'focus') ? h : null;
}
const PLAY_RE = /^(putts|jonah|plan|trend|player|recap|limit|f_[a-z]+)$/;
const link = (r, o = {}) => {
  const hold = o.hold === undefined ? holdFor(r) : o.hold;
  const q = [];
  if (r.play && PLAY_RE.test(r.play) && r.ops[0]?.[0] === 'play') q.push(`play=${r.play}`);
  const mark = hold ? null : ['lock', 'locked'].includes(TO_PAGE[r.stage]) ? TO_PAGE[r.stage] : null; // markers: no hold, the run plays on
  if ((hold || mark) && q.length) q.push(`stage=${hold || mark}`);
  const dev = o.dev ?? (r.dev === 'desk' ? 'desk' : null);
  if (dev === 'desk') q.push('device=desk');
  if (r.view === 'player') q.push('viewer=player');
  if (o.theme) q.push(`theme=${o.theme}`);
  if (o.rm) q.push('rm=1');
  if (o.xxl) q.push('ts=xxl');
  return `#${r.sec}${q.length ? '?' + q.join('&') : ''}`;
};
const anchor = (r) => `${ARTIFACT}${link(r)}`;
const PLAY_KEYS = ['putts', 'jonah', 'plan', 'trend', 'player', 'recap', 'limit', 'f_event', 'f_annc', 'f_travel', 'f_board', 'f_poll', 'f_qual', 'f_lineup', 'f_task', 'f_goal', 'f_note', 'f_drill'];

// Today's preview states (src/clubhouse/preview/fixtures-ask-thread.ts ASK_THREAD_STATES), used as "before".
const TODAY = { home: '', steps: 'working', reads: 'working', skeleton: 'composelive', chart: 'visual', 'chart-2': 'visual', answer: 'answer', sources: 'reads', popover: 'reads', draft: 'staging', confirm: 'action', commit: 'confirmed', receipt: 'receipt', told: 'receipt', cancelled: 'cancelled' };

// 1. Shell, composer, history, tone, knows
add({ id: 'S-ASK', family: 'shell', kind: 'screen', how: 'CoachHelm section switcher, then the Ask segment (phone); CoachHelm in the sidebar, then Ask (desktop)', roles: 'both: player sees "Morning, Jonah", Your focus and the Ask this week meter instead of the team pulse', sec: 'h-live', play: 'home', stage: 'home', ops: [['wait', 'home']], piece: 'Answer card and shell' });
add({ id: 'S-ASK.player', family: 'shell', kind: 'screen', how: 'Player signed in, CoachHelm, Ask (own switch)', roles: 'player only', sec: 'h-live', play: 'home', stage: 'home', view: 'player', ops: [['wait', 'home']], piece: 'Player view' });
add({ id: 'S-ASK.scope', family: 'shell', kind: 'inline state', how: 'Always above the thread on phone; changes when a question is sent', sec: 'h-live', play: 'putts', stage: 'steps', ops: chain('putts', ['steps']), focus: ['.msg-u', 'top'], piece: 'Composer' });
add({ id: 'S-ASK.composer', family: 'shell', kind: 'inline state', how: 'Bottom of the Ask tab, idle', sec: 'h-live', play: 'home', stage: 'home', ops: [['wait', 'home']], piece: 'Composer' });
add({ id: 'S-ASK.composer.typing', family: 'shell', kind: 'inline state', how: 'Tap the composer and type', sec: 'h-live', play: 'putts', stage: 'typing', ops: chain('putts', ['typing']), piece: 'Composer' });
add({ id: 'S-ASK.composer.busy', family: 'shell', kind: 'inline state', how: 'Send; the send button becomes Stop while steps run', sec: 'h-live', play: 'putts', stage: 'steps', ops: chain('putts', ['steps']), piece: 'Composer' });
add({ id: 'S-ASK.composer.paused', family: 'shell', kind: 'inline state', how: 'Player Ask when the weekly allowance is out', roles: 'player only', view: 'player', sec: 'h-live', play: 'limit', stage: 'out', ops: chain('limit', ['out']), piece: 'Player allowance' });
add({ id: 'S-ASK.composer.at-menu', family: 'shell', kind: 'menu', how: 'Type @ in the composer', sec: 'h-pieces', play: 'mentions', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(3)', ops: [], piece: 'Composer' });
add({ id: 'S-ASK.composer.slash-menu', family: 'shell', kind: 'menu', how: 'Type / in the composer', sec: 'h-pieces', play: 'mentions', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(3)', ops: [], piece: 'Composer' });
add({ id: 'S-ASK.composer.add-menu', family: 'shell', kind: 'menu', how: 'Tap + in the composer', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], piece: 'Composer' });
add({ id: 'S-ASK.history', family: 'shell', kind: 'screen', how: 'Desktop: always in the left rail of Ask', dev: 'desk', sec: 'h-live', play: 'home', stage: 'home', ops: [['wait', 'home']], piece: 'History and knows' });
add({ id: 'S-ASK.history.sheet', family: 'shell', kind: 'sheet (74%)', how: 'Phone: tap the chat title or history button (today\'s drawer)', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], piece: 'History and knows' });
add({ id: 'S-ASK.knows', family: 'shell', kind: 'inline state', how: 'Desktop: bottom of the history rail', dev: 'desk', sec: 'h-live', play: 'home', stage: 'home', ops: [['wait', 'home']], piece: 'History and knows' });
add({ id: 'S-ASK.knows.edit', family: 'shell', kind: 'sheet (90%)', how: 'Tap "Edit what it knows"', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], piece: 'History and knows' });
add({ id: 'S-ASK.settings.sheet', family: 'shell', kind: 'sheet (62%)', how: 'Phone: chat settings (tone and what it knows)', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], piece: 'Tone' });
add({ id: 'S-ASK.tone', family: 'shell', kind: 'inline state', how: 'History rail (desktop) or settings sheet (phone), Straight picked', sec: 'h-pieces', play: 'tone', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(1)', ops: [], piece: 'Tone' });
add({ id: 'S-ASK.tone.detailed', family: 'shell', kind: 'inline state', how: 'Tap Detailed', sec: 'h-pieces', play: 'tone', stage: 'detailed', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(1)', ops: [['click', `D.querySelector('#segTone [data-v="detail"]')`], ['advance', 400]], piece: 'Tone' });
add({ id: 'S-ASK.tone.team-talk', family: 'shell', kind: 'inline state', how: 'Tap Team talk', sec: 'h-pieces', play: 'tone', stage: 'team-talk', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(1)', ops: [['click', `D.querySelector('#segTone [data-v="team"]')`], ['advance', 400]], piece: 'Tone' });
add({ id: 'S-ASK.loading', family: 'shell', kind: 'inline state', how: 'Open Ask while the team loads', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], app: { today: 'loading' }, piece: 'Answer card and shell' });
add({ id: 'S-ASK.error', family: 'shell', kind: 'inline state', how: 'The stream fails or the team can\'t load', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], app: { today: 'error' }, piece: 'Answer card and shell' });
add({ id: 'S-ASK.flag-off', family: 'shell', kind: 'screen', how: 'coachhelm_ask_v2 off: today\'s Ask', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], app: { today: '' }, piece: 'Answer card and shell' });

// 2. A turn: bubble, card, steps, tool cards, chips, sources, follow-ups (coach scenes)
const P = (s) => chain('putts', s);
add({ id: 'S-ASK.turn.user', family: 'turn', kind: 'inline state', how: 'Send a question', sec: 'h-live', play: 'putts', stage: 'steps', ops: P(['steps']), focus: ['.msg-u', 'top'], piece: 'Answer card and shell' });
add({ id: 'S-ASK.turn.answer', family: 'turn', kind: 'inline state', how: 'The answer lands', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), focus: ['.msg-a', 'top'], piece: 'Answer card and shell' });
add({ id: 'S-ASK.steps', family: 'turn', kind: 'inline state', how: 'Steps run inside the answer card while CoachHelm reads', sec: 'h-live', play: 'putts', stage: 'steps', ops: P(['steps', ['advance', 2200]].flat().slice(0, 1)).concat([['advance', 2300]]), focus: ['.work', 'top'], piece: 'Steps' });
add({ id: 'S-ASK.steps.folded', family: 'turn', kind: 'inline state', how: 'The answer lands; steps fold to "4 steps · 4s"', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), focus: ['.work', 'top'], piece: 'Steps' });
add({ id: 'S-ASK.steps.open', family: 'turn', kind: 'inline state', how: 'Tap the folded steps line', sec: 'h-live', play: 'putts', stage: 'steps-open', ops: P(['steps', 'skeleton', 'chart', 'answer']).concat([['click', `D.querySelector('#thread .work .sum')`], ['advance', 500]]), focus: ['.work', 'top'], piece: 'Steps' });
add({ id: 'S-ASK.steps.waiting', family: 'turn', kind: 'inline state', how: 'A turn stops at Confirm', sec: 'h-pieces', play: 'steps', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(2)', ops: [], piece: 'Steps' });
add({ id: 'S-ASK.steps.failed', family: 'turn', kind: 'inline state', how: 'A read fails', sec: 'h-pieces', play: 'steps', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(2)', ops: [], app: { today: 'readfail' }, piece: 'Steps' });
add({ id: 'S-ASK.steps.next', family: 'turn', kind: 'inline state', how: 'A step announced but not started', sec: 'h-pieces', play: 'steps', stage: 'static', dev: 'board', el: '#h-pieces ~ .grid2 > .card:nth-child(2)', ops: [], piece: 'Steps' });
add({ id: 'S-ASK.steps.stopped', family: 'turn', kind: 'inline state', how: 'Tap Stop while steps run', sec: 'h-live', play: 'putts', stage: 'steps', nd: true, ops: P(['steps']), piece: 'Steps' });
add({ id: 'S-ASK.toolcard.skeleton', family: 'turn', kind: 'inline state', how: 'A read with a visual is in flight', sec: 'h-live', play: 'putts', stage: 'skeleton', ops: P(['steps', 'skeleton']), piece: 'Tool card' });
add({ id: 'S-ASK.toolcard.putt-profile', family: 'turn', kind: 'inline state', how: 'The putts read lands', sec: 'h-live', play: 'putts', stage: 'chart', ops: P(['steps', 'skeleton', 'chart']), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.sg', family: 'turn', kind: 'inline state', how: 'Strokes gained read lands', sec: 'h-live', play: 'jonah', stage: 'chart', ops: chain('jonah', ['steps', 'chart']), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.miss-pattern', family: 'turn', kind: 'inline state', how: 'Shot read lands', sec: 'h-live', play: 'jonah', stage: 'chart-2', ops: chain('jonah', ['steps', 'chart', 'chart-2']), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.season', family: 'turn', kind: 'inline state', how: 'Season compare read lands', sec: 'h-live', play: 'trend', stage: 'chart', ops: chain('trend', ['steps', 'chart']), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.hole-strip', family: 'turn', kind: 'inline state', how: 'Player asks about a round', roles: 'both (drawn for the player)', view: 'player', sec: 'h-live', play: 'recap', stage: 'chart', ops: chain('recap', ['steps', 'chart']), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.ask-about', family: 'turn', kind: 'inline state', how: 'Tap a bar or dot on a chart', sec: 'h-live', play: 'putts', stage: 'ask-about', ops: P(['steps', 'skeleton', 'chart']).concat([['click', `D.querySelector('#thread .vcard .bar-hit')`], ['wait', 'ask-about']]), piece: 'Visual kit' });
add({ id: 'S-ASK.toolcard.expanded', family: 'turn', kind: 'sheet (full)', how: 'Tap the expand button on a tool card', sec: 'h-live', play: 'putts', stage: 'chart', nd: true, ops: P(['steps', 'skeleton', 'chart']), piece: 'Tool card' });
add({ id: 'S-ASK.readchip', family: 'turn', kind: 'inline state', how: 'After a sentence with a figure', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), focus: ['.prose .cite', 'center'], piece: 'Read chips' });
add({ id: 'S-ASK.readchip.popover', family: 'turn', kind: 'popover', how: 'Tap a read chip', sec: 'h-live', play: 'putts', stage: 'popover', ops: P(['steps', 'skeleton', 'chart', 'answer']).concat([['focus', '.prose .cite', 'center'], ['click', `D.querySelector('#thread .prose .cite')`], ['wait', 'popover']]), app: { today: 'reads' }, piece: 'Read chips' });
add({ id: 'S-ASK.sources', family: 'turn', kind: 'inline state', how: 'Under every answer', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), focus: ['.srcs', 'center'], piece: 'Read chips' });
add({ id: 'S-ASK.sources.open', family: 'turn', kind: 'inline state', how: 'Tap "4 reads"', sec: 'h-live', play: 'putts', stage: 'sources', ops: P(['steps', 'skeleton', 'chart', 'answer']).concat([['click', `D.querySelector('#thread .srcs')`], ['wait', 'sources'], ['advance', 400]]), focus: ['.srclist', 'center'], piece: 'Read chips' });
add({ id: 'S-ASK.followups', family: 'turn', kind: 'inline state', how: 'Under the answer card', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), piece: 'Follow-ups' });
add({ id: 'S-ASK.hypothesis', family: 'turn', kind: 'inline state', how: 'An answer that suggests something to test', sec: 'h-live', play: 'jonah', stage: 'answer', ops: chain('jonah', ['steps', 'chart', 'chart-2', 'answer']), focus: ['.tag.hyp', 'center'], piece: 'Answer card and shell' });
add({ id: 'S-ASK.answer.putts', family: 'turn', kind: 'screen', how: 'Ask "Why are we missing so many short putts lately?"', sec: 'h-live', play: 'putts', stage: 'answer', ops: P(['steps', 'skeleton', 'chart', 'answer']), app: { today: 'answer' }, piece: 'Answer card and shell' });
add({ id: 'S-ASK.answer.jonah', family: 'turn', kind: 'screen', how: 'Ask "Where is Jonah losing strokes?"', sec: 'h-live', play: 'jonah', stage: 'answer', ops: chain('jonah', ['steps', 'chart', 'chart-2', 'answer']), piece: 'Answer card and shell' });
add({ id: 'S-ASK.answer.trend', family: 'turn', kind: 'screen', how: 'Ask "How are we scoring this fall compared to last fall?"', sec: 'h-live', play: 'trend', stage: 'answer', ops: chain('trend', ['steps', 'chart', 'answer']), piece: 'Answer card and shell' });

// 3. Practice plan: brief, artifact, save, publish, then the calendar write (the plan scene)
const PL = ['reads', 'brief', 'brief-2', 'brief-3', 'brief-4', 'brief-free', 'folded', 'steps-2', 'writing', 'artifact', 'save', 'save-list', 'new-folder'];
const pc = (upto) => chain('plan', PL.slice(0, PL.indexOf(upto) + 1));
const SAVE = `D.querySelector('#apanel .savecard')`, PUB = `D.querySelector('.fpick .conf')`;
add({ id: 'S-ASK.flow.plan.reads', family: 'plan', kind: 'inline state', how: 'Ask "Build Tuesday\'s practice" (or /plan)', sec: 'h-live', play: 'plan', stage: 'reads', ops: pc('reads'), piece: 'Practice brief' });
for (const [i, st] of ['brief', 'brief-2', 'brief-3', 'brief-4'].entries())
  add({ id: `S-ASK.brief.q${i + 1}`, family: 'plan', kind: 'inline state', how: i ? `Next on question ${i}` : 'After the first read step', sec: 'h-live', play: 'plan', stage: st, ops: pc(st), piece: 'Practice brief' });
add({ id: 'S-ASK.brief.free', family: 'plan', kind: 'inline state', how: 'Tap "Anything else?" and type', sec: 'h-live', play: 'plan', stage: 'brief-free', ops: pc('brief-free'), piece: 'Practice brief' });
add({ id: 'S-ASK.brief.folded', family: 'plan', kind: 'inline state', how: 'Build the plan on the last question', sec: 'h-live', play: 'plan', stage: 'folded', ops: pc('folded'), piece: 'Practice brief' });
add({ id: 'S-ASK.brief.skip', family: 'plan', kind: 'inline state', how: 'Tap "Skip, just build" on any question', sec: 'h-live', play: 'plan', stage: 'folded', ops: chain('plan', ['brief']).concat([['click', `[...D.querySelectorAll('#thread .qcard .qft .sk')].pop()`], ['wait', 'folded']]), piece: 'Practice brief' });
add({ id: 'S-ASK.brief.change', family: 'plan', kind: 'inline state', how: 'Tap "Change answers" on the folded brief', sec: 'h-live', play: 'plan', stage: 'folded', nd: true, ops: pc('folded'), piece: 'Practice brief' });
add({ id: 'S-ASK.flow.plan.drafting', family: 'plan', kind: 'inline state', how: 'The brief folds; drafting steps run', sec: 'h-live', play: 'plan', stage: 'steps-2', ops: pc('steps-2'), piece: 'Steps' });
add({ id: 'S-ASK.artifact.card', family: 'plan', kind: 'inline state', how: 'The plan starts writing', sec: 'h-live', play: 'plan', stage: 'writing', ops: pc('writing'), piece: 'Artifact' });
add({ id: 'S-ASK.artifact.card.saved', family: 'plan', kind: 'inline state', how: 'After Save, back in the thread', sec: 'h-live', play: 'plan', stage: 'answer', ops: pc('new-folder').concat([['wait', 'answer']]), focus: ['.acard', 'center'], piece: 'Artifact' });
add({ id: 'S-ASK.artifact.push', family: 'plan', kind: 'push', how: 'Phone: the plan opens as its own screen (or tap Open on the card)', sec: 'h-live', play: 'plan', stage: 'artifact', ops: pc('artifact'), piece: 'Artifact' });
add({ id: 'S-ASK.artifact.pane', family: 'plan', kind: 'screen', how: 'Desktop: the right pane widens to 452 beside the chat', dev: 'desk', sec: 'h-live', play: 'plan', stage: 'artifact', ops: pc('artifact'), piece: 'Artifact' });
add({ id: 'S-ASK.artifact.versions', family: 'plan', kind: 'inline state', how: 'Header arrows, "1 of 3" when a plan was revised', sec: 'h-live', play: 'plan', stage: 'artifact', ops: pc('artifact'), piece: 'Artifact' });
add({ id: 'S-ASK.artifact.why-popover', family: 'plan', kind: 'popover', how: 'Tap a Why chip in a plan block', sec: 'h-live', play: 'plan', stage: 'popover', ops: pc('artifact').concat([['click', `D.querySelector('#apanel .ab .cite')`], ['wait', 'popover']]), piece: 'Artifact' });
add({ id: 'S-ASK.artifact.edit', family: 'plan', kind: 'toast', how: 'Desktop: tap "Edit in builder"', dev: 'desk', sec: 'h-live', play: 'plan', stage: 'edit', ops: pc('artifact').concat([['click', `D.querySelector('#apanel .af .e')`], ['advance', 200]]), piece: 'Artifact' });
add({ id: 'S-ASK.save', family: 'plan', kind: 'sheet (docked card)', how: 'Tap "Save draft…" in the artifact footer or dock', sec: 'h-live', play: 'plan', stage: 'save', ops: pc('save'), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.folder-list', family: 'plan', kind: 'menu (in place)', how: 'Tap "Save to [Practice plans ⌄]"', sec: 'h-live', play: 'plan', stage: 'save-list', ops: pc('save-list'), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.new-folder', family: 'plan', kind: 'inline state', how: 'Tap New folder in the list and type', sec: 'h-live', play: 'plan', stage: 'new-folder', ops: pc('new-folder'), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.confirm', family: 'plan', kind: 'inline state', how: 'New folder created, list closed, "Save to November" ready', sec: 'h-live', play: 'plan', stage: 'confirm', ops: pc('new-folder').concat([['wait', 'confirm']]), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.commit', family: 'plan', kind: 'inline state', how: 'Tap "Save to November"', sec: 'h-live', play: 'plan', stage: 'commit', ops: pc('new-folder').concat([['wait', 'confirm'], ['wait', 'commit']]), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.receipt', family: 'plan', kind: 'inline state', how: 'The plan lands in the folder', sec: 'h-live', play: 'plan', stage: 'receipt', ops: pc('new-folder').concat([['wait', 'confirm'], ['wait', 'receipt']]), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.told', family: 'plan', kind: 'inline state', how: 'Undo window closes', dev: 'desk', sec: 'h-live', play: 'plan', stage: 'told', ops: pc('new-folder').concat([['wait', 'confirm'], ['wait', 'receipt'], ['wait', 'told']]), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.undone', family: 'plan', kind: 'inline state', how: 'Tap Undo within 8s', sec: 'h-live', play: 'plan', stage: 'undone', ops: pc('new-folder').concat([['wait', 'confirm'], ['wait', 'receipt'], ['click', `${SAVE}.querySelector('.receipt .undo')`], ['wait', 'undone']]), conf: SAVE, piece: 'Save to a folder' });
add({ id: 'S-ASK.save.cancelled', family: 'plan', kind: 'inline state', how: 'Tap Cancel on the save card', sec: 'h-live', play: 'plan', stage: 'save-cancelled', ops: pc('new-folder').concat([['wait', 'confirm'], ['click', `${SAVE}.querySelector('.btns .c')`], ['advance', 700], ['wait', 'save-cancelled']]), piece: 'Save to a folder' });
const pubOps = pc('new-folder').concat([['wait', 'answer'], ['click', `D.querySelector('#thread .acard')`], ['advance', 700], ['click', `D.querySelector('#apanel .af .p')`], ['wait', 'publish']]);
add({ id: 'S-ASK.publish', family: 'plan', kind: 'sheet (90%)', how: 'Tap "Publish…" in the artifact footer or dock', sec: 'h-live', play: 'plan', stage: 'publish', ops: pubOps, conf: PUB, piece: 'Artifact' });
add({ id: 'S-ASK.publish.commit', family: 'plan', kind: 'inline state', how: 'Tap "Publish to 7 players"', sec: 'h-live', play: 'plan', stage: 'commit', ops: pubOps.concat([['click', `${PUB}.querySelector('.btns .p')`], ['wait', 'commit']]), conf: PUB, piece: 'Artifact' });
add({ id: 'S-ASK.publish.receipt', family: 'plan', kind: 'inline state', how: 'The plan fans out to 7 players and Practice plans', sec: 'h-live', play: 'plan', stage: 'receipt', ops: pubOps.concat([['click', `${PUB}.querySelector('.btns .p')`], ['wait', 'commit'], ['wait', 'receipt']]), conf: PUB, piece: 'Artifact' });
add({ id: 'S-ASK.publish.told', family: 'plan', kind: 'inline state', how: 'Undo window closes', sec: 'h-moments', play: 'pub', stage: 'told', dev: 'board', el: '.mo[data-mo="pub"]', conf: `T.querySelector('.conf')`, ops: [['mo', 'pub'], ['wait', 'mo-told']], piece: 'Artifact' });
add({ id: 'S-ASK.publish.undone', family: 'plan', kind: 'inline state', how: 'Tap Undo within 8s', sec: 'h-live', play: 'plan', stage: 'undone', ops: pubOps.concat([['click', `${PUB}.querySelector('.btns .p')`], ['wait', 'commit'], ['wait', 'receipt'], ['click', `${PUB}.querySelector('.receipt .undo')`], ['wait', 'undone']]), conf: PUB, piece: 'Artifact' });
add({ id: 'S-ASK.publish.cancelled', family: 'plan', kind: 'inline state', how: 'Tap Cancel on the publish sheet', sec: 'h-live', play: 'plan', stage: 'publish-cancelled', ops: pubOps.concat([['click', `${PUB}.querySelector('.btns .c')`], ['advance', 500], ['wait', 'publish-cancelled']]), piece: 'Artifact' });
const PE = pc('new-folder');
for (const st of ['draft', 'confirm', 'commit', 'receipt'])
  add({ id: `S-ASK.flow.plan.${st}`, family: 'plan', kind: 'inline state', how: { draft: 'After Save, "Want it on the calendar?"', confirm: 'Every field filled', commit: 'Tap "Add to calendar"', receipt: 'The event lands on Tuesday' }[st], sec: 'h-live', play: 'plan', stage: st, ops: PE.concat(['draft', 'confirm', 'commit', 'receipt'].slice(0, ['draft', 'confirm', 'commit', 'receipt'].indexOf(st) + 1).map((s) => ['wait', s])), app: { today: TODAY[st] }, piece: 'Confirm, commit, receipt' });
add({ id: 'S-ASK.flow.plan.told', family: 'plan', kind: 'inline state', how: 'Undo window closes; invites go out', sec: 'h-live', play: 'plan', stage: 'told', ops: PE.concat([['wait', 'draft'], ['wait', 'confirm'], ['wait', 'commit'], ['wait', 'receipt'], ['wait', 'told']]), piece: 'Confirm, commit, receipt' });
add({ id: 'S-ASK.flow.plan.undone', family: 'plan', kind: 'inline state', how: 'Tap Undo within 8s', sec: 'h-live', play: 'plan', stage: 'undone', ops: PE.concat([['wait', 'confirm'], ['wait', 'receipt'], ['click', `__akC().querySelector('.receipt .undo')`], ['wait', 'undone']]), piece: 'Confirm, commit, receipt' });
add({ id: 'S-ASK.flow.plan.cancelled', family: 'plan', kind: 'inline state', how: 'Tap Cancel on the event draft', sec: 'h-live', play: 'plan', stage: 'cancelled', ops: PE.concat([['wait', 'confirm'], ['click', `__akC().querySelector('.btns .c')`], ['wait', 'cancelled']]), app: { today: 'cancelled' }, piece: 'Confirm, commit, receipt' });

// 4. Task moments (design-board demos of the kit; the stage bar is design page only)
for (const k of ['cal', 'fold', 'focus', 'pub'])
  for (const st of ['draft', 'confirm', 'receipt', 'told'])
    add({ id: `S-ASK.moment.${k}.${st}`, family: 'moment', kind: 'inline state', how: { cal: 'Add a practice to the calendar', fold: 'Save into a new folder', focus: 'Set a focus area', pub: 'Publish a plan to players' }[k], sec: 'h-moments', play: k, stage: st, dev: 'board', el: `.mo[data-mo="${k}"]`, conf: `T.querySelector('.conf')`, ops: [['mo', k], ...['draft', 'confirm', 'receipt', 'told'].slice(0, ['draft', 'confirm', 'receipt', 'told'].indexOf(st) + 1).map((s) => ['wait', 'mo-' + s])], piece: k === 'fold' ? 'Save to a folder' : k === 'focus' ? 'Task moments' : k === 'pub' ? 'Artifact' : 'Task moments' });

// 5. Shared kit states the page doesn't draw
add({ id: 'S-ASK.kit.failed', family: 'kit', kind: 'inline state', how: 'The write fails after the confirm press', sec: 'h-live', play: 'f_event', stage: 'receipt', nd: true, ops: chain('f_event', ['confirm']), app: { today: 'receiptfailed' }, piece: 'Confirm, commit, receipt' });
add({ id: 'S-ASK.kit.partial', family: 'kit', kind: 'inline state', how: 'Part of a multi-row write fails', sec: 'h-live', play: 'f_event', stage: 'receipt', nd: true, ops: chain('f_event', ['confirm']), app: { today: 'partial' }, piece: 'Confirm, commit, receipt' });
add({ id: 'S-ASK.kit.reloaded', family: 'kit', kind: 'inline state', how: 'Reload after the Undo window: the durable receipt', sec: 'h-live', play: 'f_event', stage: 'told', nd: true, ops: chain('f_event', ['confirm']), piece: 'Confirm, commit, receipt' });

// 6. Create flows: 11 keys x the same stage IDs, plus the answer variants the page draws
const FLOWS = {
  f_event: { q: 2, title: 'Event', variants: { seniors: [1, null] }, toldVariants: ['seniors'] },
  f_annc: { q: 2, title: 'Announcement', variants: { urgent: [1, null], 'no-got-it': [null, 1] }, toldVariants: ['no-got-it'] },
  f_travel: { q: 3, title: 'Travel', variants: { fly: [2, null, null], 'rooms-mine': [null, 2, null], 'by-tee-time': [null, 1, null] } },
  f_board: { q: 2, free: true, title: 'Board for a player', variants: { 'no-note': [null, 1], 'four-tiles': [[0, 1, 2, 3], null] } },
  f_poll: { q: 2, title: 'Poll', variants: { 'leave-open': [null, 2], 'four-nights': [[0, 1, 2, 3], null] } },
  f_qual: { q: 1, title: 'Qualifier', variants: { 'three-rounds': [1], 'one-round': [2] } },
  f_lineup: { q: 1, title: 'Lineup', cardFirst: true, lock: true, variants: { ana: [1], playoff: [2] } },
  f_task: { q: 2, title: 'Task', variants: { 'no-reminder': [2, null], weekly: [null, 1] } },
  f_goal: { q: 2, title: 'Goal', variants: { 'just-set': [null, 1], stretch: [1, null] }, toldVariants: ['just-set'] },
  f_note: { q: 0, title: 'Round note', variants: {} },
  f_drill: { q: 1, title: 'Drill', variants: { 'coaches-only': [1] } },
};
const FLOW_STAGES = ['reads', 'worked', 'brief', 'brief-2', 'brief-3', 'brief-free', 'folded', 'tie', 'draft', 'confirm', 'commit', 'receipt', 'told'];
for (const [k, F] of Object.entries(FLOWS)) {
  const stages = FLOW_STAGES.filter((s) => (s === 'brief' || s === 'folded' ? F.q >= 1 : s === 'brief-2' ? F.q >= 2 : s === 'brief-3' ? F.q >= 3 : s === 'brief-free' ? F.free : s === 'tie' ? F.cardFirst : true));
  const upto = (s) => chain(k, stages.slice(0, stages.indexOf(s) + 1));
  const HOW = { reads: `Ask in words (or from / or a follow-up chip); steps run`, worked: 'Reads done; the Worked out pills pop in', brief: 'Only what Ask could not work out, question 1', 'brief-2': 'Next', 'brief-3': 'Next', 'brief-free': 'Tap the free line and type', folded: 'Last Next; answers fold to pills', tie: 'Seats fill; the tie for spot 5 wobbles', draft: 'The live draft is built; its fields are about to fill', confirm: 'Every field filled; "On confirm:" line and buttons', commit: 'Tap the primary button', receipt: 'The draft lands in its home; Undo runs 8s', told: 'Undo window closes; players told' };
  for (const st of stages) add({ id: `S-ASK.flow.${k}.${st}`, family: 'flow', flow: k, kind: 'inline state', how: HOW[st], sec: 'h-make', play: k, stage: st, ops: upto(st), roles: 'coach only (player Ask has no writes)', app: { today: TODAY[st] }, piece: `Create flow: ${F.title}` });
  add({ id: `S-ASK.flow.${k}.undone`, family: 'flow', flow: k, kind: 'inline state', how: 'Tap Undo within 8s', sec: 'h-make', play: k, stage: 'undone', ops: upto('receipt').concat([['click', `__akC().querySelector('.receipt .undo')`], ['wait', 'undone']]), roles: 'coach only', piece: `Create flow: ${F.title}` });
  add({ id: `S-ASK.flow.${k}.cancelled`, family: 'flow', flow: k, kind: 'inline state', how: 'Tap Cancel on the draft', sec: 'h-make', play: k, stage: 'cancelled', ops: upto('confirm').concat([['click', `__akC().querySelector('.btns .c')`], ['wait', 'cancelled']]), roles: 'coach only', app: { today: 'cancelled' }, piece: `Create flow: ${F.title}` });
  if (F.lock) {
    // After Told a separate Lock card rises. Locking is its own press and has no Undo.
    const lk = `__akC().nextElementSibling`;
    add({ id: `S-ASK.flow.${k}.lock`, family: 'flow', flow: k, kind: 'inline state', how: 'Undo window closes; the Lock card rises under the receipt', sec: 'h-make', play: k, stage: 'lock', ops: upto('told').concat([['wait', 'lock']]), roles: 'coach only', piece: `Create flow: ${F.title}` });
    add({ id: `S-ASK.flow.${k}.locked`, family: 'flow', flow: k, kind: 'inline state', how: 'Tap "Lock lineup"; each seat locks, then the no-Undo receipt', sec: 'h-make', play: k, stage: 'locked', ops: upto('told').concat([['wait', 'lock'], ['click', `${lk}.querySelector('.btns .p')`], ['wait', 'locked']]), roles: 'coach only', piece: `Create flow: ${F.title}` });
    add({ id: `S-ASK.flow.${k}.not-locked`, family: 'flow', flow: k, kind: 'inline state', how: 'Tap "Not yet" on the Lock card', sec: 'h-make', play: k, stage: 'not-locked', ops: upto('told').concat([['wait', 'lock'], ['click', `${lk}.querySelector('.btns .c')`], ['wait', 'not-locked']]), roles: 'coach only', piece: `Create flow: ${F.title}` });
  }
  for (const [v, ans] of Object.entries(F.variants)) {
    const base = [['play', k], ['answers', ans], ['wait', 'confirm']];
    add({ id: `S-ASK.flow.${k}.confirm.${v}`, family: 'flow', flow: k, kind: 'inline state', how: `Answer: ${v.replace(/-/g, ' ')}`, sec: 'h-make', play: k, stage: 'confirm', answers: ans, ops: base, roles: 'coach only', piece: `Create flow: ${F.title}` });
    if ((F.toldVariants || []).includes(v)) add({ id: `S-ASK.flow.${k}.told.${v}`, family: 'flow', flow: k, kind: 'inline state', how: `Answer: ${v.replace(/-/g, ' ')}, then Undo closes`, sec: 'h-make', play: k, stage: 'told', answers: ans, ops: base.concat([['wait', 'commit'], ['wait', 'receipt'], ['wait', 'told']]), roles: 'coach only', piece: `Create flow: ${F.title}` });
  }
}

// 7. Player Ask
const PV = { view: 'player', roles: 'player only' };
add({ id: 'S-ASK.player.steps', family: 'player', kind: 'inline state', how: 'Player asks "Why is my approach costing me strokes?"', sec: 'h-live', play: 'player', stage: 'steps', ops: chain('player', ['steps']), ...PV, piece: 'Player view' });
add({ id: 'S-ASK.player.answer', family: 'player', kind: 'screen', how: 'The answer lands with the coach\'s drill as a read-only card', sec: 'h-live', play: 'player', stage: 'answer', ops: chain('player', ['steps', 'chart', 'answer']), ...PV, piece: 'Player view' });
add({ id: 'S-ASK.player.drill', family: 'player', kind: 'inline state', how: 'Read-only drill card inside the answer (no button)', sec: 'h-live', play: 'player', stage: 'answer', ops: chain('player', ['steps', 'chart', 'answer']), focus: ['.drill', 'center'], ...PV, piece: 'Player view' });
add({ id: 'S-ASK.player.recap', family: 'player', kind: 'screen', how: 'Player asks "How did I play at Hilltop?"', sec: 'h-live', play: 'recap', stage: 'answer', ops: chain('recap', ['steps', 'chart', 'answer']), ...PV, piece: 'Player view' });
add({ id: 'S-ASK.player.allowance', family: 'player', kind: 'inline state', how: 'Player Ask home: "Ask this week" meter', sec: 'h-live', play: 'home', stage: 'home', ops: [['wait', 'home']], focus: ['.allow', 'center'], ...PV, piece: 'Player allowance' });
add({ id: 'S-ASK.player.allowance-low', family: 'player', kind: 'inline state', how: 'Under 20% left this week', sec: 'h-live', play: 'home', stage: 'home', nd: true, ops: [['wait', 'home']], ...PV, piece: 'Player allowance' });
add({ id: 'S-ASK.player.out', family: 'player', kind: 'inline state', how: 'Send a question with the allowance used up', sec: 'h-live', play: 'limit', stage: 'out', ops: chain('limit', ['out']), ...PV, piece: 'Player allowance' });
for (const st of ['confirm', 'commit', 'receipt', 'told'])
  add({ id: st === 'confirm' ? 'S-ASK.player.request' : `S-ASK.player.request.${st}`, family: 'player', kind: 'inline state', how: { confirm: 'Tap "Request more"', commit: 'Tap "Send request"', receipt: 'Request ready; Undo runs 8s', told: 'Undo closes; one email sent' }[st], sec: 'h-live', play: 'limit', stage: st, ops: chain('limit', ['out', 'confirm', 'commit', 'receipt', 'told'].slice(0, ['out', 'confirm', 'commit', 'receipt', 'told'].indexOf(st) + 1)), ...PV, piece: 'Player allowance' });
add({ id: 'S-ASK.player.request.undone', family: 'player', kind: 'inline state', how: 'Tap Undo within 8s', sec: 'h-live', play: 'limit', stage: 'undone', ops: chain('limit', ['out', 'confirm', 'receipt']).concat([['click', `__akC().querySelector('.receipt .undo')`], ['wait', 'undone']]), ...PV, piece: 'Player allowance' });
add({ id: 'S-ASK.player.request.cancelled', family: 'player', kind: 'inline state', how: 'Tap Cancel on the request', sec: 'h-live', play: 'limit', stage: 'cancelled', ops: chain('limit', ['out', 'confirm']).concat([['click', `__akC().querySelector('.btns .c')`], ['wait', 'cancelled']]), ...PV, piece: 'Player allowance' });

// Fix the one odd ops line above (steps mid-run: wait for the first step, then 2.3s more so two rows are done).
REG.find((r) => r.id === 'S-ASK.steps').ops = chain('putts', ['steps']).concat([['advance', 2300]]);

// Which capture states the design page draws for an ID (the rest are rule-only rows in 05).
function drawnStates(r) {
  if (r.nd) return [];
  if (r.dev === 'board') return ['default', 'reduce', 'xxl'];
  const s = ['default', 'long', 'xxl', 'reduce'];
  if (r.dev !== 'desk') s.push('w430');
  if (!['S-ASK.artifact.push'].includes(r.id)) s.push('desktop', 'desktop-1280');
  if (r.dev === 'desk') s.splice(s.indexOf('default'), 1);
  if (r.id === 'S-ASK' || r.id === 'S-ASK.player') s.push('empty');
  if (r.id === 'S-ASK.toolcard.skeleton' || r.id === 'S-ASK.artifact.card') s.push('loading');
  return s;
}
// A desktop-only ID's "default" shot is its desktop shot.
const devFor = (r, state) => (STATES[state].desk || r.dev === 'desk' ? 'desk' : r.dev === 'board' ? 'board' : 'phone');

// ---------------------------------------------------------------------------------------------------------------
// Motion rows (07-MOTION.md). Each clip: get to `at` with the fake clock, resume real time, optionally click, record.
// ---------------------------------------------------------------------------------------------------------------
// act is clicked actAt ms after real time resumes (0 when left out).
const M = (id, screen, ops, rec, act, actAt = 0) => ({ id, screen, ops, rec, act, actAt });
const MOTION = [
  M('M-ASK-01', 'S-ASK', [['wait', 'home']], 1200, `D.querySelectorAll('.pseg .seg button')[0]`),
  M('M-ASK-02', 'S-ASK.turn.user', [['play', 'putts']], 1600),
  M('M-ASK-03', 'S-ASK.composer.typing', [['play', 'putts']], 1600),
  M('M-ASK-04', 'S-ASK.turn.answer', chain('putts', ['typing']), 1200),
  M('M-ASK-05', 'S-ASK.steps', chain('putts', ['steps']), 3200),
  M('M-ASK-06', 'S-ASK.steps', chain('putts', ['steps']), 2600),
  M('M-ASK-07', 'S-ASK.steps', chain('putts', ['steps']), 2600),
  M('M-ASK-08', 'S-ASK.steps', chain('putts', ['steps']), 3000),
  M('M-ASK-09', 'S-ASK.steps', chain('putts', ['steps']).concat([['advance', 300]]), 2000),
  M('M-ASK-10', 'S-ASK.steps', chain('putts', ['steps']).concat([['advance', 500]]), 1600),
  M('M-ASK-11', 'S-ASK.steps.folded', chain('putts', ['steps']).concat([['advance', 3200]]), 2500),
  M('M-ASK-12', 'S-ASK.steps.open', chain('putts', ['steps', 'skeleton', 'chart', 'answer']), 1200, `D.querySelector('#thread .work .sum')`),
  M('M-ASK-13', 'S-ASK.composer.busy', chain('putts', ['typing']), 1500),
  M('M-ASK-14', 'S-ASK.turn.answer', chain('putts', ['steps']).concat([['advance', 3300]]), 2500),
  M('M-ASK-15', 'S-ASK.readchip', chain('putts', ['steps']).concat([['advance', 3300]]), 2500),
  M('M-ASK-16', 'S-ASK.toolcard.skeleton', chain('putts', ['steps', 'skeleton']), 1500),
  M('M-ASK-17', 'S-ASK.toolcard.putt-profile', chain('putts', ['steps', 'skeleton']), 1800),
  M('M-ASK-18', 'S-ASK.toolcard.putt-profile', chain('putts', ['steps', 'skeleton']), 1800),
  M('M-ASK-19', 'S-ASK.toolcard.season', chain('trend', ['steps']).concat([['advance', 1500]]), 2600),
  M('M-ASK-20', 'S-ASK.toolcard.miss-pattern', chain('jonah', ['steps', 'chart']).concat([['advance', 2000]]), 2600),
  M('M-ASK-21', 'S-ASK.toolcard.ask-about', chain('putts', ['steps', 'skeleton', 'chart']), 1200, `D.querySelector('#thread .vcard .bar-hit')`),
  M('M-ASK-22', 'S-ASK.readchip.popover', chain('putts', ['steps', 'skeleton', 'chart', 'answer']).concat([['focus', '.prose .cite', 'center']]), 1400, `D.querySelector('#thread .prose .cite')`),
  M('M-ASK-23', 'S-ASK.sources.open', chain('putts', ['steps', 'skeleton', 'chart', 'answer']).concat([['focus', '.prose .cite', 'center']]), 1600, `D.querySelector('#thread .prose .cite')`),
  M('M-ASK-24', 'S-ASK.sources.open', chain('putts', ['steps', 'skeleton', 'chart', 'answer']), 1200, `D.querySelector('#thread .srcs')`),
  M('M-ASK-25', 'S-ASK.followups', chain('putts', ['steps', 'skeleton', 'chart']).concat([['advance', 2500]]), 2000),
  M('M-ASK-26', 'S-ASK.followups', chain('putts', ['steps', 'skeleton', 'chart', 'answer']), 900, `D.querySelector('#thread > .chips .chip')`),
  M('M-ASK-27', 'S-ASK.artifact.card', chain('plan', ['steps-2']).concat([['advance', 1200]]), 2500),
  M('M-ASK-28', 'S-ASK.artifact.pane', chain('plan', ['steps-2']).concat([['advance', 1800]]), 2200),
  M('M-ASK-29', 'S-ASK.artifact.push', chain('plan', ['steps-2']).concat([['advance', 1800]]), 2200),
  M('M-ASK-30', 'S-ASK.artifact.push', pc('artifact'), 1200, `D.querySelector('#apanel .ah .bk')`),
  M('M-ASK-31', 'S-ASK.artifact.push', chain('plan', ['writing']), 2200),
  M('M-ASK-32', 'S-ASK.artifact.push', chain('plan', ['writing']), 2200),
  M('M-ASK-33', 'S-ASK.brief.q1', chain('plan', ['reads']).concat([['advance', 1500]]), 1800),
  M('M-ASK-34', 'S-ASK.brief.q2', chain('plan', ['brief']), 2600),
  M('M-ASK-35', 'S-ASK.brief.q2', chain('plan', ['brief-2']), 2000),
  M('M-ASK-36', 'S-ASK.brief.q2', chain('plan', ['brief-2']), 2000),
  M('M-ASK-37', 'S-ASK.brief.q2', chain('plan', ['brief']), 2600),
  M('M-ASK-38', 'S-ASK.brief.free', chain('plan', ['brief-4']), 3500),
  M('M-ASK-39', 'S-ASK.brief.folded', chain('plan', ['brief-free']), 2400),
  M('M-ASK-40', 'S-ASK.flow.f_event.worked', chain('f_event', ['reads']).concat([['advance', 2000]]), 2400),
  M('M-ASK-41', 'S-ASK.flow.f_event.draft', chain('f_event', ['folded']), 3500),
  M('M-ASK-42', 'S-ASK.flow.f_event.confirm', chain('f_event', ['draft']).concat([['advance', 900]]), 1600),
  M('M-ASK-43', 'S-ASK.flow.f_event.commit', chain('f_event', ['confirm']), 1500, `__akC().querySelector('.btns .p')`),
  M('M-ASK-44', 'S-ASK.flow.f_event.commit', chain('f_event', ['commit']), 1400),
  M('M-ASK-45', 'S-ASK.flow.f_event.receipt', chain('f_event', ['commit']), 2200),
  M('M-ASK-46', 'S-ASK.flow.f_event.receipt', chain('f_event', ['commit']), 2200),
  M('M-ASK-47', 'S-ASK.flow.f_annc.receipt', chain('f_annc', ['commit']), 2600),
  M('M-ASK-48', 'S-ASK.flow.f_event.receipt', chain('f_event', ['commit']), 2400),
  M('M-ASK-49', 'S-ASK.flow.f_event.receipt', chain('f_event', ['commit']), 2400),
  M('M-ASK-50', 'S-ASK.flow.f_event.receipt', chain('f_event', ['commit']), 2400),
  M('M-ASK-51', 'S-ASK.flow.f_event.receipt', chain('f_event', ['receipt']), 8600),
  M('M-ASK-52', 'S-ASK.flow.f_event.undone', chain('f_event', ['receipt']), 1400, `__akC().querySelector('.receipt .undo')`),
  M('M-ASK-53', 'S-ASK.flow.f_event.told', chain('f_event', ['receipt']).concat([['advance', 7400]]), 3600),
  M('M-ASK-54', 'S-ASK.flow.f_event.cancelled', chain('f_event', ['confirm']), 1000, `__akC().querySelector('.btns .c')`),
  M('M-ASK-55', 'S-ASK.flow.f_event.draft', chain('f_event', ['folded']).concat([['advance', 400]]), 2600),
  M('M-ASK-56', 'S-ASK.flow.f_event.confirm', chain('f_event', ['confirm']), 3400),
  M('M-ASK-57', 'S-ASK.flow.f_annc.draft', chain('f_annc', ['folded']).concat([['advance', 200]]), 1800),
  M('M-ASK-58', 'S-ASK.flow.f_annc.told', chain('f_annc', ['receipt']).concat([['advance', 7400]]), 3600),
  M('M-ASK-59', 'S-ASK.flow.f_travel.draft', chain('f_travel', ['folded']).concat([['advance', 200]]), 2200),
  M('M-ASK-60', 'S-ASK.flow.f_travel.draft', chain('f_travel', ['folded']).concat([['advance', 900]]), 1800),
  M('M-ASK-61', 'S-ASK.flow.f_board.draft', chain('f_board', ['folded']).concat([['advance', 200]]), 2200),
  M('M-ASK-62', 'S-ASK.flow.f_board.receipt', chain('f_board', ['commit']), 2400),
  M('M-ASK-63', 'S-ASK.flow.f_poll.draft', chain('f_poll', ['folded']).concat([['advance', 200]]), 1600),
  M('M-ASK-64', 'S-ASK.flow.f_qual.draft', chain('f_qual', ['folded']).concat([['advance', 200]]), 2000),
  M('M-ASK-65', 'S-ASK.flow.f_lineup.tie', chain('f_lineup', ['worked']).concat([['advance', 300]]), 3200),
  M('M-ASK-66', 'S-ASK.flow.f_lineup.receipt', chain('f_lineup', ['commit']), 2000),
  M('M-ASK-67', 'S-ASK.flow.f_task.draft', chain('f_task', ['folded']).concat([['advance', 200]]), 2000),
  M('M-ASK-68', 'S-ASK.flow.f_goal.draft', chain('f_goal', ['folded']).concat([['advance', 200]]), 2400),
  M('M-ASK-69', 'S-ASK.flow.f_goal.told', chain('f_goal', ['receipt']).concat([['advance', 7400]]), 4000),
  M('M-ASK-70', 'S-ASK.flow.f_note.draft', chain('f_note', ['worked']).concat([['advance', 200]]), 1800),
  M('M-ASK-71', 'S-ASK.flow.f_drill.draft', chain('f_drill', ['folded']).concat([['advance', 200]]), 2600),
  M('M-ASK-72', 'S-ASK.flow.f_task.confirm', chain('f_task', ['confirm']), 3400),
  M('M-ASK-73', 'S-ASK.save', pc('artifact'), 2200),
  M('M-ASK-74', 'S-ASK.save.folder-list', pc('save'), 1500),
  M('M-ASK-75', 'S-ASK.save.folder-list', pc('save-list'), 1400),
  M('M-ASK-76', 'S-ASK.save.new-folder', pc('save-list'), 3000),
  M('M-ASK-77', 'S-ASK.save.receipt', pc('new-folder').concat([['wait', 'confirm'], ['wait', 'commit']]), 2200),
  M('M-ASK-78', 'S-ASK.save.receipt', pc('new-folder').concat([['wait', 'confirm'], ['wait', 'commit']]), 2200),
  M('M-ASK-79', 'S-ASK.publish', pubOps.slice(0, -2), 1400, `D.querySelector('#apanel .af .p')`),
  M('M-ASK-80', 'S-ASK.publish.receipt', pubOps, 2400, `${PUB}.querySelector('.btns .p')`),
  M('M-ASK-81', 'S-ASK.publish.told', [['mo', 'pub'], ['wait', 'mo-receipt']], 10500),
  M('M-ASK-82', 'S-ASK.moment.focus.receipt', [['mo', 'focus'], ['wait', 'mo-confirm']], 3000),
  M('M-ASK-83', 'S-ASK.player.out', chain('limit', ['typing']), 2600),
  M('M-ASK-84', 'S-ASK.player.allowance', [['wait', 'home']], 800),
  M('M-ASK-85', 'S-ASK.tone.detailed', [], 800, `D.querySelector('#segTone [data-v="detail"]')`),
  M('M-ASK-86', 'S-ASK.flow.f_event.worked', chain('f_event', ['worked']).concat([['advance', 600]]), 900, `D.querySelector('#thread .inf .ipl')`),
  M('M-ASK-87', 'S-ASK.artifact.why-popover', pc('artifact'), 1000, `D.querySelector('#apanel .ab .cite')`),
  M('M-ASK-88', 'S-ASK.flow.plan.receipt', PE.concat([['wait', 'confirm']]), 2400, `__akC().querySelector('.btns .p')`),
  // Lock card rises after Told (600ms in), then Lock lineup is pressed 1400ms in: capsule 700ms, five lock pops 70ms apart, receipt.
  M('M-ASK-89', 'S-ASK.flow.f_lineup.locked', chain('f_lineup', ['receipt']).concat([['advance', 7400]]), 3600, `__akC().nextElementSibling?.querySelector('.btns .p')`, 1400),
];
// Rows that play on a board element (moments, pieces) rather than the phone.
const BOARD_MOTION = { 'M-ASK-81': '.mo[data-mo="pub"]', 'M-ASK-82': '.mo[data-mo="focus"]', 'M-ASK-85': '#h-pieces ~ .grid2 > .card:nth-child(1)' };
const VIEW_MOTION = { 'M-ASK-83': 'player', 'M-ASK-84': 'player' };
const DESK_MOTION = { 'M-ASK-28': true };

// ---------------------------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------------------------
// IDs the page no longer draws (v12). Kept out of the registry so nothing shoots them; asking for one says why.
const RETIRED = {
  'S-ASK.flow.f_annc.brief-3': 'v11: the announcement asks two questions (no scheduled send)',
  'S-ASK.flow.f_annc.confirm.later': 'v11: no scheduled send',
  'S-ASK.flow.f_annc.told.later': 'v11: no scheduled send',
  'S-ASK.flow.f_qual.brief-2': 'v12: no exempt question',
  'S-ASK.flow.f_qual.confirm.exempt': 'v12: no exempt question and no tie rule',
  'S-ASK.flow.f_note.brief': 'v12: the note asks nothing and is always shared',
  'S-ASK.flow.f_note.brief-free': 'v12: no brief',
  'S-ASK.flow.f_note.folded': 'v12: no brief',
  'S-ASK.flow.f_note.confirm.private': 'v12: the note is always shared',
  'S-ASK.flow.f_note.told.private': 'v12: the note is always shared',
};
function pickIds(sel) {
  if (!sel || sel === true || sel === 'all') return REG;
  const pats = String(sel).split(',');
  for (const p of pats) if (RETIRED[p]) console.log(`${p} is retired: ${RETIRED[p]}`);
  return REG.filter((r) => pats.some((p) => (p.endsWith('*') ? r.id.startsWith(p.slice(0, -1)) : r.id === p)));
}
const THEMES = args.lean ? ['light'] : args.theme === 'light' ? ['light'] : args.theme === 'dark' ? ['dark'] : ['light', 'dark'];
function plan(side) {
  const ids = pickIds(args.id);
  const want = args.lean ? ['default'] : !args.state || args.state === true ? ['default'] : args.state === 'all' ? Object.keys(STATES) : String(args.state).split(',');
  const shots = [], skipped = [];
  for (const r of ids) for (const s of want) {
    if (!STATES[s]) { skipped.push(`${r.id} ${s}: unknown state`); continue; }
    if (side === 'design') {
      const d = drawnStates(r);
      const st = r.dev === 'desk' && s === 'default' ? 'desktop' : s;
      if (!d.includes(st) && !(r.dev === 'desk' && s === 'default')) { skipped.push(`${r.id} ${s}: not drawn on the design page (rule in 05)`); continue; }
    }
    for (const t of THEMES) shots.push({ r, state: s, theme: t, file: `${r.id}__${s}__${side}__${t}.png` });
  }
  return { shots, skipped };
}

if (args.list) {
  console.log(JSON.stringify({ states: STATES, stages: Object.keys(STAGES), playKeys: PLAY_KEYS, retired: RETIRED, ids: REG.map((r) => ({ ...r, anchor: anchor(r), hold: holdFor(r), wait: r.ops.filter((o) => o[0] === 'wait').map((o) => STAGES[o[1]]).pop() ?? null, drawn: drawnStates(r) })), motion: MOTION.map((m) => ({ id: m.id, screen: m.screen })) }, null, 1));
  process.exit(0);
}
if (args.dry) {
  for (const side of mode === 'both' ? ['design', 'app'] : mode === 'clips' ? [] : [mode]) {
    const { shots, skipped } = plan(side);
    console.log(`${side}: ${shots.length} shots, ${skipped.length} skipped`);
    if (args.verbose) shots.forEach((s) => console.log('  ' + s.file));
  }
  if (mode === 'clips') console.log(`clips: ${(args.motion === 'all' || args.motion === true ? MOTION : MOTION.filter((m) => m.id === args.motion)).length} rows x design and app x motion and reduce`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------------------------------------------
const { chromium } = await import('playwright');
const saved = [], failed = [], notes = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e?.message ?? e).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};

const INIT = () => {
  window.__akC = () => [...document.querySelectorAll('#thread .conf')].pop() || null;
  window.__akLong = () => {
    const L = {
      name: 'Bartholomew Featherstonehaugh-Okonkwo',
      title: 'Team meeting before the Pinehurst qualifier and the Tiger Classic travel briefing',
      place: 'Clubhouse film room at the Lake Course, upstairs past the pro shop',
      step: 'Reading putts from the last 30 days for every player on Varsity and JV',
      q: 'Why are Bartholomew and the rest of the team missing so many short putts from 3 to 5 feet lately?',
      folder: 'Fall 2026 qualifiers and travel plans',
    };
    const set = (sel, v) => document.querySelectorAll(sel).forEach((n) => { n.textContent = v; });
    set('#thread .msg-u', L.q);
    set('#thread .step .lb', L.step);
    set('#thread .evd .f.t .v', L.title);
    document.querySelectorAll('#thread .evd .ls .f:nth-child(3) .v').forEach((n) => { n.textContent = L.place; });
    set('#thread .ipl b', L.title);
    set('#thread .hsr.nw .rx b', L.title);
    set('#thread .qpane h5', 'How should I split the team for Tuesday when three players have class until 4:15?');
    set('#pscopeT', `${L.name} · this season`);
    set('#apanel .ah .tt b', 'Tuesday practice: approach 125 to 150 and short putts before Pinehurst');
    set('#apanel .srow .fnm', L.folder);
    set('.mpop .r.on span', L.name);
    set('#thread .acard b', 'Tuesday practice: approach 125 to 150 and short putts');
    set('#thread .drill .dh b', 'Distance ladder from 125, 135 and 145 yards with a partner');
  };
};
const frameCSS = (dev, w, h) => `
  html,body{overflow:hidden!important} .ctl,.hero{display:none!important} body::before{display:none!important}
  #scaler{transform:none!important} #devhold{width:auto!important;height:auto!important}
  ${dev === 'phone'
    ? `#phone{position:fixed!important;left:0!important;top:0!important;width:${w}px!important;height:${h}px!important;border:0!important;border-radius:0!important;box-shadow:none!important;z-index:1000!important}`
    : `#desk{position:fixed!important;left:0!important;top:0!important;width:${w}px!important;height:${h}px!important;border-radius:0!important;box-shadow:none!important;z-index:1000!important}`}`;
const boardCSS = `.ctl{position:static!important} body::before{display:none!important}`;

// One page per run. clock: Playwright fake clock, or real time when it isn't available.
async function openDesign(browser, { dev, state, theme, r, hold = null, video }) {
  const S = STATES[state];
  const w = dev === 'desk' ? (S.desk ? S.w : 1440) : dev === 'board' ? 1440 : S.w;
  const h = dev === 'desk' ? (S.desk ? S.h : 900) : dev === 'board' ? 1100 : S.h;
  const reduce = !!(S.reduce || video?.reduce);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: video ? 1 : 2, colorScheme: theme, reducedMotion: reduce ? 'reduce' : 'no-preference', ...(video ? { recordVideo: { dir: video.dir, size: { width: w, height: h } } } : {}) });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  const clock = !!page.clock;
  if (clock) await page.clock.install({ time: new Date('2026-10-31T09:41:00') });
  const t0 = Date.now();
  // The page's own state link sets theme, viewer, device, Reduce Motion and Text Size, starts the scene and holds it.
  const hash = link(r, { hold, dev: dev === 'desk' ? 'desk' : 'phone', theme, rm: reduce, xxl: S.xxl });
  await page.goto(PAGE + hash, { waitUntil: 'load' });
  if (clock) { const now = await page.evaluate(() => Date.now()); await page.clock.pauseAt(now + 20); }
  await page.addStyleTag({ content: dev === 'board' ? boardCSS : frameCSS(dev, w, h) });
  await page.evaluate(() => document.fonts.ready);
  const step = reduce ? 10 : 40;
  // The link already pressed Play, so the first ['play'] op is done.
  const started = /[?&]play=/.test(hash) ? 1 : 0;
  const ctl = {
    page, ctx, clock, t0, step, hash, started,
    advance: async (ms) => { if (clock) await page.clock.runFor(ms); else await page.waitForTimeout(ms); },
  };
  return ctl;
}
const evalIn = (page, expr, scopeSel, confExpr) => page.evaluate(([e, s, c]) => {
  const D = document; const T = s ? D.querySelector(s) : D.querySelector('#thread');
  const cf = new Function('D', 'T', `return (${c || 'null'})`)(D, T);
  return new Function('D', 'T', 'c', `return (${e})`)(D, T, cf);
}, [expr, scopeSel, confExpr]);
async function waitStage(ctl, stage, r, budget = 120000) {
  const expr = STAGES[stage];
  if (!expr) throw new Error(`unknown stage ${stage}`);
  for (let t = 0; t <= budget; t += ctl.step) {
    if (await evalIn(ctl.page, expr, r.el, r.conf)) { if (AFTER[stage]) await ctl.advance(AFTER[stage]); return; }
    await ctl.advance(ctl.step);
  }
  throw new Error(`stage ${stage} never reached`);
}
// A hold is reached when <html data-stage> names it; the run then waits there however long the clock runs.
async function waitHold(ctl, hold, budget = 120000) {
  for (let t = 0; t <= budget; t += ctl.step) {
    if (await ctl.page.evaluate((h) => document.documentElement.dataset.stage === h, hold)) return;
    await ctl.advance(ctl.step);
  }
  throw new Error(`hold ${hold} never reached (${ctl.hash})`);
}
async function focusOn(ctl, spec, r) {
  if (!spec || r.dev === 'board') return;
  const [sel, align] = spec;
  await ctl.page.evaluate(([sel, align, conf]) => {
    const th = document.querySelector('#thread'); if (!th) return;
    let el;
    if (sel.startsWith('@c')) { const c = new Function('D', `return (${conf})`)(document); const rest = sel.slice(2).trim(); el = c && (rest ? [...c.querySelectorAll(rest)].pop() : c); }
    else el = [...th.querySelectorAll(sel)].pop();
    if (!el) return;
    const tr = th.getBoundingClientRect(), er = el.getBoundingClientRect(), comp = 120;
    const d = align === 'top' ? er.top - tr.top - 8 : align === 'bottom' ? er.bottom - (tr.bottom - comp) : (er.top + er.height / 2) - (tr.top + (tr.height - comp) / 2);
    th.style.scrollBehavior = 'auto'; th.scrollTop += d;
  }, [sel, align, r.conf]);
}
async function runOps(ctl, ops, r, from = 0) {
  for (let i = from; i < ops.length; i++) {
    const [op, a, b] = ops[i];
    if (op === 'play') await ctl.page.evaluate((k) => document.querySelector(`[data-play="${k}"]`).click(), a);
    else if (op === 'mo') { await ctl.page.evaluate((k) => { const m = document.querySelector(`.mo[data-mo="${k}"]`); m.scrollIntoView({ block: 'center' }); m.querySelector('[data-mo-play]').click(); }, a); }
    else if (op === 'wait') await waitStage(ctl, a, r);
    else if (op === 'advance') await ctl.advance(a);
    else if (op === 'click') { const ok = await evalIn(ctl.page, `(()=>{const n=${a};if(!n)return false;n.click();return true})()`, r.el, r.conf); if (!ok) throw new Error(`nothing to click: ${a}`); await ctl.advance(60); }
    else if (op === 'focus') await focusOn(ctl, [a, b], r);
    else if (op === 'answers') await answerBrief(ctl, a, r);
  }
}
// Pick answers in the brief the way a coach would: pick, then Next once the card is listening (after its 800ms beat).
async function answerBrief(ctl, answers, r) {
  for (let i = 0; i < answers.length; i++) {
    await waitStage(ctl, ['brief', 'brief-2', 'brief-3', 'brief-4'][i], r);
    await ctl.page.evaluate(([i, want]) => {
      const q = [...document.querySelectorAll('#thread .qcard')].pop(); const pane = q.querySelector(`.qpane[data-q="${i}"]`);
      if (want == null) { pane.querySelector('.opt[aria-pressed="true"]')?.click(); pane.querySelector('.opt[aria-pressed="true"]') || pane.querySelector('.opt')?.click(); return; }
      if (Array.isArray(want)) { pane.querySelectorAll('.opt').forEach((o, j) => { const on = o.getAttribute('aria-pressed') === 'true'; if (on !== want.includes(j)) o.click(); }); }
      else pane.querySelector(`.opt[data-i="${want}"]`).click();
    }, [i, answers[i]]);
    await ctl.advance(ctl.step === 10 ? 120 : 900);
    await ctl.page.evaluate(() => [...document.querySelectorAll('#thread .qcard')].pop().querySelector('.qft .p').click());
    await ctl.advance(ctl.step === 10 ? 60 : 450);
  }
}

async function shootDesign(browser) {
  const { shots, skipped } = plan('design');
  skipped.forEach((s) => notes.push(s));
  // Group shots that share a run: same device, state, theme, viewer, and ops that extend each other.
  shots.sort((a, b) => [a.state, a.theme].join() < [b.state, b.theme].join() ? -1 : 1);
  let cur = null;
  const close = async () => { if (cur) { await cur.ctl.ctx.close(); cur = null; } };
  for (const s of shots) {
    const { r, state, theme } = s;
    const dev = devFor(r, state);
    const hold = holdFor(r);
    const key = [dev, state, theme, r.view, r.el ?? '', r.sec, hold ?? ''].join('|');
    const ops = r.ops;
    const extends_ = cur && cur.key === key && cur.done.length <= ops.length && JSON.stringify(ops.slice(0, cur.done.length)) === JSON.stringify(cur.done);
    await record(s.file, async () => {
      if (!extends_) { await close(); const ctl = await openDesign(browser, { dev, state, theme, r, hold }); cur = { key, done: ops.slice(0, ctl.started), ctl }; }
      if (hold) await waitHold(cur.ctl, hold);
      await runOps(cur.ctl, ops, r, cur.done.length);
      cur.done = ops;
      await focusOn(cur.ctl, r.focus ?? FOCUS[r.stage], r);
      if (STATES[state].long) await cur.ctl.page.evaluate(() => window.__akLong());
      await cur.ctl.page.waitForTimeout(900); // real time: CSS transitions and Web Animations settle while the clock holds
      const path = join(OUT, s.file);
      if (r.dev === 'board') await cur.ctl.page.locator(r.el).first().screenshot({ path });
      else await cur.ctl.page.screenshot({ path });
    }).catch(() => {});
    if (failed.length && failed[failed.length - 1].startsWith(s.file)) await close();
  }
  await close();
}

// The app: the preview route the build adds, or today's Ask as "before".
async function hasFixture(browser) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  try {
    const res = await page.goto(BASE + 'coachhelm-ask-v2?id=S-ASK&scene=home&stage=home&viewer=coach', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => null);
    if (!res || !res.ok()) return false;
    return await page.waitForSelector('[data-ch-ak-ready]', { timeout: 8000 }).then(() => true, () => false);
  } finally { await ctx.close(); }
}
const appUrl = (r, state, fixture) => {
  if (fixture) {
    const [stage, extra] = r.stage.split('&');
    const q = new URLSearchParams({ id: r.id, scene: r.play ?? 'home', stage, viewer: r.view });
    if (extra) q.set(...extra.split('='));
    if (r.answers) q.set('answers', r.answers.map((a) => (a == null ? '-' : Array.isArray(a) ? a.join('+') : String(a))).join(','));
    if (STATES[state].data) q.set('state', state);
    if (STATES[state].long) q.set('state', 'long');
    if (STATES[state].xxl) q.set('text', 'xxl');
    return `${BASE}coachhelm-ask-v2?${q}`;
  }
  const t = r.app?.today ?? TODAY[r.stage];
  if (t === undefined || t === null) return null;
  return `${BASE}coachhelm-ask${t ? `?state=${t}` : ''}`;
};
async function shootApp(browser) {
  const fixture = await hasFixture(browser);
  console.log(fixture ? 'fixture found: shooting the new Ask' : 'no coachhelm-ask-v2 fixture yet: shooting today\'s Ask as "before"');
  const { shots } = plan('app');
  for (const s of shots) {
    const { r, state, theme } = s;
    const url = appUrl(r, state, fixture);
    if (!url) { notes.push(`${r.id} ${state}: no today equivalent (before)`); continue; }
    const S = STATES[state]; const dev = devFor(r, state);
    const w = dev === 'desk' ? (S.desk ? S.w : 1440) : dev === 'board' ? 390 : S.w;
    const h = dev === 'desk' ? (S.desk ? S.h : 900) : dev === 'board' ? 844 : S.h;
    await record(s.file, async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: S.reduce ? 'reduce' : 'no-preference' });
      try {
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        if (S.xxl) await page.evaluate((k) => document.documentElement.style.setProperty('--ch-type-scale', String(k)), XXL);
        await page.evaluate(() => document.fonts.ready);
        if (fixture) await page.waitForSelector('[data-ch-ak-ready="1"]', { timeout: 15000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT, s.file) });
      } finally { await ctx.close(); }
    });
  }
}

// Side by side: built left, design right, same ID, state and theme. Pure browser canvas, no extra deps.
async function compare(browser) {
  const dir = join(OUT, 'compare'); mkdirSync(dir, { recursive: true });
  const files = existsSync(OUT) ? readdirSync(OUT) : [];
  const designs = files.filter((f) => f.includes('__design__'));
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  for (const f of designs) {
    const a = f.replace('__design__', '__app__');
    if (!files.includes(a)) { notes.push(`not built yet: ${a}`); continue; }
    const outName = f.replace('__design__', '__compare__');
    await record(outName, async () => {
      await page.setContent('<body style="margin:0;background:#888"><canvas id=c></canvas></body>');
      const dataUrl = await page.evaluate(async ([l, r, label]) => {
        const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = s; });
        const [A, B] = await Promise.all([load(l), load(r)]);
        const c = document.getElementById('c'); const g = 24;
        c.width = A.width + B.width + g; c.height = Math.max(A.height, B.height) + 56;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = '#1c1b18'; x.font = '600 26px system-ui'; x.fillText('Built · ' + label, 8, 36); x.fillText('Design', A.width + g + 8, 36);
        x.drawImage(A, 0, 56); x.drawImage(B, A.width + g, 56);
        return c.toDataURL('image/png');
      }, [pathToFileURL(join(OUT, a)).href, pathToFileURL(join(OUT, f)).href, f.split('__').slice(0, 2).join(' · ')]);
      await page.goto(dataUrl);
      await page.screenshot({ path: join(dir, outName), fullPage: true });
    });
  }
  await ctx.close();
}

// Clips: for each 07 row, the design page and (with the fixture) the app, with and without Reduce Motion.
async function clips(browser) {
  mkdirSync(CLIPS, { recursive: true });
  const rows = args.motion === 'all' || args.motion === true ? MOTION : MOTION.filter((m) => String(args.motion).split(',').includes(m.id));
  if (!rows.length) throw new Error(`no motion row ${args.motion}`);
  const fixture = await hasFixture(browser);
  for (const m of rows) {
    const r = REG.find((x) => x.id === m.screen) ?? { id: m.screen, view: 'coach', conf: '__akC()', dev: 'phone' };
    const board = BOARD_MOTION[m.id];
    const rr = { ...r, view: VIEW_MOTION[m.id] ?? r.view, el: board ?? undefined, dev: board ? 'board' : DESK_MOTION[m.id] ? 'desk' : 'phone', conf: board ? `T.querySelector('.conf')` : r.conf };
    for (const motion of ['motion', 'reduce']) {
      const name = `${m.id}__design__${motion}`;
      await record(name, async () => {
        const tmp = join(CLIPS, '.tmp'); mkdirSync(tmp, { recursive: true });
        const mr = { ...rr, ops: m.ops, sec: board ? (rr.sec ?? 'h-pieces') : rr.sec ?? 'h-live' };
        const ctl = await openDesign(browser, { dev: rr.dev, state: 'default', theme: 'light', r: mr, hold: null, video: { dir: tmp, reduce: motion === 'reduce' } });
        await runOps(ctl, m.ops, rr, ctl.started);
        if (board) await ctl.page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), board);
        const start = Date.now() - ctl.t0;
        if (ctl.clock) await ctl.page.clock.resume();
        if (m.act && m.actAt) await ctl.page.waitForTimeout(m.actAt);
        if (m.act) await evalIn(ctl.page, `(()=>{const n=${m.act};n&&n.click();return true})()`, rr.el, rr.conf);
        await ctl.page.waitForTimeout(m.rec + 400);
        const v = ctl.page.video(); await ctl.ctx.close();
        const file = join(CLIPS, `${name}.webm`); await v.saveAs(file); await v.delete();
        writeFileSync(join(CLIPS, `${name}.json`), JSON.stringify({ id: m.id, screen: m.screen, motionStartsAtMs: start, recordMs: m.rec, reduce: motion === 'reduce' }, null, 1));
      });
      if (!fixture) continue;
      const appName = `${m.id}__app__${motion}`;
      await record(appName, async () => {
        const tmp = join(CLIPS, '.tmp'); mkdirSync(tmp, { recursive: true });
        const w = rr.dev === 'desk' ? 1440 : 390, h = rr.dev === 'desk' ? 900 : 844;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'light', reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference', recordVideo: { dir: tmp, size: { width: w, height: h } } });
        const page = await ctx.newPage(); const t0 = Date.now();
        await page.goto(`${BASE}coachhelm-ask-v2?motion=${m.id}&viewer=${rr.view}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-ch-ak-ready="1"]', { timeout: 15000 });
        const start = Date.now() - t0;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('ch-ak-play')));
        await page.waitForTimeout(m.rec + 400);
        const v = page.video(); await ctx.close();
        const file = join(CLIPS, `${appName}.webm`); await v.saveAs(file); await v.delete();
        writeFileSync(join(CLIPS, `${appName}.json`), JSON.stringify({ id: m.id, screen: m.screen, motionStartsAtMs: start, recordMs: m.rec, reduce: motion === 'reduce' }, null, 1));
      });
    }
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  if (mode === 'design' || mode === 'both') await shootDesign(browser);
  if (mode === 'app' || mode === 'both') await shootApp(browser);
  if (mode === 'compare') await compare(browser);
  if (mode === 'clips') await clips(browser);
} finally { await browser.close(); }
console.log(`\n${saved.length} saved, ${failed.length} failed, ${notes.length} listed`);
if (notes.length && args.verbose) console.log(notes.map((n) => '  ' + n).join('\n'));
if (failed.length) console.log(failed.map((f) => '  ' + f).join('\n'));
process.exit(failed.length ? 1 : 0);
