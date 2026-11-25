#!/usr/bin/env node
/**
 * Send a GolfHelm head coach the Locker welcome email: their username, a temporary password, one code per team and
 * how players join (owner, 2026-11-25: temporary password, script now, an admin button later).
 *
 * A dry run unless --send: nothing is written and nothing is emailed. --preview-to sends the rendered email to you
 * (the password shows as a placeholder) without touching any account.
 *
 *   node scripts/golf/send-coach-welcome.mjs --env staging|production --coach-email <email> [options]
 *
 * Two cases:
 *   1. The coach already has a program (a coach row and head-coach staff rows). Their teams' codes are read live.
 *      Sending a password means replacing theirs, so --reset-password is required with --send.
 *   2. No account yet. The script sets the program up first, the same rows the app's coach onboarding writes:
 *      the login (email confirmed, role coach), the organization, the coach profile, one team per --teams entry with
 *      a fresh join code, and a head-coach staff row per team. Any failure rolls back what this run created.
 *      Needs --school, --first-name, --last-name and --teams mens,womens (or one of them).
 *
 * Options:
 *   --env staging|production   which Supabase project (keys come from the Supabase CLI login, never a file)
 *   --coach-email <email>      the coach's login email (also where the email goes)
 *   --first-name, --last-name  the coach's name (new account); the headline says "Coach <last name>"
 *   --school <name>            the school (new account), e.g. "Riverbend University"
 *   --teams mens,womens        which teams to create (new account)
 *   --division <text>          optional, stored on the organization (new account)
 *   --reset-password           existing account: replace their password with the temporary one
 *   --current-password         existing account: email the password they already have, read from the
 *                              COACH_PASSWORD environment variable (never an argument). It is checked by
 *                              signing in, and the account is not changed.
 *   --preview-to <email>       send a preview there instead (no account changes, placeholder password)
 *   --html-out <path>          also write the rendered HTML to this file
 *   --send                     do it: write, then email the coach
 *
 * The temporary password is never printed; it is only in the email. If the email fails after a write, the output
 * says so and the run can be repeated with --reset-password.
 */
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildCoachWelcomeEmail, HERO_CID, MARK_CID, orderTeams } from './coach-welcome/template.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
export const PROJECTS = { production: 'qmnssrrolpinvwjjnufo', staging: 'ybmwektreyrwjscxlogv' };
// The owner's real inbox (notifications@ has no mailbox), so a coach's reply reaches a person.
const FROM = 'GolfHelm <admin@helmsportslabs.com>';
const REPLY_TO = 'admin@helmsportslabs.com';
const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // generateJoinCode's: no I, O, 0 or 1
const WORDS = ['Birdie', 'Fairway', 'Eagle', 'Wedge', 'Putter', 'Bunker', 'Albatross', 'Driver', 'Links', 'Tee', 'Green', 'Caddie', 'Mashie', 'Niblick', 'Spoon', 'Brassie'];

