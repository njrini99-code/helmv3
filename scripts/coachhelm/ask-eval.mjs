/**
 * Live evaluation of CoachHelm Ask against STAGING data. Run by hand; never in CI. It costs money.
 *
 *   node scripts/coachhelm/ask-eval.mjs                       dry run: computes every expected answer from staging
 *                                                             by plain queries (free), prints the plan and a cost estimate
 *   node scripts/coachhelm/ask-eval.mjs --apply               asks the questions on the dev server and scores the answers
 *
 * Why it calls the dev server over HTTP instead of the turn function: the route is where the grounding audit, the
 * conversation, the tools' Supabase client (RLS as the real coach or player) and the player branch all live. A direct call
 * would have to rebuild those and could pass while the route fails. The cost is a signed-in session, which --apply mints
 * for the staging coach and for Cole Bennett (a magic-link token via the admin API, no email sent), or takes from --cookie.
 *
 * Each question carries an expected answer computed independently of Ask: the facts (numbers, names, dates, phrases it
 * must state) and anything it must not say. A fact is `correct` when the answer states it (numbers within rounding; a
 * figure written without its minus sign counts), `wrong` when the answer states a different value where the fact's
 * `claim` pattern finds one, and `missing` otherwise. The verdict is the route's own: accepted, rejected (the grounding
 * audit withheld the answer) or incomplete (the stream broke). A rejected turn whose stored text has every fact right is a
 * wrong rejection. The report lists those first.
 *
 * Writes: staging conversation and ledger rows (what any Ask turn writes), the markdown report, nothing else.
 * Never run against production: it refuses unless the Supabase URL is the staging project.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cliGuard } from '../lib/cli-guard.mjs';
import { applyStreamLine, newStreamState, score } from './ask-eval-score.mjs';

const STAGING_REF = 'ybmwektreyrwjscxlogv';
const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';
const DEFAULT_BASE = 'http://localhost:3100';
const FALLBACK_TURN_COST_USD = 0.12;

const cli = cliGuard({
  name: 'scripts/coachhelm/ask-eval.mjs',
  summary:
    'Ask CoachHelm Ask ~21 real questions on the local dev server against the staging demo team, score each answer against an expected answer computed from staging data, and write a markdown report. Dry run by default (free); --apply spends model budget.',
  usage: '[--base-url <url>] [--only <id,id>] [--out <file>] [--cookie <header>] [--player-cookie <header>] [--list]',
  options: [
    ['--base-url <url>', `Dev server (default ${DEFAULT_BASE}). It must run on the staging env and have Clubhouse on for the demo team.`],
    ['--only <ids>', 'Comma-separated question ids (see --list).'],
    ['--out <file>', 'Report path (default: <tmpdir>/ask-eval/ask-eval-<timestamp>.md).'],
    ['--cookie <header>', 'Cookie header of a signed-in demo coach (or ASK_EVAL_COOKIE). Skips the magic-link sign-in.'],
    ['--player-cookie <header>', 'Cookie header of a signed-in Cole Bennett (or ASK_EVAL_PLAYER_COOKIE).'],
    ['--list', 'Print the question ids and exit.'],
  ],
  writes: true,
  secrets: '.env.local in the current directory (staging URL, anon key, service key); never printed',
});

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

config({ path: join(process.cwd(), '.env.local'), quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = url ? new URL(url).hostname.split('.')[0] : '';
if (ref !== STAGING_REF || !serviceKey) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL must be the staging project (${STAGING_REF}). Got "${ref || 'none'}".`);
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data ?? [];
};

// ------------------------- staging facts (read-only) -------------------------

const team = must(await sb.from('golf_teams').select('id, name, timezone, organization_id').eq('id', DEMO_TEAM_ID), 'team')[0];
const members = must(await sb.from('golf_team_members').select('player_id').eq('team_id', DEMO_TEAM_ID).eq('status', 'active'), 'members');
const profiles = must(await sb.from('golf_players').select('id, first_name, last_name, user_id').in('id', members.map((m) => m.player_id)), 'players');
const roster = profiles.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), first: p.first_name, userId: p.user_id }));
const byName = (n) => roster.find((p) => p.name === n || p.first === n);
const rounds = must(
  await sb
    .from('golf_rounds')
    .select('id, player_id, round_date, created_at, course_name, round_type, status, is_test, holes_played, total_score, strokes_gained_approach, strokes_gained_putting, total_gir, total_gir_possible')
    .in('player_id', roster.map((p) => p.id))
    .order('round_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000),
  'rounds',
);
const real = rounds.filter((r) => !r.is_test);
// A coach sees the goals a player shared or a coach set (RLS), not a player's private ones.
const goals = must(await sb.from('golf_goals').select('id, player_id, title, state, shared_with_coach, coach_id_if_assigned').in('player_id', roster.map((p) => p.id)), 'goals').filter((g) => g.shared_with_coach || g.coach_id_if_assigned);
const attendance = must(await sb.from('golf_attendance_summary').select('player_id').eq('team_id', DEMO_TEAM_ID).limit(50), 'attendance');

/** Stats' scoring rounds: finished, not a test, practice left out. */
const scoring = (pid) => real.filter((r) => r.player_id === pid && r.status === 'completed' && r.round_type !== 'practice');
const lastN = (pid, n) => scoring(pid).slice(0, n);
const combos = (arr, k) => (k <= 0 ? [[]] : arr.length <= k ? [arr.slice()] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c])));
/** Rounds on the boundary date tie, and Stats breaks the tie its own way: every window the tie allows. */
function lastNVariants(pid, n) {
  const all = scoring(pid);
  if (all.length <= n) return [all];
  const boundary = all[n - 1].round_date;
  const before = all.filter((r) => r.round_date > boundary);
  const tie = all.filter((r) => r.round_date === boundary);
  return combos(tie, n - before.length).map((c) => [...before, ...c]);
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);
const scores = (rs) => rs.filter((r) => r.total_score != null && (r.holes_played == null || r.holes_played >= 18)).map((r) => r.total_score);
const sg = (rs, key) => rs.map((r) => r[key]).filter((v) => v != null);
const girPool = (rs) => {
  const have = rs.filter((r) => (r.total_gir_possible ?? 0) > 0);
  const possible = have.reduce((a, r) => a + r.total_gir_possible, 0);
  return possible ? { pct: (100 * have.reduce((a, r) => a + (r.total_gir ?? 0), 0)) / possible, holes: possible } : null;
};
const sinceSep1 = (r) => r.round_date >= '2026-09-01';

