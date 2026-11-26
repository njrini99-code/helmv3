import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachWelcomeEmail, orderTeams } from '../coach-welcome/template.mjs';
import { currentSeason, joinCode, likeExact, parseArgs, temporaryPassword } from '../send-coach-welcome.mjs';

const TEAMS = [
  { name: 'Riverbend Women’s Golf', gender: 'womens', join_code: 'P2WH9RNB' },
  { name: 'Riverbend Men’s Golf', gender: 'mens', join_code: 'K7MQ4TXA' },
];
// A generated password, so no password literal sits in the repo (scripts-no-committed-secrets).
const base = { coachLastName: 'Ellis', schoolName: 'Riverbend', email: 'ellisj@riverbend.test', password: temporaryPassword(), teams: TEAMS };

test('the email carries the login, the password, both codes and the join steps', () => {
  const { subject, html, text } = buildCoachWelcomeEmail(base);
  assert.equal(subject, 'Welcome to Helm, Coach Ellis');
  for (const s of ['Welcome to Helm, Coach Ellis.', 'ellisj@riverbend.test', base.password, 'K7MQ4TXA', 'P2WH9RNB', 'https://helmsportslabs.com/golf/login', 'https://helmsportslabs.com/golf/signup']) {
    assert.ok(html.includes(s), `html has ${s}`);
    assert.ok(text.includes(s), `text has ${s}`);
  }
  assert.ok(html.indexOf('K7MQ4TXA') < html.indexOf('P2WH9RNB'), 'men’s plate first');
  assert.match(html, /men’s and women’s teams are both set up/);
});

test('email-safe markup: no SVG, flexbox or grid, and the images are inline attachments', () => {
  const { html } = buildCoachWelcomeEmail(base);
  assert.doesNotMatch(html, /<svg|display:\s*(flex|grid)/i);
  assert.match(html, /src="cid:helm-locker-hero"/);
  assert.match(html, /src="cid:helm-mark"/);
});

test('one team reads as one team', () => {
  const { html } = buildCoachWelcomeEmail({ ...base, teams: [TEAMS[0]] });
  assert.match(html, /women’s team is set up/);
  assert.match(html, /Your team code</);
  assert.doesNotMatch(html, /K7MQ4TXA/);
});

test('names are escaped, and a team without a code is refused', () => {
  const { html } = buildCoachWelcomeEmail({ ...base, coachLastName: '<b>O’Neil</b>' });
  assert.ok(html.includes('&lt;b&gt;O’Neil&lt;/b&gt;'));
  assert.throws(() => buildCoachWelcomeEmail({ ...base, teams: [{ name: 'x', gender: 'mens', join_code: null }] }), /no join code/);
  assert.throws(() => buildCoachWelcomeEmail({ ...base, teams: [] }), /at least one team/);
});

test('teams sort men’s, women’s, then the rest', () => {
  assert.deepEqual(orderTeams([{ name: 'B', gender: null }, ...TEAMS]).map((t) => t.gender), ['mens', 'womens', null]);
});

test('the temporary password meets sign-up’s rules', () => {
  for (let i = 0; i < 200; i += 1) {
    const pw = temporaryPassword();
    assert.ok(pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw), pw);
  }
});

test('join codes use the app’s alphabet and length; seasons start in August', () => {
  for (let i = 0; i < 200; i += 1) assert.match(joinCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(currentSeason(new Date('2026-11-25T12:00:00')), '2026-27');
  assert.equal(currentSeason(new Date('2027-03-01T12:00:00')), '2026-27');
  assert.equal(currentSeason(new Date('2027-08-02T12:00:00')), '2027-28');
});

test('ilike wildcards are escaped', () => {
  assert.equal(likeExact('a_b%c\\d'), 'a\\_b\\%c\\\\d');
});

test('arguments: a missing value is refused, lists split, emails lower-cased', () => {
  const a = parseArgs(['--env', 'staging', '--coach-email', 'Ellis@X.edu', '--teams', 'mens, womens', '--send']);
  assert.deepEqual([a.env, a.email, a.teams, a.send], ['staging', 'ellis@x.edu', ['mens', 'womens'], true]);
  assert.throws(() => parseArgs(['--coach-email', '--send']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
});
