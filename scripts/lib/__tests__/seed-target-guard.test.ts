// =============================================================================
// scripts/lib/seed-target-guard.ts — the "did you mean to write HERE?" rules.
//
// WHY THIS FILE EXISTS: these rules used to live inline in
// scripts/seed-baseball-demo.ts, and the only thing checking them was a
// source-text assertion in scripts/__tests__/baseball-demo-seed-contract.test.mjs
// that grepped for the strings `HELM_PROD_PROJECT_REF` and `--allow-prod`. That
// catches deletion. It cannot catch the guard being WRONG — and this guard has
// been wrong twice, in ways a grep passes happily:
//
//   1. It resolved the first hostname label as a project ref on ANY domain, so
//      `https://<prodref>.example.invalid` was treated as production (or, worse,
//      a foreign host was treated as an already-named project).
//   2. It accepted `.local` as a loopback SUFFIX, so `totally-not-ours.local` —
//      a routable mDNS name on the operator's LAN — counted as "this machine".
//
// Both are asserted below by calling the decision function, which is why it was
// separated from the process.exit()-ing wrapper in the first place.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  HELM_PROD_PROJECT_REF,
  decideSeedTarget,
  describeSeedTarget,
  type SeedTargetPermission,
} from '../seed-target-guard';

const PERMISSION: SeedTargetPermission = {
  allowProd: false,
  destructiveWarning: 'test warning',
  scriptPath: 'scripts/seed-x.ts',
};

function decide(url: string, overrides: Partial<SeedTargetPermission> = {}) {
  return decideSeedTarget(describeSeedTarget(url), { ...PERMISSION, ...overrides });
}

describe('describeSeedTarget — resolving what a URL actually points at', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
    'http://host.docker.internal:54321',
    'http://kong:8000',
  ])('treats %s as a local stack', (url) => {
    const target = describeSeedTarget(url);
    expect(target.isLocal).toBe(true);
    expect(target.ref).toBe('');
  });

  it('does NOT accept .local as a loopback suffix', () => {
    // Regression: `.local` used to be matched as a suffix, so any mDNS host on
    // the operator's LAN was seedable without naming it.
    const target = describeSeedTarget('https://totally-not-ours.local');
    expect(target.isLocal).toBe(false);
    expect(target.ref).toBe('');
  });

  it('still accepts the one explicit localhost.local entry', () => {
    expect(describeSeedTarget('http://localhost.local:54321').isLocal).toBe(true);
  });

  it('resolves the first label as a project ref only on real Supabase domains', () => {
    for (const domain of ['supabase.co', 'supabase.in', 'supabase.net']) {
      const target = describeSeedTarget(`https://someproject.${domain}`);
      expect(target.ref, domain).toBe('someproject');
      expect(target.isLocal, domain).toBe(false);
    }
  });

  it('does NOT resolve a project ref on a look-alike domain', () => {
    // Regression: the prod ref as the first label of a foreign domain used to
    // resolve to production. A typo-squat or an internal proxy sharing the
    // first label was trusted on the strength of a substring.
    const target = describeSeedTarget(`https://${HELM_PROD_PROJECT_REF}.example.invalid`);
    expect(target.ref).toBe('');
    expect(target.isLocal).toBe(false);
  });

  it('treats an unparseable URL as foreign rather than proving it safe', () => {
    const target = describeSeedTarget('not a url at all');
    expect(target.isLocal).toBe(false);
    expect(target.ref).toBe('');
  });

  it('lowercases the host so case cannot smuggle a target past the rules', () => {
    expect(describeSeedTarget('http://LOCALHOST:54321').isLocal).toBe(true);
    expect(describeSeedTarget(`https://${HELM_PROD_PROJECT_REF.toUpperCase()}.SUPABASE.CO`).ref).toBe(
      HELM_PROD_PROJECT_REF,
    );
  });
});

describe('decideSeedTarget — production is a DENY, not an ALLOW', () => {
  const PROD_URL = `https://${HELM_PROD_PROJECT_REF}.supabase.co`;

  it('refuses production on --confirm alone', () => {
    const decision = decide(PROD_URL);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.message).toContain('the target Supabase project is PRODUCTION');
    expect(decision.message).toContain('--allow-prod');
  });

  it('refuses production even when the ref is named back via --allow-project', () => {
    // Naming the project is the escape hatch for FOREIGN projects. It must not
    // double as a second, quieter way to say --allow-prod: the prod branch is
    // checked first and never consults the acknowledged ref.
    const decision = decide(PROD_URL, { allowProjectRef: HELM_PROD_PROJECT_REF });
    expect(decision.allowed).toBe(false);
  });

  it('allows production only with --allow-prod, and says so out loud', () => {
    const decision = decide(PROD_URL, { allowProd: true });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.warning).toContain('SEEDING PRODUCTION');
  });

  it('does not let --allow-prod launder a foreign project', () => {
    // --allow-prod names production specifically. It must not become a blanket
    // "write anywhere" flag for whatever the env happens to point at.
    const decision = decide('https://someone-elses-project.supabase.co', { allowProd: true });
    expect(decision.allowed).toBe(false);
  });
});

describe('decideSeedTarget — a foreign project must be named back', () => {
  it('allows a local stack with no flags at all', () => {
    expect(decide('http://127.0.0.1:54321').allowed).toBe(true);
  });

  it('refuses an unnamed foreign project', () => {
    const decision = decide('https://someone-elses-project.supabase.co');
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.message).toContain('neither a local stack nor a project you named');
    expect(decision.message).toContain('--allow-project=someone-elses-project');
  });

  it('allows a foreign project when its own ref is named back exactly', () => {
    const decision = decide('https://someone-elses-project.supabase.co', {
      allowProjectRef: 'someone-elses-project',
    });
    expect(decision.allowed).toBe(true);
  });

  it('refuses when the named ref does not match the target', () => {
    const decision = decide('https://project-a.supabase.co', { allowProjectRef: 'project-b' });
    expect(decision.allowed).toBe(false);
  });

  it('refuses a host with no resolvable ref, and says nothing can be verified', () => {
    const decision = decide('https://some-proxy.internal.example');
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.message).toContain('(not a recognised Supabase host)');
    expect(decision.message).toContain('no ref could be resolved');
  });

  it('cannot be satisfied by naming an empty ref', () => {
    // `ref === '' && acknowledged === ''` must not compare equal into an allow.
    // The unparseable/unrecognised case has ref '', so a blank
    // --allow-project= or an unset env var previously risked matching it.
    for (const url of ['not a url at all', 'https://some-proxy.internal.example']) {
      expect(decide(url, { allowProjectRef: '' }).allowed, url).toBe(false);
      expect(decide(url, { allowProjectRef: '   ' }).allowed, url).toBe(false);
    }
  });
});
