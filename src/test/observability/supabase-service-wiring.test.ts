import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 2 Track B WIRING contract — every Auth and Storage call site this
 * pass connected, checked against the source.
 *
 * WHY A SOURCE-CONTENT TEST AND NOT FULL BEHAVIOURAL COVERAGE. Most of these
 * sites live inside server actions that would each need the rate limiter,
 * account lockout, GoTrue, admin logger, revalidatePath, the action wrapper
 * and several logging modules stood up — a dozen-plus dependencies apiece,
 * for a check that is fundamentally about whether the wiring exists and
 * carries the right context. That is the same proportionality judgement (and
 * the same pattern) as
 * `src/app/golf/actions/__tests__/auth-login-observability.test.ts` and
 * `src/lib/security/__tests__/sentry-application-key.test.ts`.
 *
 * Two call sites DO have a cheap harness and are covered behaviourally
 * instead — `src/test/auth/password-reset-observability.test.ts` and
 * `src/lib/admin/__tests__/github-feedback-storage-observability.test.ts`.
 * They are still listed here so the inventory stays complete in one place.
 *
 * THE THIRD ASSERTION IS THE LOAD-BEARING ONE. `mustBeStandaloneStatements`
 * proves structurally that no observer call can change what its caller
 * returns: each one occupies its own statement, so it is not part of a
 * `return`, an assignment, a condition, or an `await` chain. That is the
 * "byte-for-byte unchanged return value" guarantee this pass promised, and
 * it is checkable without executing anything.
 */

type Site = { action: string; operation: string; extra?: string[] };

const AUTH_SITES: Record<string, Site[]> = {
  'src/app/auth/callback/route.ts': [
    { action: 'exchange_code_for_session', operation: 'oauth' },
  ],
  'src/app/golf/actions/auth.ts': [
    { action: 'golf.login', operation: 'sign_in' },
    { action: 'golf.signup', operation: 'sign_up' },
    { action: 'golf.signup_with_staff_invite', operation: 'sign_up' },
  ],
  'src/app/golf/actions/demo-access.ts': [
    { action: 'golf.demo_shared_account_sign_in', operation: 'sign_in' },
    { action: 'golf.demo_stamp_is_demo', operation: 'other' },
  ],
  'src/app/baseball/actions/auth.ts': [
    { action: 'baseball.login', operation: 'sign_in' },
    { action: 'baseball.signup', operation: 'sign_up' },
    { action: 'baseball.change_password_reauth', operation: 'sign_in' },
    { action: 'baseball.change_password_update', operation: 'password_reset' },
  ],
  'src/app/baseball/actions/demo-access.ts': [
    { action: 'baseball.demo_shared_account_sign_in', operation: 'sign_in' },
    { action: 'baseball.demo_stamp_is_demo', operation: 'other' },
  ],
  'src/app/baseball/actions/onboarding.ts': [
    { action: 'baseball.signup_and_complete_coach_onboarding', operation: 'sign_up' },
    { action: 'baseball.onboarding_ownership_proof', operation: 'sign_in' },
  ],
  'src/app/lifting/actions/auth.ts': [
    { action: 'lifting.signup', operation: 'sign_up' },
  ],
  'src/lib/auth/send-password-reset.ts': [
    { action: 'send_password_reset_link', operation: 'password_reset', extra: ['expectedMissingUser: true'] },
  ],
  'src/app/api/account/delete/route.ts': [
    { action: 'delete_auth_user', operation: 'other' },
  ],
};

const STORAGE_SITES: Record<string, Site[]> = {
  'src/app/golf/actions/recruiting.ts': [
    { action: 'delete_recruit_storage_objects', operation: 'delete', extra: ['accessDeniedOnOwnPath: true'] },
  ],
  'src/lib/admin/github-feedback.ts': [
    { action: 'upload_feedback_screenshot', operation: 'upload', extra: ['accessDeniedOnOwnPath: true'] },
    { action: 'sign_feedback_screenshot_url', operation: 'download', extra: ['accessDeniedOnOwnPath: true'] },
  ],
};

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

/** Every `name(` call block in `src`, by matching parentheses. */
function callBlocks(src: string, name: string): { text: string; index: number }[] {
  const blocks: { text: string; index: number }[] = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const start = src.indexOf(needle, from);
    if (start === -1) return blocks;
    let depth = 0;
    let i = start + name.length;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push({ text: src.slice(start, i + 1), index: start });
    from = i + 1;
  }
}

