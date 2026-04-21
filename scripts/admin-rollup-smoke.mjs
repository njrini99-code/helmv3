// Smoke test for the 8 admin rollup RPCs (slices A/B/C + existing admin rollup + existing platform health).
// Anon key: expect 42501 Forbidden on all (admin guard rejects). Proves functions exist with expected signatures.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('/Users/ricknini/Downloads/helmv3/.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
);

const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const now = new Date();
const iso = (d) => d.toISOString();
const ago = (days) => iso(new Date(now.getTime() - days * 86400_000));

const tests = [
  ['get_admin_rounds_rollup',           { p_today: iso(now), p_ago24h: ago(1), p_ago7d: ago(7), p_ago14d: ago(14), p_ago30d: ago(30), p_ago60d: ago(60), p_ago12w: ago(84) }],
  ['get_admin_users_rollup',            { p_ago7d: ago(7), p_ago14d: ago(14), p_ago30d: ago(30), p_ago12w: ago(84) }],
  ['get_admin_feature_adoption_rollup', { p_ago30d: ago(30) }],
  ['get_admin_coachhelm_rollup',        { p_ago7d: ago(7), p_ago30d: ago(30), p_ago12w: ago(84) }],
  ['get_admin_baseball_rollup',         { p_ago30d: ago(30) }],
  ['get_admin_errors_rollup',           { p_ago7d: ago(7), p_ago24h: ago(1) }],
  ['get_admin_teams_scoring_rollup',    { p_ago7d: ago(7) }],
  ['get_admin_analytics_rollup',        { p_ago7d: ago(7), p_ago30d: ago(30), p_ago12w: ago(84) }],
];

console.log('Probing 8 new admin rollup RPCs via anon key.');
console.log('Expecting: 42501 Forbidden on all — proves functions exist + admin gates work.\n');

let passed = 0;
for (const [name, args] of tests) {
  const { error } = await anon.rpc(name, args);
  const code = error?.code ?? '(no code)';
  const msg = (error?.message || '').slice(0, 80);
  const ok = code === '42501' || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('permission denied');
  console.log(`  ${ok ? '✓' : '✗'} ${name}: ${code} — ${msg}`);
  if (ok) passed++;
}
console.log(`\n${passed}/${tests.length} passed.`);
process.exit(passed === tests.length ? 0 : 1);