/** Player-level figures for a window: every value the tie-break allows (`vs`, base reading first), best first by the base reading. */
const perPlayer = (n, key) =>
  roster
    .map((p) => {
      const variants = lastNVariants(p.id, n).map((rs) => ({ v: mean(sg(rs, key)), n: sg(rs, key).length })).filter((x) => x.v !== null);
      return { p, vs: [...new Set(variants.map((x) => r2(x.v)))], v: variants[0]?.v ?? null, n: variants[0]?.n ?? 0 };
    })
    .filter((x) => x.v !== null)
    .sort((a, b) => b.v - a.v);
/** Every reading of a mean over the window (scores, GIR) across the tie-break. */
const readings = (pid, n, f) => [...new Set(lastNVariants(pid, n).map(f).filter((v) => v != null).map(r2))];
/** Cartesian choice of one reading per player, capped: the names that can be first or last, and the ranks a player can hold. */
function orderings(entries, dir) {
  const out = [];
  const walk = (i, picked) => {
    if (out.length > 200) return;
    if (i === entries.length) return void out.push(picked);
    for (const v of entries[i].vs.slice(0, 3)) walk(i + 1, [...picked, v]);
  };
  walk(0, []);
  return out.map((vals) => entries.map((e, i) => ({ e, v: vals[i] })).sort((a, b) => (dir === 'high' ? b.v - a.v : a.v - b.v)));
}

// Three-putts per round, from the holes themselves (not the stats cache).
const sepIds = real.filter(sinceSep1).map((r) => r.id);
const holes = sepIds.length ? must(await sb.from('golf_holes').select('round_id, putts').in('round_id', sepIds), 'holes') : [];
const threePutts = (roundId) => holes.filter((h) => h.round_id === roundId && (h.putts ?? 0) >= 3).length;

// ------------------------- the questions -------------------------

/**
 * Fact kinds:  number {value|anyOf, tol?, claim?}  /  text {value|anyOf}  /  date {iso}  /  phrase {re}
 * `claim`: a pattern whose first group is the figure the answer states for this fact; a different number there is `wrong`.
 */