export function parseArgs(argv) {
  const a = { teams: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = () => {
      const val = argv[++i];
      if (val === undefined || val.startsWith('--')) throw new Error(`${k} needs a value`);
      return val;
    };
    if (k === '--env') a.env = v();
    else if (k === '--coach-email') a.email = v().trim().toLowerCase();
    else if (k === '--first-name') a.firstName = v().trim();
    else if (k === '--last-name') a.lastName = v().trim();
    else if (k === '--school') a.school = v().trim();
    else if (k === '--teams') a.teams = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--division') a.division = v().trim();
    else if (k === '--preview-to') a.previewTo = v().trim();
    else if (k === '--html-out') a.htmlOut = v();
    else if (k === '--reset-password') a.resetPassword = true;
    else if (k === '--current-password') a.currentPassword = true;
    else if (k === '--send') a.send = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

/** Meets sign-up's password rules (upper, lower, a number, a symbol, 8+), and reads aloud. */
export function temporaryPassword(pick = randomInt) {
  const w1 = WORDS[pick(WORDS.length)];
  let w2 = WORDS[pick(WORDS.length)];
  if (w2 === w1) w2 = WORDS[(WORDS.indexOf(w1) + 1) % WORDS.length];
  return `${w1}-${w2}-${10 + pick(90)}!`;
}

export function joinCode(pick = randomInt) {
  let s = '';
  for (let i = 0; i < 8; i += 1) s += JOIN_ALPHABET[pick(JOIN_ALPHABET.length)];
  return s;
}

/** onboarding's getCurrentSeason: the academic year starts in August. */
export function currentSeason(now = new Date()) {
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

function serviceKey(ref) {
  const cli = join(REPO, 'node_modules/.bin/supabase');
  const out = execFileSync(cli, ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = JSON.parse(out).find((k) => k.name === 'service_role')?.api_key;
  if (!key) throw new Error(`no service_role key for ${ref} (is the Supabase CLI signed in?)`);
  return key;
}

/** RESEND_API_KEY from the environment, else the canonical checkout's env files (values never printed). */
function resendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
  const canonical = dirname(common);
  for (const f of ['.env.production.local', '.env.local']) {
    const p = join(canonical, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^RESEND_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '').replace(/\\n$/, '').trim();
  }
  throw new Error('RESEND_API_KEY not found');
}

function attachments() {
  const dir = join(HERE, 'coach-welcome/assets');
  return [
    { filename: 'locker.jpg', content: readFileSync(join(dir, 'locker-hero.jpg')), contentId: HERO_CID, contentType: 'image/jpeg' },
    { filename: 'helm.png', content: readFileSync(join(dir, 'helm-mark.png')), contentId: MARK_CID, contentType: 'image/png' },
  ];
}

/** ilike with its wildcards escaped, so an underscore in an address matches only an underscore. */
export const likeExact = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const step = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);

/** The coach's current program: coach row, the teams they head, and the organization's name. */
async function findProgram(db, email) {
  const { data: u, error: ue } = await db.from('users').select('id, email, role').ilike('email', likeExact(email)).maybeSingle();
  if (ue) throw new Error(`users lookup failed: ${ue.message}`);
  if (!u) return { user: null };
  const { data: coach, error: ce } = await db.from('golf_coaches').select('id, full_name, organization_id').eq('user_id', u.id).maybeSingle();
  if (ce) throw new Error(`coach lookup failed: ${ce.message}`);
  if (!coach) return { user: u, coach: null };
  const { data: staff, error: se } = await db
    .from('golf_team_coach_staff')
    .select('role, team:golf_teams(id, name, gender, join_code, organization_id)')
    .eq('coach_id', coach.id)
    .eq('role', 'head_coach');
  if (se) throw new Error(`staff lookup failed: ${se.message}`);
  const teams = (staff ?? []).map((s) => s.team).filter(Boolean);
  let school = null;
  if (coach.organization_id) {
    const { data: org } = await db.from('organizations').select('name').eq('id', coach.organization_id).maybeSingle();
    school = org?.name ?? null;
  }
  return { user: u, coach, teams: orderTeams(teams), school };
}

/** The rows the app's coach onboarding writes, made with the service role, rolled back on any failure. */
async function provision(db, a, password) {
  const made = { userId: null, orgId: null, coachId: null, teamIds: [] };
  const rollback = async (why) => {
    for (const id of made.teamIds) await db.from('golf_teams').delete().eq('id', id);
    if (made.coachId) await db.from('golf_coaches').delete().eq('id', made.coachId);
    if (made.orgId) await db.from('organizations').delete().eq('id', made.orgId);
    if (made.userId) {
      await db.auth.admin.deleteUser(made.userId);
      await db.from('users').delete().eq('id', made.userId);
    }
    throw new Error(`${why} (everything this run created was removed)`);
  };
  const fullName = `${a.firstName} ${a.lastName}`;
  const { data: cu, error: cuErr } = await db.auth.admin.createUser({
    email: a.email,
    password,
    email_confirm: true,
    user_metadata: { role: 'coach', first_name: a.firstName, last_name: a.lastName, full_name: fullName },
  });
  if (cuErr || !cu?.user) throw new Error(`could not create the login: ${cuErr?.message ?? 'no user returned'}`);
  made.userId = cu.user.id;
  const { error: roleErr } = await db.from('users').update({ role: 'coach' }).eq('id', made.userId);
  if (roleErr) await rollback(`could not set the account's role: ${roleErr.message}`);

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({ name: a.school, type: 'college', division: a.division ?? null })
    .select('id')
    .single();
  if (orgErr || !org) await rollback(orgErr?.code === '23505' ? `${a.school} is already on Helm` : `could not create the organization: ${orgErr?.message}`);
  made.orgId = org.id;

  const { data: coach, error: coachErr } = await db
    .from('golf_coaches')
    .insert({ user_id: made.userId, organization_id: org.id, full_name: fullName, title: 'Head Coach', email: a.email, onboarding_completed: true })
    .select('id')
    .single();
  if (coachErr || !coach) await rollback(`could not create the coach profile: ${coachErr?.message}`);
  made.coachId = coach.id;

  const teams = [];
  for (const gender of a.teams) {
    const name = `${a.school} ${gender === 'mens' ? 'Men’s' : 'Women’s'} Golf`;
    let team = null;
    for (let attempt = 0; attempt < 5 && !team; attempt += 1) {
      const code = joinCode();
      const { data, error } = await db
        .from('golf_teams')
        .insert({ organization_id: org.id, name, season: currentSeason(), join_code: code, created_by: coach.id, gender })
        .select('id, name, gender, join_code')
        .single();
      if (!error) team = data;
      else if (error.code !== '23505') await rollback(`could not create ${name}: ${error.message}`);
    }
    if (!team) await rollback(`could not find a free join code for ${name}`);
    made.teamIds.push(team.id);
    const { error: staffErr } = await db.from('golf_team_coach_staff').insert({ team_id: team.id, coach_id: coach.id, role: 'head_coach', is_primary: true });
    if (staffErr) await rollback(`could not make the coach head coach of ${name}: ${staffErr.message}`);
    teams.push(team);
  }
  return { teams: orderTeams(teams), school: a.school };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || !a.env || !a.email) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split("\n").slice(2, 35).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
    process.exit(a.help ? 0 : 1);
  }
  const ref = PROJECTS[a.env];
  if (!ref) throw new Error('--env must be staging or production');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) throw new Error('--coach-email is not an email address');
  for (const t of a.teams) if (!['mens', 'womens'].includes(t)) throw new Error(`--teams takes mens and/or womens, not "${t}"`);
  if (new Set(a.teams).size !== a.teams.length) throw new Error('--teams lists a team twice');
  if (a.send && a.previewTo) throw new Error('--send and --preview-to are separate runs: preview first, then send');
  if (a.currentPassword && a.resetPassword) throw new Error('--current-password and --reset-password are opposites: pick one');
  if (a.currentPassword && !process.env.COACH_PASSWORD) throw new Error('--current-password reads COACH_PASSWORD from the environment, and it is not set');

  const db = createClient(`https://${ref}.supabase.co`, serviceKey(ref), { auth: { persistSession: false } });
  console.log(`Supabase: ${a.env} (${ref})`);
  const found = await findProgram(db, a.email);

  let mode;
  if (found.coach && found.teams.length) mode = 'existing';
  else if (found.user) {
    throw new Error(
      found.coach
        ? `${a.email} has a coach profile but heads no team. Set the program up in the app first.`
        : `${a.email} already has a login but no coach profile (role ${found.user.role ?? 'none'}). Not changing it.`,
    );
  } else mode = 'new';
  if (mode === 'new' && a.currentPassword) throw new Error('--current-password needs an existing login; this email has none');

  let lastName = a.lastName;
  if (mode === 'existing') {
    lastName ||= (found.coach.full_name ?? '').trim().split(/\s+/).pop();
    if (!lastName) throw new Error('the coach profile has no name: pass --last-name');
    console.log(`Existing program: ${found.school ?? '(no organization name)'}, ${found.teams.length} team(s): ${found.teams.map((t) => `${t.name} ${t.join_code}`).join(', ')}`);
    if (a.send && !a.resetPassword && !a.currentPassword) throw new Error('this coach already has a password. Add --current-password (COACH_PASSWORD) to email the one they have, or --reset-password to replace it.');
  } else {
    for (const [flag, val] of [['--first-name', a.firstName], ['--last-name', a.lastName], ['--school', a.school]]) if (!val) throw new Error(`new account: ${flag} is required`);
    if (!a.teams.length) throw new Error('new account: --teams mens,womens (or one of them) is required');
    const { data: orgs, error: orgErr } = await db.from('organizations').select('id, name').ilike('name', likeExact(a.school));
    if (orgErr) throw new Error(`organization lookup failed: ${orgErr.message}`);
    if (orgs?.length) throw new Error(`${a.school} is already on Helm. Its head coach should invite this coach from Settings instead.`);
    console.log(`New program: ${a.school}, ${a.teams.join(' + ')} for ${a.firstName} ${a.lastName} (${a.email})`);
  }

  const resend = new Resend(resendKey());
  const send = async (to, email) => {
    const { data, error } = await resend.emails.send({ from: FROM, replyTo: REPLY_TO, to, subject: email.subject, html: email.html, text: email.text, attachments: attachments() });
    if (error) throw new Error(`Resend refused the email: ${error.message ?? JSON.stringify(error)}`);
    return data?.id;
  };

  if (!a.send) {
    const sample = mode === 'existing'
      ? { school: found.school ?? a.school ?? 'Your school', teams: found.teams }
      : { school: a.school, teams: a.teams.map((g) => ({ name: g, gender: g, join_code: 'MADE-ON-SEND' })) };
    const email = buildCoachWelcomeEmail({ coachLastName: lastName, schoolName: sample.school, email: a.email, password: 'Shown-when-sent', teams: sample.teams });
    if (a.htmlOut) writeFileSync(a.htmlOut, email.html);
    if (a.previewTo) {
      const id = await send(a.previewTo, { ...email, subject: `[Preview] ${email.subject}` });
      step(true, `preview sent to ${a.previewTo} (Resend ${id}); no account was changed`);
    } else {
      const what = mode === 'new' ? 'create the program and ' : a.currentPassword ? '' : 'reset the password and ';
      console.log(`DRY RUN: nothing written, nothing sent. Add --preview-to <you> to see it, or --send to ${what}email ${a.email}.`);
    }
    return;
  }

  const password = a.currentPassword ? process.env.COACH_PASSWORD : temporaryPassword();
  let program;
  if (a.currentPassword) {
    step(true, 'using the password the coach already has (account not changed)');
    program = { school: found.school ?? a.school, teams: found.teams };
  } else if (mode === 'new') {
    program = await provision(db, a, password);
    step(true, `created ${program.school}: ${program.teams.map((t) => `${t.name} ${t.join_code}`).join(', ')}`);
  } else {
    const { error } = await db.auth.admin.updateUserById(found.user.id, { password });
    if (error) throw new Error(`could not set the temporary password: ${error.message}`);
    step(true, 'temporary password set on the existing login');
    program = { school: found.school ?? a.school, teams: found.teams };
  }

  // The login works before anything is emailed.
  const anonKey = JSON.parse(execFileSync(join(REPO, 'node_modules/.bin/supabase'), ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).find((k) => k.name === 'anon')?.api_key;
  const probe = createClient(`https://${ref}.supabase.co`, anonKey, { auth: { persistSession: false } });
  const signIn = await probe.auth.signInWithPassword({ email: a.email, password });
  step(!signIn.error, `the temporary password signs in${signIn.error ? `: ${signIn.error.message}` : ''}`);
  if (signIn.error) throw new Error(a.currentPassword ? 'that password does not sign in, so nothing was emailed. Check COACH_PASSWORD.' : 'not emailing a password that does not work. Re-run with --reset-password.');
  await probe.auth.signOut();

  const email = buildCoachWelcomeEmail({ coachLastName: lastName, schoolName: program.school, email: a.email, password, teams: program.teams });
  if (a.htmlOut) writeFileSync(a.htmlOut, email.html.replace(password, 'Shown-when-sent'));
  try {
    const id = await send(a.email, email);
    step(true, `welcome email sent to ${a.email} (Resend ${id})`);
  } catch (err) {
    step(false, `${err.message}. The account is ready; re-run with --send --reset-password to email a new password.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`send-coach-welcome: ${err.message}`);
    process.exit(1);
  });
}