/**
 * Structural proof that an observer cannot alter its caller's return value:
 * the call must start its own line (nothing but whitespace before it) and
 * terminate with `;` (so it is an expression statement, never a subexpression
 * of a return/assignment/condition).
 */
function mustBeStandaloneStatements(rel: string, src: string, name: string): void {
  for (const { text, index } of callBlocks(src, name)) {
    const lineStart = src.lastIndexOf('\n', index) + 1;
    const before = src.slice(lineStart, index);
    expect(before.trim(), `${rel}: ${name} is not at the start of its own statement`).toBe('');
    expect(src.slice(index + text.length, index + text.length + 1), `${rel}: ${name} call is not terminated by ';'`).toBe(';');
  }
}

describe('Auth wiring — observeAuthResult reaches every actionable server-side call site', () => {
  for (const [rel, sites] of Object.entries(AUTH_SITES)) {
    describe(rel, () => {
      const src = read(rel);

      it('imports the server-only Auth observer', () => {
        expect(src).toContain("from '@/lib/observability/supabase/observe-auth'");
        expect(src).toContain('observeAuthResult');
      });

      it(`holds exactly ${sites.length} observed call site(s)`, () => {
        expect(callBlocks(src, 'observeAuthResult').length).toBe(sites.length);
      });

      for (const site of sites) {
        it(`observes ${site.action} with operation ${site.operation}`, () => {
          const block = callBlocks(src, 'observeAuthResult').find((b) => b.text.includes(`action: '${site.action}'`));
          expect(block, `no observeAuthResult block carrying action '${site.action}'`).toBeDefined();
          expect(block!.text).toContain(`operation: '${site.operation}'`);
          for (const extra of site.extra ?? []) expect(block!.text).toContain(extra);
        });
      }

      it('every observer call is a standalone statement — it cannot change what the caller returns', () => {
        mustBeStandaloneStatements(rel, src, 'observeAuthResult');
      });
    });
  }
});

describe('Storage wiring — observeStorageResult reaches every server-side call site', () => {
  for (const [rel, sites] of Object.entries(STORAGE_SITES)) {
    describe(rel, () => {
      const src = read(rel);

      it('imports the server-only Storage observer', () => {
        expect(src).toContain("from '@/lib/observability/supabase/observe-storage'");
      });

      for (const site of sites) {
        it(`observes ${site.action} with operation ${site.operation} and a safe bucketClass`, () => {
          const block = callBlocks(src, 'observeStorageResult').find((b) => b.text.includes(`action: '${site.action}'`));
          expect(block, `no observeStorageResult block carrying action '${site.action}'`).toBeDefined();
          expect(block!.text).toContain(`operation: '${site.operation}'`);
          expect(block!.text).toContain('bucketClass:');
          for (const extra of site.extra ?? []) expect(block!.text).toContain(extra);
        });
      }

      it('every observer call is a standalone statement — it cannot change what the caller returns', () => {
        mustBeStandaloneStatements(rel, src, 'observeStorageResult');
      });
    });
  }
});

/**
 * The anti-noise half of the contract. Brief §7 and §82 forbid sending every
 * routine rejection to an actionable bucket, and `supabase.auth.getUser()` at
 * the top of a server action is the single most common Supabase Auth call in
 * this repo — a null user there is the authorization check working, not an
 * incident. If a future pass wires those, this fails and asks for a decision.
 */
describe('Auth wiring — the routine authorization check stays unwired, on purpose', () => {
  it('no observeAuthResult call names a getUser-shaped authorization check', () => {
    for (const rel of Object.keys(AUTH_SITES)) {
      for (const { text } of callBlocks(read(rel), 'observeAuthResult')) {
        expect(text, `${rel}: an authorization-check call site was observed`).not.toMatch(/action: '[^']*get_?user/i);
      }
    }
  });

  it('the observers stay out of every client bundle — no wired file is a client module', () => {
    for (const rel of [...Object.keys(AUTH_SITES), ...Object.keys(STORAGE_SITES)]) {
      expect(read(rel).slice(0, 400), `${rel} is a client module`).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });
});