function buildQuestions() {
  const cole = byName('Cole Bennett');
  const owen = byName('Owen Carter');
  const mason = byName('Mason Rivers');
  const tyler = byName('Tyler Hayes');
  const ethan = byName('Ethan Park');
  const audit = byName('Audit Testplayer');
  const sep = real.filter(sinceSep1);
  const sepDone = sep.filter((r) => r.status === 'completed');
  const q = [];

  // - counts -
  q.push({
    id: 'count-rounds-since-sep1', category: 'count', viewer: 'coach',
    ask: 'How many rounds has the team played since September 1?',
    facts: [
      { label: `rounds since Sep 1 (${sep.length} recorded, ${sepDone.length} finished)`, kind: 'number', anyOf: [sep.length, sepDone.length], claim: /(\d+)\s+(?:team\s+)?rounds/i },
      { label: `in progress (${sep.length - sepDone.length})`, kind: 'number', value: sep.length - sepDone.length, optional: true },
    ],
    note: 'Test-flagged rounds (9) are not the team\'s: counting them is wrong.',
  });
  const withRounds = roster.filter((p) => real.some((r) => r.player_id === p.id));
  q.push({
    id: 'count-players-with-rounds', category: 'count', viewer: 'coach',
    ask: 'How many players on my roster have recorded rounds, and who has none?',
    facts: [
      { label: `players with rounds (${withRounds.length} of ${roster.length})`, kind: 'number', value: withRounds.length, claim: /(\d+)\s+(?:of|out of)\s+(?:your\s+)?\d+/i },
      { label: 'roster size', kind: 'number', value: roster.length },
      { label: 'player with none', kind: 'text', value: audit.name },
    ],
  });
  const coleOct21 = real.filter((r) => r.player_id === cole.id && r.round_date === '2026-10-21');
  q.push({
    id: 'join-cole-oct21-rounds', category: 'join', viewer: 'coach',
    ask: 'List Cole Bennett\'s rounds on October 21 with the course and the score.',
    facts: [
      ...scores(coleOct21).map((s) => ({ label: `score ${s}`, kind: 'number', value: s })),
      { label: 'course', kind: 'text', value: coleOct21[0]?.course_name ?? 'Springfield Country Club' },
      { label: 'date', kind: 'date', iso: '2026-10-21' },
    ],
  });

  // - rankings -
  const putt = perPlayer(10, 'strokes_gained_putting');
  const bestPutters = [...new Set(orderings(putt, 'high').map((o) => o[0].e.p.name))];
  q.push({
    id: 'rank-best-putter', category: 'ranking', viewer: 'coach',
    ask: 'Who has the best strokes gained putting over the last 10 rounds, and what is the figure?',
    facts: [
      { label: `best: ${bestPutters.join(' or ')}`, kind: 'text', anyOf: bestPutters },
      { label: `their SG putting ${putt[0].vs.join(' / ')}`, kind: 'number', anyOf: putt[0].vs, tol: 0.02 },
    ],
    note: `Definition: each player's newest 10 finished, non-practice, non-test rounds; mean of the rounds that carry strokes gained putting.`,
  });
  const appr = perPlayer(10, 'strokes_gained_approach');
  q.push({
    id: 'rank-approach-sg', category: 'ranking', viewer: 'coach',
    ask: 'Rank the team by strokes gained approach over the last 10 rounds.',
    facts: [
      ...appr.map((x, i) => ({ label: `#${i + 1} ${x.p.name} ${x.vs.join(' / ')}`, kind: 'number', anyOf: x.vs, tol: 0.02 })),
      { label: 'best', kind: 'text', anyOf: [...new Set(orderings(appr, 'high').map((o) => o[0].e.p.name))] },
      { label: 'worst', kind: 'text', anyOf: [...new Set(orderings(appr, 'high').map((o) => o[o.length - 1].e.p.name))] },
    ],
  });
  const avgScore = roster
    .map((p) => ({ p, vs: readings(p.id, 10, (rs) => mean(scores(rs))) }))
    .filter((x) => x.vs.length)
    .map((x) => ({ ...x, v: x.vs[0] }))
    .sort((a, b) => a.v - b.v);
  const lowestNames = [...new Set(orderings(avgScore, 'low').map((o) => o[0].e.p.name))];
  q.push({
    id: 'rank-lowest-scoring-average', category: 'ranking', viewer: 'coach',
    ask: 'Who has the lowest scoring average over their last 10 rounds?',
    facts: [
      { label: `lowest: ${lowestNames.join(' or ')}`, kind: 'text', anyOf: lowestNames },
      { label: `average ${avgScore[0].vs.join(' / ')}`, kind: 'number', anyOf: avgScore[0].vs, tol: 0.35 },
    ],
    note: 'Stats may weight by holes; tolerance 0.35.',
  });

  // - joins / lists -
  const threeRounds = sep.filter((r) => threePutts(r.id) >= 3);
  q.push({
    id: 'join-three-putt-rounds', category: 'join', viewer: 'coach',
    ask: 'Which rounds since September 1 had three or more three-putts? List the player, date, course and score.',
    facts: [
      { label: `rounds listed (${threeRounds.length})`, kind: 'number', value: threeRounds.length, claim: /(?:^|\b)(\d+|two|three|one)\s+rounds?\b/i },
      ...threeRounds.map((r) => ({ label: `${roster.find((p) => p.id === r.player_id).name} ${r.round_date} score ${r.total_score}`, kind: 'number', value: r.total_score })),
      { label: 'player', kind: 'text', value: roster.find((p) => p.id === threeRounds[0]?.player_id)?.name ?? 'Cole Bennett' },
      { label: 'course', kind: 'text', value: threeRounds[0]?.course_name ?? 'Springfield Country Club' },
      { label: 'date', kind: 'date', iso: threeRounds[0]?.round_date ?? '2026-10-21' },
    ],
    forbid: roster.filter((p) => !threeRounds.some((r) => r.player_id === p.id)).map((p) => ({ label: `lists ${p.name}`, re: new RegExp(`${p.name}[^.\\n]{0,60}(?:three[- ]putt|3[- ]putt)`, 'i') })),
    note: 'Known case 1 (parent): only Cole Bennett, Oct 21, Springfield CC, 74 and 77.',
  });
  const best = [...sepDone].filter((r) => r.total_score != null && r.holes_played >= 18).sort((a, b) => a.total_score - b.total_score)[0];
  const bestNoPractice = [...sepDone].filter((r) => r.total_score != null && r.round_type !== 'practice').sort((a, b) => a.total_score - b.total_score)[0];
  q.push({
    id: 'join-best-round-since-sep1', category: 'join', viewer: 'coach',
    ask: 'What was the best single round since September 1, and who played it where?',
    facts: [
      { label: `best score ${best.total_score} (${bestNoPractice.total_score} if practice rounds are left out)`, kind: 'number', anyOf: [best.total_score, bestNoPractice.total_score] },
      { label: 'player', kind: 'text', anyOf: [roster.find((p) => p.id === best.player_id).name, roster.find((p) => p.id === bestNoPractice.player_id).name] },
      { label: 'course', kind: 'text', anyOf: [best.course_name, bestNoPractice.course_name] },
    ],
    note: 'Practice rounds are ambiguous: either reading counts.',
  });

  // - windows -
  const owen5 = readings(owen.id, 5, (rs) => mean(scores(rs)));
  q.push({
    id: 'window-owen-last5-average', category: 'window', viewer: 'coach',
    ask: 'What is Owen Carter\'s scoring average over his last 5 rounds?',
    facts: [{ label: `Owen last-5 average ${owen5.join(' / ')}`, kind: 'number', anyOf: owen5, tol: 0.25 }],
  });
  const masonSep = scores(scoring(mason.id).filter(sinceSep1));
  q.push({
    id: 'window-mason-since-sep1', category: 'window', viewer: 'coach',
    ask: 'What is Mason Rivers\'s scoring average since September 1?',
    facts: [
      { label: `Mason average since Sep 1 ${r2(mean(masonSep))}`, kind: 'number', value: r2(mean(masonSep)), tol: 0.05 },
      { label: `rounds (${masonSep.length})`, kind: 'number', value: masonSep.length, optional: true },
    ],
  });
  const tyler3 = lastN(tyler.id, 3);
  q.push({
    id: 'window-tyler-last3-rounds', category: 'window', viewer: 'coach',
    ask: 'Show Tyler Hayes\'s last 3 rounds with the score and course.',
    facts: [
      ...tyler3.map((r) => ({ label: `${r.round_date} score ${r.total_score}`, kind: 'number', value: r.total_score })),
      ...[...new Set(tyler3.map((r) => r.course_name))].map((c) => ({ label: `course ${c}`, kind: 'text', value: c })),
    ],
  });
  const coleAug = real.filter((r) => r.player_id === cole.id && r.round_date >= '2026-08-01');
  q.push({
    id: 'window-cole-rounds-since-aug1', category: 'window', viewer: 'coach',
    ask: 'How many rounds has Cole Bennett recorded since August 1?',
    facts: [{ label: `Cole since Aug 1: ${coleAug.length} recorded, ${coleAug.filter((r) => r.status === 'completed').length} finished`, kind: 'number', anyOf: [coleAug.length, coleAug.filter((r) => r.status === 'completed').length], claim: /(\d+)\s+(?:recorded\s+|finished\s+|completed\s+)?rounds/i }],
  });

  // - comparisons to level, team and Tour -
  const owenAppr = perPlayer(10, 'strokes_gained_approach').find((x) => x.p.id === owen.id);
  const lower = appr.filter((x) => x.v < owenAppr.v);
  const teamMean = mean(appr.map((x) => x.v));
  const owenGir = girPool(lastN(owen.id, 10));
  const owenRanks = [...new Set(orderings(appr, 'high').map((o) => o.findIndex((x) => x.e.p.id === owen.id) + 1))];
  const teamReadings = [...new Set([r2(teamMean), -2.33, ...orderings(appr, 'high').map((o) => r2(mean(o.map((x) => x.v))))])];
  q.push({
    id: 'compare-owen-approach', category: 'comparison', viewer: 'coach',
    ask: 'How does Owen Carter\'s approach play compare with his level, the team and the Tour over his last 10 rounds?',
    facts: [
      { label: `Owen SG approach ${owenAppr.vs.join(' / ')}`, kind: 'number', anyOf: owenAppr.vs, tol: 0.02, claim: /approach[^.\n]{0,80}?(-?\d+\.\d+)/i },
      { label: `rounds with data (${owenAppr.n})`, kind: 'number', value: owenAppr.n },
      { label: `team average (${teamReadings.filter((v) => v !== -2.33).join(' / ')} as the mean of the seven last-10 values, or -2.33 as the benchmark read prints)`, kind: 'number', anyOf: teamReadings, tol: 0.02 },
      { label: `lower than Owen: ${lower.map((x) => `${x.p.name} ${r2(x.v)}`).join(', ')}`, kind: 'text', anyOf: lower.map((x) => x.p.name) },
      { label: `Ethan value ${r2(lower[0]?.v)}`, kind: 'number', value: r2(lower[0]?.v), tol: 0.02 },
      { label: `Owen's rank, if the answer gives one (${owenRanks.join(' or ')} of ${appr.length})`, kind: 'number', anyOf: owenRanks, claim: /(\d+)(?:st|nd|rd|th)\s+of\s+\d+/i, optional: true },
      { label: `GIR ${r2(owenGir?.pct)}%`, kind: 'number', value: r2(owenGir?.pct), tol: 0.02 },
      { label: `GIR holes (${owenGir?.holes})`, kind: 'number', value: owenGir?.holes },
      { label: 'Tour baseline 0 / 66% GIR', kind: 'number', anyOf: [0, 66], optional: true },
    ],
    note: 'Known case 2 (parent). The team figure has two readings: the mean of the seven last-10 values, and the benchmark read\'s all-rounds -2.33; either is accepted.',
  });
  const colePutt = perPlayer(10, 'strokes_gained_putting');
  const coleRanks = [...new Set(orderings(colePutt, 'high').map((o) => o.findIndex((x) => x.e.p.id === cole.id) + 1))];
  const coleVs = colePutt.find((x) => x.p.id === cole.id).vs;
  q.push({
    id: 'compare-cole-putting-rank', category: 'comparison', viewer: 'coach',
    ask: 'How does Cole Bennett\'s putting compare with his teammates over his last 10 rounds? Give his strokes gained figure and where he ranks.',
    facts: [
      { label: `Cole SG putting ${coleVs.join(' / ')}`, kind: 'number', anyOf: coleVs, tol: 0.02 },
      { label: `rank ${coleRanks.join(' or ')} of ${colePutt.length}`, kind: 'number', anyOf: coleRanks, claim: /(\d+)(?:st|nd|rd|th)\b/i },
    ],
    note: 'Ranks under 13 are exempt from the grounding audit, so this is where a wrong rank would pass.',
  });
  const girs = roster.map((p) => ({ p, g: girPool(lastN(p.id, 10)) })).filter((x) => x.g);
  const masonGir = girs.find((x) => x.p.id === mason.id).g.pct;
  const teamGir = mean(girs.map((x) => x.g.pct));
  q.push({
    id: 'compare-mason-gir-team', category: 'comparison', viewer: 'coach',
    ask: 'Is Mason Rivers above or below the team average on greens in regulation over his last 10 rounds?',
    facts: [
      { label: `Mason GIR ${r2(masonGir)}%`, kind: 'number', value: r2(masonGir), tol: 0.15 },
      { label: `direction: ${masonGir >= teamGir ? 'above' : 'below'} the team (${r2(teamGir)}%)`, kind: 'phrase', re: masonGir >= teamGir ? /\b(above|higher|better|ahead|over)\b/i : /\b(below|lower|worse|behind|under|trails?)\b/i },
    ],
    note: 'Team average is the mean of the players\' pooled GIR; a pooled-by-holes team figure would differ slightly.',
  });

  // - empty data -
  q.push({
    id: 'empty-attendance-goals', category: 'empty', viewer: 'coach',
    ask: 'Show attendance and goal progress for the whole team.',
    facts: [
      { label: `attendance: none on record (${attendance.length} rows)`, kind: 'phrase', re: /\b(no|not any|nothing)\b[^.\n]{0,60}attendance|attendance[^.\n]{0,60}\b(empty|none|no record|not recorded|nothing)\b/i },
      { label: `goals: ${goals.length}`, kind: 'number', value: goals.length },
      { label: `Cole's goals (${goals.filter((g) => g.player_id === cole.id).length})`, kind: 'number', value: goals.filter((g) => g.player_id === cole.id).length, optional: true },
      { label: `Owen's goals (${goals.filter((g) => g.player_id === owen.id).length})`, kind: 'number', value: goals.filter((g) => g.player_id === owen.id).length, optional: true },
    ],
    forbid: [{ label: 'invents an attendance percentage', re: /attendance[^.\n]{0,40}\d{1,3}(?:\.\d+)?\s?%/i }],
    note: 'Known case 3 (parent): no attendance; 5 goals for Cole (2) and Owen (3).',
  });
  q.push({
    id: 'empty-audit-testplayer', category: 'empty', viewer: 'coach',
    ask: 'How did Audit Testplayer score in the last 5 rounds?',
    facts: [{ label: 'says there are no rounds', kind: 'phrase', re: /\b(no|zero|not any|hasn.t|has not|haven.t|nothing)\b[^.\n]{0,70}\b(rounds?|scores?|data|recorded|played)\b/i }],
    forbid: [{ label: 'invents scores', re: /\b(?:7\d|8\d|9\d)\b(?![^.\n]{0,20}(?:days?|players?|rounds?\b))/ }],
  });
  const ethan30 = real.filter((r) => r.player_id === ethan.id && r.round_date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  q.push({
    id: 'empty-ethan-last30days', category: 'empty', viewer: 'coach',
    ask: 'How many rounds has Ethan Park played in the last 30 days?',
    facts: [{ label: `Ethan rounds in the last 30 days (${ethan30.length})`, kind: 'phrase', re: ethan30.length === 0 ? /\b(no|zero|0|none|hasn.t|not any)\b/i : new RegExp(`\\b${ethan30.length}\\b`) }],
    note: `As of today; Ethan's newest round is ${real.find((r) => r.player_id === ethan.id)?.round_date}.`,
  });

  // - player viewer: Cole Bennett -
  const cole5 = readings(cole.id, 5, (rs) => mean(scores(rs)));
  q.push({
    id: 'player-my-last5-average', category: 'player', viewer: 'player',
    ask: 'What is my scoring average over my last 5 rounds?',
    facts: [{ label: `Cole last-5 average ${cole5.join(' / ')}`, kind: 'number', anyOf: cole5, tol: 0.25 }],
  });
  const coleOctPutts = coleOct21.reduce((a, r) => a + threePutts(r.id), 0);
  q.push({
    id: 'player-my-three-putts-oct21', category: 'player', viewer: 'player',
    ask: 'How many three-putts did I have in total on October 21?',
    facts: [{ label: `three-putts on Oct 21 (${coleOctPutts}: ${coleOct21.map((r) => `${r.total_score}->${threePutts(r.id)}`).join(', ')})`, kind: 'number', value: coleOctPutts }],
  });
  const coleSep = real.filter((r) => r.player_id === cole.id && sinceSep1(r));
  q.push({
    id: 'player-my-rounds-since-sep1', category: 'player', viewer: 'player',
    ask: 'How many rounds have I recorded since September 1?',
    facts: [{ label: `Cole since Sep 1: ${coleSep.length} recorded, ${coleSep.filter((r) => r.status === 'completed').length} finished`, kind: 'number', anyOf: [coleSep.length, coleSep.filter((r) => r.status === 'completed').length], claim: /(\d+)\s+(?:recorded\s+|finished\s+|completed\s+)?rounds/i }],
  });
  return q;
}

const questions = buildQuestions();
const only = flag('--only')?.split(',');
const picked = only ? questions.filter((x) => only.includes(x.id)) : questions;

if (argv.includes('--list')) {
  for (const x of questions) console.log(`${x.id.padEnd(34)} ${x.category.padEnd(11)} ${x.viewer}  ${x.ask}`);
  process.exit(0);
}

// ------------------------- cost estimate -------------------------

const history = must(
  await sb.from('golf_coachhelm_llm_calls').select('cost_usd').eq('task', 'coach_chat').gt('cost_usd', 0).order('created_at', { ascending: false }).limit(60),
  'ledger',
).map((r) => Number(r.cost_usd)).sort((a, b) => a - b);
const median = history.length ? history[Math.floor(history.length / 2)] : FALLBACK_TURN_COST_USD;
const p90 = history.length ? history[Math.floor(history.length * 0.9)] : FALLBACK_TURN_COST_USD * 2;

const base = flag('--base-url') ?? DEFAULT_BASE;
console.log(`staging ${ref}, team "${team.name}", ${roster.length} players, ${rounds.length} rounds (${rounds.length - real.length} test-flagged)`);
console.log(`\n${picked.length} questions (${picked.filter((x) => x.viewer === 'player').length} as the player):\n`);
for (const x of picked) {
  console.log(`- ${x.id} [${x.category}, ${x.viewer}] ${x.ask}`);
  for (const f of x.facts) console.log(`    expects ${f.label}${f.optional ? ' (optional)' : ''}`);
  for (const f of x.forbid ?? []) console.log(`    forbids ${f.label}`);
}
console.log(`\nCost estimate: ${picked.length} turns x about $${median.toFixed(2)} (median of ${history.length} past staging turns; p90 $${p90.toFixed(2)}) = about $${(picked.length * median).toFixed(2)}, up to $${(picked.length * p90).toFixed(2)}.`);
console.log(`Time estimate: ${Math.round((picked.length * 45) / 60)} to ${Math.round((picked.length * 90) / 60)} minutes (one question at a time).`);
console.log(`It uses the dev server at ${base} (must run on this staging env with Clubhouse on for the demo team) and writes staging conversation rows.`);
if (!cli.apply) {
  console.log('\n[dry-run] nothing was asked. Re-run with --apply to run it.');
  process.exit(0);
}

// ------------------------- sign in -------------------------

async function sessionCookie(userId, label) {
  const admin = sb.auth.admin;
  const user = (await admin.getUserById(userId)).data?.user;
  if (!user?.email) throw new Error(`${label}: no auth user with an email`);
  const link = await admin.generateLink({ type: 'magiclink', email: user.email });
  if (link.error) throw new Error(`${label}: ${link.error.message}`);
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session) throw new Error(`${label}: ${verified.error?.message ?? 'no session'}`);
  const jar = new Map();
  const ssr = createServerClient(url, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) } });
  await ssr.auth.setSession({ access_token: verified.data.session.access_token, refresh_token: verified.data.session.refresh_token });
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

