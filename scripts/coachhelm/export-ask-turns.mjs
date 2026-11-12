/**
 * Exports stored CoachHelm Ask turns from STAGING to JSON fixtures for the offline replay suite
 * (src/lib/coachhelm/v3/chat/__tests__/ask-replay.test.ts).
 *
 *   node scripts/coachhelm/export-ask-turns.mjs            dry run: lists what it would write
 *   node scripts/coachhelm/export-ask-turns.mjs --apply    writes one JSON file per turn
 *
 * READ-ONLY toward the database: it only selects. The only thing --apply writes is local fixture files.
 * It refuses to run unless NEXT_PUBLIC_SUPABASE_URL is the staging project, and never prints a credential.
 *
 * What a fixture keeps: the coach's message and the turn's own evidence (the `data-evidence` envelopes the route
 * audited the answer against), the stored answer text, the recorded verdict, the roster and the team zone, and the
 * earlier messages of the same conversation (the route seeds the audit from them). Tool inputs are kept, tool
 * outputs are not (they repeat the envelopes). What it drops: every other part type, and any turn that mentions a
 * person who is not on the demo roster, so no personal data beyond the demo team's own names is written.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { cliGuard, skipWrite } from '../lib/cli-guard.mjs';
import { citesFromLog } from './ask-eval-score.mjs';
import { fetchAllRows } from './fetch-all-rows.mjs';

const STAGING_REF = 'ybmwektreyrwjscxlogv';
const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, 'src/lib/coachhelm/v3/chat/__tests__/fixtures/ask-turns');

const cli = cliGuard({
  name: 'scripts/coachhelm/export-ask-turns.mjs',
  summary:
    'Export stored CoachHelm Ask turns (golf_coachhelm_chat_messages) from the staging demo team to JSON fixtures for the offline replay suite. Read-only against the database; --apply only writes local files.',
  usage: '[--team <uuid>] [--out <dir>] [--since <YYYY-MM-DD>] [--cites-log <file>] [--prune]',
  options: [
    ['--team <uuid>', `Team whose coaches’ conversations to export (default: Demo University Golf, ${DEMO_TEAM_ID}).`],
    ['--out <dir>', 'Fixture directory (default: src/lib/coachhelm/v3/chat/__tests__/fixtures/ask-turns).'],
    ['--since <date>', 'Only turns created on or after this date.'],
    ['--cites-log <file>', "A dev server log with [ask:cites] lines: a turn they match (by conversation id and the answer's first 60 characters) is exported with its cites, so it replays cited, as in production. Cites already in an existing fixture file are kept."],
    ['--prune', 'With --apply: delete fixture files in --out that this export no longer produces. Labels are never touched.'],
  ],
  writes: true,
  secrets: '.env.local in the current directory (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); staging only',
});

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const teamId = flag('--team') ?? DEMO_TEAM_ID;
const outDir = resolve(flag('--out') ?? DEFAULT_OUT);
const since = flag('--since');
const citesLog = flag('--cites-log') ? readFileSync(resolve(flag('--cites-log')), 'utf8') : null;

config({ path: join(process.cwd(), '.env.local'), quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ref = url ? new URL(url).hostname.split('.')[0] : '';
if (ref !== STAGING_REF || !key) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL must be the staging project (${STAGING_REF}) and a service key must be set. Got project "${ref || 'none'}".`);
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data ?? [];
};

const team = must(await sb.from('golf_teams').select('id, name, timezone, organization_id').eq('id', teamId), 'team')[0];
if (!team) throw new Error(`team ${teamId} not found`);

const members = must(await sb.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status', 'active'), 'members');
const profiles = must(await sb.from('golf_players').select('id, first_name, last_name, graduation_year').in('id', members.map((m) => m.player_id)), 'players');
const roster = members.map((m) => {
  const p = profiles.find((x) => x.id === m.player_id);
  const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
  return { id: m.player_id, name: name || 'Unnamed player', first_name: p?.first_name ?? null, last_name: p?.last_name ?? null };
});
const rosterNames = new Set(roster.map((p) => p.name));
// Every other person in staging: a turn that names one of them (in a question, an answer or an earlier message) is left out.
// This list is the privacy filter, so it must be ALL of them: read in pages, in primary-key order. One request returns at most
// 1,000 rows whatever limit it asks for, and a list cut there would let everyone past the cut through.
const everyone = await fetchAllRows((from, to) => sb.from('golf_players').select('first_name, last_name').order('id', { ascending: true }).range(from, to), 'all players');
const outsiders = [...new Set(everyone.map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().toLowerCase()))].filter((n) => n.includes(' ') && n.length > 6 && !rosterNames.has(n) && ![...rosterNames].some((r) => r.toLowerCase() === n));

const coaches = must(await sb.from('golf_coaches').select('id').eq('organization_id', team.organization_id), 'coaches');
const convs = must(await sb.from('golf_coachhelm_chat_conversations').select('id').in('coach_id', coaches.map((c) => c.id)), 'conversations');
// In pages too: past 1,000 messages a single request would drop the newest turns without saying so. `id` breaks ties in created_at,
// so a page boundary cannot repeat or skip a row.
const msgs = await fetchAllRows(
  (from, to) =>
    sb
      .from('golf_coachhelm_chat_messages')
      .select('id, conversation_id, role, status, created_at, content, ui_parts, cost_usd')
      .in('conversation_id', convs.map((c) => c.id))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  'messages',
);

/** Part types the replay models. Anything else (proposals, receipts, artifacts) feeds the audit through paths the fixture cannot carry. */
const KEPT = new Set(['data-evidence', 'data-progress', 'data-visual-composition', 'data-grounding-flag', 'data-turn-incomplete', 'step-start', 'custom', 'text', 'reasoning']);

