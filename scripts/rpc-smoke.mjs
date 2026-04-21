// Probes the new RPCs against Helm-Production.
// Uses anon key: expect Forbidden (42501) from the security guards.
// Uses service role: service_role bypasses RLS BUT auth.uid() returns null,
//   so our guards also return 'Forbidden' — that's the expected outcome
//   and still proves the functions exist with the right signatures.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('/Users/ricknini/Downloads/helmv3/.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const anonClient = createClient(url, anon);

// Random uuid; auth check should reject before the body runs
const fake = '00000000-0000-0000-0000-000000000000';

const tests = [
  ['get_admin_dashboard_rollup',     {}],
  ['get_coach_today_schedule',       { p_team_id: fake, p_today_start: new Date(0).toISOString(), p_today_end: new Date().toISOString() }],
  ['get_player_hub_announcements',   { p_team_id: fake, p_player_id: fake }],
  ['get_player_hub_events',          { p_team_id: fake, p_player_id: fake, p_since: new Date(0).toISOString() }],
];

console.log('Probing 4 new RPCs via anon key...');
console.log('Expecting: Forbidden (42501) for all — proves functions exist + guards work.\n');

for (const [name, args] of tests) {
  const { error } = await anonClient.rpc(name, args);
  if (!error) {
    console.log(`  ${name}: no error returned (unexpected — should have rejected)`);
    continue;
  }
  const code = error.code ?? '(no code)';
  const msg = (error.message || '').slice(0, 80);
  const ok = code === '42501' || msg.toLowerCase().includes('forbidden') || msg.includes('not authen');
  console.log(`  ${ok ? '✓' : '✗'} ${name}: ${code} — ${msg}`);
}