const coaches = must(await sb.from('golf_coaches').select('id, user_id').eq('organization_id', team.organization_id), 'coaches');
const convCounts = await Promise.all(coaches.map(async (c) => ({ c, n: (await sb.from('golf_coachhelm_chat_conversations').select('id', { count: 'exact', head: true }).eq('coach_id', c.id)).count ?? 0 })));
const coach = convCounts.sort((a, b) => b.n - a.n)[0].c;
const coachCookie = flag('--cookie') ?? process.env.ASK_EVAL_COOKIE ?? (await sessionCookie(coach.user_id, 'coach'));
const wantsPlayer = picked.some((x) => x.viewer === 'player');
const playerCookie = wantsPlayer ? flag('--player-cookie') ?? process.env.ASK_EVAL_PLAYER_COOKIE ?? (await sessionCookie(byName('Cole Bennett').userId, 'player Cole Bennett')) : null;

// ------------------------- ask and score -------------------------

async function readStream(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  const state = newStreamState();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      applyStreamLine(state, buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  applyStreamLine(state, buffer);
  return state;
}

async function ledgerCost(viewerKey, id, since) {
  await new Promise((r) => setTimeout(r, 2500));
  const rows = must(await sb.from('golf_coachhelm_llm_calls').select('cost_usd, verified, citations').eq(viewerKey, id).gte('created_at', since).order('created_at', { ascending: false }).limit(5), 'ledger row');
  return { cost: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0), rows };
}