const nameKeys = /^(?:name|player_name|full_name)$/i;
const emailLike = /[\w.+-]+@[\w-]+\.[\w.]+/;

/** A reason to leave a turn out, or null. */
function personalDataProblem(envelopes) {
  const problems = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string') {
        if (nameKeys.test(k) && !rosterNames.has(x)) problems.add(`${k}=${x}`);
        if (emailLike.test(x)) problems.add('email');
      } else walk(x);
    }
  };
  for (const e of envelopes) {
    for (const m of [...(e.measurements ?? []), ...(e.series ?? [])]) {
      if (m.entity?.kind === 'player' && !rosterNames.has(m.entity.label)) problems.add(`entity=${m.entity.label}`);
      if (m.entity?.kind === 'team' && m.entity.label !== team.name) problems.add(`team=${m.entity.label}`);
    }
    walk(e.detail);
    if (e.detail && typeof e.detail === 'object' && typeof e.detail.team_name === 'string' && e.detail.team_name !== team.name) problems.add(`team_name=${e.detail.team_name}`);
  }
  return problems.size ? [...problems].slice(0, 4).join(', ') : null;
}

const byConv = new Map();
for (const m of msgs) {
  if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []);
  byConv.get(m.conversation_id).push(m);
}
/** The cites an earlier export already holds for this file: a re-export without the log must not lose them. */
const keptCites = (file) => {
  try {
    return existsSync(join(outDir, file)) ? JSON.parse(readFileSync(join(outDir, file), 'utf8')).turn?.cites : undefined;
  } catch {
    return undefined;
  }
};

const evidenceOf = (m) =>
  (Array.isArray(m.ui_parts) ? m.ui_parts : []).filter((p) => p?.type === 'data-evidence' && p.data?.envelope).map((p) => ({ tool: p.data.tool, ref: p.data.ref ?? null, envelope: p.data.envelope }));

