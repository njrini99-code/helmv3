import { describe, it, expect } from 'vitest';
import {
  classifyCredential,
  usableCredential,
  isSentryDsn,
  isSentryAuthToken,
  isInngestSigningKey,
  isInngestEventKey,
  isVercelApiToken,
  isVercelProjectId,
  isVercelTeamId,
  isInternalLogKey,
  isSentrySlug,
  isPlaceholder,
} from '../credential-shape.mjs';

/**
 * Every Bridge value in the local .env.local was exactly 11 characters — long
 * enough for the old `>= 10` floor, short of any real credential. The floor was
 * never a shape. These pin the shapes.
 */
const ELEVEN = 'abcdefghijk';

describe('credential shapes reject the 11-character placeholder class', () => {
  it.each([
    'sentry_auth_token',
    'sentry_dsn',
    'vercel_api_token',
    'vercel_project_id',
    'vercel_team_id',
    'inngest_signing_key',
    'inngest_event_key',
    'internal_log_key',
  ] as const)('%s: an 11-char opaque string is malformed, not usable', (kind) => {
    expect(ELEVEN).toHaveLength(11);
    expect(classifyCredential(kind, ELEVEN)).toBe('malformed');
    expect(usableCredential(kind, ELEVEN)).toBeNull();
  });

  it('distinguishes missing / placeholder / malformed / ok', () => {
    expect(classifyCredential('vercel_project_id', undefined)).toBe('missing');
    expect(classifyCredential('vercel_project_id', '   ')).toBe('missing');
    expect(classifyCredential('vercel_project_id', 'your-project-id')).toBe('placeholder');
    expect(classifyCredential('vercel_project_id', 'prj-wrong-separator')).toBe('malformed');
    expect(classifyCredential('vercel_project_id', ' prj_abc123 ')).toBe('ok');
    expect(usableCredential('vercel_project_id', ' prj_abc123 ')).toBe('prj_abc123');
  });
});

describe('Sentry', () => {
  it('accepts org (sntrys_), user (sntryu_) and legacy 64-hex tokens', () => {
    expect(isSentryAuthToken(`sntrys_${'a'.repeat(40)}`)).toBe(true);
    expect(isSentryAuthToken(`sntryu_${'b'.repeat(40)}`)).toBe(true);
    expect(isSentryAuthToken('0123456789abcdef'.repeat(4))).toBe(true);
  });
  it('accepts an unknown-format token only at >= 32 chars without whitespace', () => {
    expect(isSentryAuthToken('x'.repeat(32))).toBe(true);
    expect(isSentryAuthToken('x'.repeat(31))).toBe(false);
    expect(isSentryAuthToken(`${'x'.repeat(20)} ${'y'.repeat(20)}`)).toBe(false);
    expect(isSentryAuthToken('sntrys_short')).toBe(false);
  });
  it('DSN must be https, host under sentry.io, with a key and a numeric project path', () => {
    expect(isSentryDsn('https://abc123@o4507.ingest.us.sentry.io/4509')).toBe(true);
    expect(isSentryDsn('https://abc123@sentry.io/1')).toBe(true);
    expect(isSentryDsn('http://abc123@o4507.ingest.us.sentry.io/4509')).toBe(false);
    expect(isSentryDsn('https://abc123@o4507.ingest.us.sentry.io.evil.com/4509')).toBe(false);
    expect(isSentryDsn('https://o4507.ingest.us.sentry.io/4509')).toBe(false); // no key
    expect(isSentryDsn('https://abc123@o4507.ingest.us.sentry.io/')).toBe(false); // no project
    expect(isSentryDsn('not a url')).toBe(false);
  });
  it('slugs are lowercase, and the real org slug passes', () => {
    expect(isSentrySlug('helm-xs')).toBe(true);
    expect(isSentrySlug('javascript-nextjs')).toBe(true);
    expect(isSentrySlug('Helm XS')).toBe(false);
  });
});

describe('Inngest', () => {
  it('signing key is signkey-<env>-<hex> — the exact prefix the SDK strips', () => {
    expect(isInngestSigningKey(`signkey-prod-${'0f'.repeat(32)}`)).toBe(true);
    expect(isInngestSigningKey(`signkey-test-${'a'.repeat(64)}`)).toBe(true);
    expect(isInngestSigningKey(`signkey-prod-${'a'.repeat(31)}`)).toBe(false);
    expect(isInngestSigningKey(`signingkey-prod-${'a'.repeat(64)}`)).toBe(false);
    expect(isInngestSigningKey('a'.repeat(64))).toBe(false);
  });
  it('event key is opaque and long', () => {
    expect(isInngestEventKey('A'.repeat(86))).toBe(true);
    expect(isInngestEventKey('A'.repeat(19))).toBe(false);
  });
});

describe('Vercel and the internal log key', () => {
  it('token >= 20 opaque chars; ids carry their prefixes', () => {
    expect(isVercelApiToken('abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(isVercelApiToken('abcdefghijklmnopqrs')).toBe(false);
    expect(isVercelProjectId('prj_1')).toBe(true);
    expect(isVercelProjectId('1')).toBe(false);
    expect(isVercelTeamId('team_1')).toBe(true);
    expect(isVercelTeamId('tm_1')).toBe(false);
  });
  it('internal log key needs >= 16 chars and no whitespace', () => {
    expect(isInternalLogKey('a'.repeat(16))).toBe(true);
    expect(isInternalLogKey('a'.repeat(15))).toBe(false);
    expect(isInternalLogKey(`${'a'.repeat(8)} ${'b'.repeat(8)}`)).toBe(false);
  });
});

describe('placeholders', () => {
  it.each(['your-token-here', 'replace-me', 'changeme', 'TODO', 'example-key', 'placeholder', 'xxxxxxxxxxx', '<paste here>'])(
    '%s is a placeholder',
    (v) => expect(isPlaceholder(v)).toBe(true),
  );
  it('a real-looking value is not', () => {
    expect(isPlaceholder('prj_abc123')).toBe(false);
  });
});
