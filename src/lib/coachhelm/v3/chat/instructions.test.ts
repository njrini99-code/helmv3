import { describe, it, expect } from 'vitest';
import { buildInstructions } from './instructions';
import type { CoachChatContext } from './context';

/**
 * #1999 re-review, MUST: `stream/route.ts` unconditionally asked the model
 * for a `<<<CLAIMS>>>` block regardless of `coachhelm_chat_claim_gate` — the
 * flag only gated whether anything downstream ever READ one. With the flag
 * off (the production default everywhere, per `config/feature-flags.yml`),
 * that paid tokens and latency for a block generated, forwarded past the
 * withhold logic, and immediately stripped for nothing. `buildInstructions`
 * now takes `claimsBlockEnabled` and only appends the "Claims block" section
 * when it's true, so flag-off is byte-identical to before this gate existed
 * — the same contract #1997 established for the wire/persistence side.
 */

function ctx(): CoachChatContext {
  return {
    coach_id: 'c1',
    user_id: 'u1',
    team_id: 'team-1',
    team_name: 'Rini University',
    timezone: 'America/New_York',
    roster: [],
  };
}

const NOW_ISO = '2026-09-23T12:00:00.000Z';

describe('buildInstructions() — claims block gated by coachhelm_chat_claim_gate', () => {
  it('flag OFF: the system prompt contains no Claims block heading or <<<CLAIMS>>> instruction', () => {
    const prompt = buildInstructions(ctx(), NOW_ISO, false);

    expect(prompt).not.toContain('Claims block');
    expect(prompt).not.toContain('<<<CLAIMS>>>');
    expect(prompt).not.toContain('<<<END_CLAIMS>>>');
    expect(prompt).not.toContain('claim_id');
  });

  it('flag ON: the system prompt DOES instruct the model to append a claims block', () => {
    const prompt = buildInstructions(ctx(), NOW_ISO, true);

    expect(prompt).toContain('## Claims block');
    expect(prompt).toContain('<<<CLAIMS>>>');
    expect(prompt).toContain('<<<END_CLAIMS>>>');
  });

  it('flag OFF still includes the Actions section and the program-specific section unchanged', () => {
    const prompt = buildInstructions(ctx(), NOW_ISO, false);

    expect(prompt).toContain('## Actions');
    expect(prompt).toContain('## This program');
    expect(prompt).toContain('Rini University');
  });

  it('the flag toggling the claims section never changes anything before or after it', () => {
    const off = buildInstructions(ctx(), NOW_ISO, false);
    const on = buildInstructions(ctx(), NOW_ISO, true);

    // `on` is `off` with the Claims block section spliced in — never a
    // rewrite of the surrounding prose (which would break prompt caching's
    // "stable prefix" assumption for whichever half stayed the same).
    const [offBefore] = off.split('## Actions');
    const [onBefore] = on.split('## Claims block');
    expect(onBefore!.trimEnd()).toBe(offBefore!.trimEnd());
  });
});