const report = [];
for (const question of picked) {
  const cookie = question.viewer === 'player' ? playerCookie : coachCookie;
  const startedAt = new Date();
  const t0 = Date.now();
  let verdict;
  let text = '';
  let note = '';
  let conversationId = null;
  let flagged = [];
  try {
    const res = await fetch(`${base}/api/coachhelm/v3/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: question.ask }] }], client_turn_id: randomUUID() }),
    });
    conversationId = res.headers.get('x-conversation-id');
    if (!res.ok) {
      note = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      verdict = 'error';
    } else {
      const streamed = await readStream(res);
      text = streamed.text;
      if (streamed.flag) {
        verdict = 'rejected';
        flagged = streamed.flag.unmatched_tokens ?? [];
      } else if (streamed.incomplete || streamed.error) {
        verdict = 'incomplete';
        note = streamed.error ?? '';
      } else verdict = 'accepted';
    }
  } catch (err) {
    verdict = 'error';
    note = err instanceof Error ? err.message : String(err);
  }
  const seconds = (Date.now() - t0) / 1000;

  // A coach's rejected or broken turn keeps the text it would have shown, in the stored row.
  if (question.viewer === 'coach' && conversationId && verdict !== 'accepted' && verdict !== 'error') {
    const row = must(await sb.from('golf_coachhelm_chat_messages').select('content, ui_parts').eq('conversation_id', conversationId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1), 'stored turn')[0];
    if (row?.content) text = row.content.replace(/\n*_Some figures[\s\S]*$/, '');
    const flag = (row?.ui_parts ?? []).find((p) => p?.type === 'data-grounding-flag');
    if (flag?.data?.unmatched_tokens) flagged = flag.data.unmatched_tokens;
  }
  // A player's answer is never withheld; the ledger says whether the audit found anything.
  let cost = 0;
  try {
    const ledger = await ledgerCost(question.viewer === 'player' ? 'player_id' : 'coach_id', question.viewer === 'player' ? byName('Cole Bennett').id : coach.id, startedAt.toISOString());
    cost = ledger.cost;
    if (question.viewer === 'player' && ledger.rows[0] && ledger.rows[0].verified === false) {
      verdict = 'rejected';
      flagged = ledger.rows[0].citations?.unmatched_tokens ?? [];
    }
  } catch (err) {
    note += ` ledger: ${err instanceof Error ? err.message : err}`;
  }
  const scored = verdict === 'error' ? null : score(question, text);
  report.push({ question, verdict, text, flagged, seconds, cost, scored, note });
  console.log(`${verdict.padEnd(10)} ${question.id}  correct ${scored?.correct ?? '-'} wrong ${scored?.wrong ?? '-'} missing ${scored?.missing ?? '-'}  ${seconds.toFixed(1)}s  $${cost.toFixed(3)}`);
}

// ------------------------- report -------------------------

const count = (fn) => report.filter(fn).length;
const wrongRejections = report.filter((r) => r.verdict === 'rejected' && r.scored?.allRight);
const wrongAccepts = report.filter((r) => r.verdict === 'accepted' && r.scored && !r.scored.allRight);
const lines = [];
lines.push(`# Ask evaluation, ${new Date().toISOString()}`, '');
lines.push(`Server ${base}, staging ${ref}, team ${team.name}. ${report.length} questions, total cost $${report.reduce((a, r) => a + r.cost, 0).toFixed(2)}, total time ${report.reduce((a, r) => a + r.seconds, 0).toFixed(0)}s.`, '');
lines.push(`Verdicts: accepted ${count((r) => r.verdict === 'accepted')}, rejected ${count((r) => r.verdict === 'rejected')}, incomplete ${count((r) => r.verdict === 'incomplete')}, error ${count((r) => r.verdict === 'error')}.`);
lines.push(`Fully right answers: ${count((r) => r.scored?.allRight)} of ${report.length}. Wrong rejections (rejected, every fact right): ${wrongRejections.length}. Accepted but not fully right: ${wrongAccepts.length}.`, '');
lines.push('| Question | Category | Viewer | Verdict | Correct | Wrong | Missing | Time | Cost |', '|---|---|---|---|---|---|---|---|---|');
for (const r of report) lines.push(`| ${r.question.id} | ${r.question.category} | ${r.question.viewer} | ${r.verdict} | ${r.scored?.correct ?? '-'} | ${r.scored?.wrong ?? '-'} | ${r.scored?.missing ?? '-'} | ${r.seconds.toFixed(1)}s | $${r.cost.toFixed(3)} |`);
if (wrongRejections.length) {
  lines.push('', '## Wrong rejections', '');
  for (const r of wrongRejections) lines.push(`- ${r.question.id}: flagged ${JSON.stringify(r.flagged)}`);
}
if (wrongAccepts.length) {
  lines.push('', '## Accepted but not fully right', '');
  for (const r of wrongAccepts) lines.push(`- ${r.question.id}: ${r.scored.results.filter((x) => x.status !== 'correct' && !x.optional).map((x) => `${x.status} ${x.label}${x.detail ? ` (${x.detail})` : ''}`).join('; ')}`);
}
lines.push('', '## Per question', '');
for (const r of report) {
  lines.push(`### ${r.question.id} (${r.verdict})`, '', `Q: ${r.question.ask}`, '');
  if (r.question.note) lines.push(`Note: ${r.question.note}`, '');
  if (r.note) lines.push(`Run note: ${r.note}`, '');
  if (r.flagged.length) lines.push(`Audit flagged: ${JSON.stringify(r.flagged)}`, '');
  for (const x of r.scored?.results ?? []) lines.push(`- ${x.status}${x.optional ? ' (optional)' : ''}: ${x.label}${x.detail ? ` [${x.detail}]` : ''}`);
  lines.push('', '> ' + (r.text.trim().replace(/\n/g, '\n> ') || '(no text)'), '');
}
const out = flag('--out') ?? join(tmpdir(), 'ask-eval', `ask-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`\nreport: ${out}`);