const fixtures = [];
const skipped = [];
const seen = new Set();
for (const [convId, ms] of byConv) {
  for (let i = 0; i < ms.length; i += 1) {
    const m = ms[i];
    if (m.role !== 'assistant') continue;
    const tag = `${m.id.slice(0, 8)} ${m.created_at.slice(0, 10)}`;
    if (since && m.created_at < since) continue;
    if (m.status !== 'complete' && m.status !== 'failed') { skipped.push(`${tag} legacy row (status ${m.status})`); continue; }
    const parts = Array.isArray(m.ui_parts) ? m.ui_parts : [];
    const content = (m.content ?? '').trim();
    if (!content) { skipped.push(`${tag} no text to audit`); continue; }
    const odd = parts.map((p) => p?.type).filter((t) => typeof t === 'string' && !t.startsWith('tool-') && !KEPT.has(t));
    if (odd.length) { skipped.push(`${tag} has parts the replay cannot model (${[...new Set(odd)].join(', ')})`); continue; }
    const user = [...ms.slice(0, i)].reverse().find((x) => x.role === 'user');
    if (!user) { skipped.push(`${tag} no user message`); continue; }

    const evidence = evidenceOf(m);
    const prior = ms.slice(Math.max(0, i - 40), i);
    const priorEvidence = prior.filter((x) => x.role === 'assistant').slice(-5).flatMap(evidenceOf).map((e) => e.envelope);
    const problem = personalDataProblem([...evidence.map((e) => e.envelope), ...priorEvidence]);
    if (problem) { skipped.push(`${tag} not demo-roster data (${problem})`); continue; }
    const texts = [user.content, ...prior.map((x) => x.content ?? ''), content].join('\n');
    if (emailLike.test(texts)) { skipped.push(`${tag} text contains an email address`); continue; }
    const lowered = texts.toLowerCase();
    const outsider = outsiders.find((n) => lowered.includes(n));
    if (outsider) { skipped.push(`${tag} names someone outside the demo roster`); continue; }

    const dedupe = createHash('sha1').update(JSON.stringify([user.content, content, evidence.map((e) => e.envelope)])).digest('hex');
    if (seen.has(dedupe)) { skipped.push(`${tag} duplicate of an earlier export`); continue; }
    seen.add(dedupe);

    const flagPart = parts.find((p) => p?.type === 'data-grounding-flag' || p?.type === 'data-turn-incomplete');
    const recorded =
      m.status === 'complete'
        ? { outcome: 'accepted' }
        : {
            outcome: 'rejected',
            reason: flagPart?.data?.reason ?? (flagPart?.type === 'data-turn-incomplete' ? 'stream_incomplete' : 'unknown'),
            unmatchedTokens: flagPart?.data?.unmatched_tokens ?? [],
            misattributedTokens: flagPart?.data?.misattributed_tokens ?? [],
          };
    const file = `${m.created_at.slice(0, 10)}-${m.id.slice(0, 8)}.json`;
    const cites = (citesLog ? citesFromLog(citesLog, content, 'coach', convId) : null) ?? keptCites(file);
    fixtures.push({
      file,
      body: {
        id: m.id.slice(0, 8),
        messageId: m.id,
        source: { project: 'staging', team: team.name, exportedBy: 'scripts/coachhelm/export-ask-turns.mjs' },
        timezone: team.timezone,
        roster,
        userMessage: { content: user.content, createdAt: user.created_at },
        priorMessages: prior.map((x) => ({
          role: x.role,
          createdAt: x.created_at,
          content: x.content ?? '',
          evidence: x.role === 'assistant' ? evidenceOf(x).map((e) => e.envelope) : [],
        })),
        turn: {
          createdAt: m.created_at,
          status: m.status,
          costUsd: m.cost_usd ?? null,
          content,
          tools: parts
            .filter((p) => typeof p?.type === 'string' && p.type.startsWith('tool-'))
            .map((p) => ({ name: p.type.slice(5), input: p.input ?? null })),
          evidence,
          ...(cites ? { cites } : {}),
          recorded,
        },
      },
    });
  }
}

fixtures.sort((a, b) => a.file.localeCompare(b.file));
console.log(`staging project ${ref}, team "${team.name}" (${roster.length} active players, ${team.timezone}), ${msgs.length} messages in ${convs.length} conversations`);
console.log(`\n${fixtures.length} turns to export:`);
for (const f of fixtures) {
  const t = f.body.turn;
  console.log(`  ${f.file}  ${t.recorded.outcome}${t.recorded.reason ? `:${t.recorded.reason}` : ''}  ev=${t.evidence.length}${t.cites ? `  cites=${t.cites.length}` : ''}  "${f.body.userMessage.content.replace(/\s+/g, ' ').slice(0, 60)}"`);
}
console.log(`\n${skipped.length} turns left out:`);
for (const s of skipped) console.log(`  ${s}`);

if (!skipWrite(cli, `write ${fixtures.length} fixture files to ${outDir}`)) {
  mkdirSync(outDir, { recursive: true });
  for (const f of fixtures) writeFileSync(join(outDir, f.file), `${JSON.stringify(f.body, null, 1)}\n`);
  let pruned = 0;
  if (argv.includes('--prune')) {
    const keep = new Set(fixtures.map((f) => f.file));
    for (const name of readdirSync(outDir)) {
      if (name.endsWith('.json') && !keep.has(name)) {
        rmSync(join(outDir, name));
        pruned += 1;
      }
    }
  }
  console.log(`\nwrote ${fixtures.length} files to ${outDir}${pruned ? `, pruned ${pruned}` : ''}`);
}
