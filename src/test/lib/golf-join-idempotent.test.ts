/**
 * Joining a team you are already on is SUCCESS, not an error.
 *
 * Measured on production 2026-08-06: three brand-new players saw
 * "You are already a member of this team" within MINUTES of signing up —
 * shcurry0621@ signed up 18:24:10 and hit it at 18:25:21, 67 seconds later;
 * pvm05@su.edu and colemac8484@ the same night. All three were genuinely,
 * correctly on the team the message refused them.
 *
 * The mechanism: `completePlayerOnboarding` (actions/onboarding.ts:523) already
 * auto-joins a coach-invited player using the code carried through the invite
 * link. The join page then runs `processGolfTeamInvitation` a SECOND time, sees
 * the membership onboarding just created, and reports the desired end state as
 * a failure. The last thing a new paying customer saw on the way in was a red
 * error about a team they were already on.
 *
 * Join has to be idempotent: anything that leaves the player on the team they
 * asked for is success, whether this call created the row or found it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEAMS = fs.readFileSync(
  path.join(process.cwd(), 'src/app/golf/actions/teams.ts'),
  'utf8',
);

/** Code with comments stripped — this file's own prose names the patterns it
 *  forbids, and so does teams.ts. Matching a comment would be a false pass. */
const CODE = TEAMS.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

describe('golf team join is idempotent', () => {
  it('the validator distinguishes "already on THIS team" from every other refusal', () => {
    // Folding it into a generic `canJoin: false` is what made the caller treat
    // the correct end state as a failure.
    expect(CODE).toContain('alreadyOnThisTeam');
  });

  it('the join action returns success when the player is already on that team', () => {
    // The specific early return. Without it the flow falls through to the
    // generic `{ success: false, error: validation.reason }`.
    expect(CODE).toMatch(
      /if \(validation\.alreadyOnThisTeam\) \{\s*return \{ success: true, alreadyMember: true \};/,
    );
  });

  it('the early return precedes the generic canJoin refusal', () => {
    const idempotent = CODE.indexOf('validation.alreadyOnThisTeam');
    const refusal = CODE.indexOf('if (!validation.canJoin)');
    expect(idempotent).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(-1);
    // Order matters: after the refusal it is unreachable.
    expect(idempotent).toBeLessThan(refusal);
  });

  it('joining a DIFFERENT team is still refused — the one-team rule survives', () => {
    // The fix must not turn "you are on another team" into a silent success.
    expect(CODE).toContain('Golf players can only be on one team at a time');
  });
});

describe('the membership lookup cannot silently pass on an error', () => {
  it('does not use maybeSingle() on a player_id filter that has no unique constraint', () => {
    // `.eq('player_id', …).maybeSingle()` raises PGRST116 as soon as a player
    // has two rows. The error was discarded (only `data` destructured), so
    // `existingMembership` came back null and the one-team guard passed
    // silently — the failure then surfaced as a raw constraint error later.
    const lookup = CODE.slice(
      CODE.indexOf("from('golf_team_members')"),
      CODE.indexOf("from('golf_team_members')") + 400,
    );
    expect(lookup).not.toContain('maybeSingle');
  });

  it('destructures and handles the query error', () => {
    expect(CODE).toContain('const { data: memberships, error: membershipError }');
    expect(CODE).toContain('if (membershipError)');
  });

  it('a failed membership read refuses rather than guessing either way', () => {
    // Guessing "no memberships" lets a player onto a second team; guessing the
    // opposite locks out a legitimate first join. Neither is acceptable.
    expect(CODE).toContain('Could not verify your current team');
  });

  it('prefers the row for the team being joined when a player has several', () => {
    // With multiple rows, picking an arbitrary one could report "you are on
    // Team X" to someone who is also on the team they are joining.
    expect(CODE).toMatch(/memberships\?\.find\(\(m\) => m\.team_id === teamId\)/);
  });
});

describe('a failed read on the join path does not become a wrong answer', () => {
  /** The body of one function, by name, with comments already stripped. */
  function fn(name: string): string {
    const start = CODE.indexOf(`async function ${name}(`);
    expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
    const next = CODE.indexOf('\nasync function ', start + 1);
    return CODE.slice(start, next === -1 ? CODE.length : next);
  }

  it('a failed team lookup is not reported as "Team not found"', () => {
    // Zero rows IS the expected result here — RLS hides the team from the very
    // people this validator exists to let through, which is why the caller
    // resolves it through the definer function instead. So PGRST116 stays
    // silent, and anything else is a genuine failure. Telling someone with a
    // valid code "Team not found" sends them hunting for a typo that is not
    // there.
    const body = fn('validateGolfPlayerCanJoinTeamImpl');
    expect(body).toContain("teamError.code !== 'PGRST116'");
    expect(body).toContain("Couldn't look up that team just now");
  });

  it('every read gating the coach notification records its own failure', () => {
    // "A player joined your team" is gated by three reads in a row — player,
    // team, coaches — and each one skipped the notify block on a null. That is
    // how this notification went dark for six months while joins kept working:
    // nothing failed, so nothing looked wrong.
    const body = fn('joinGolfTeamImpl');
    expect(body).toContain('error: playerError');
    expect(body).toContain('error: coachesError');
    expect(body).toMatch(/coach notification will be skipped/);
    expect(body).toMatch(/nobody was notified/);
  });

  it('the join still succeeds when the notification reads fail', () => {
    // A coach's notification is not worth failing a player's join over. The
    // guards must log, never return.
    const body = fn('joinGolfTeamImpl');
    const notifySection = body.slice(body.indexOf('playerError'));
    expect(notifySection).not.toMatch(/if \(playerError\)[\s\S]{0,200}return \{\s*success: false/);
  });

  it('a failed duplicate check does not let a second pending request through', () => {
    // There is no unique constraint behind this read. Treating a failure as
    // "no request yet" stacked duplicates in the coach's approval queue.
    const body = fn('createTeamJoinRequestImpl');
    expect(body).toContain('error: existingRequestError');
    expect(body).toContain("Couldn't check your existing requests just now");
  });
});
