/**
 * Reproduces the 2026-11-03 Messages push failure: Apple refused pushes with
 * 429 TooManyProviderTokenUpdates because every cold isolate of
 * send-apns-push signed its own APNs provider token.
 *
 * A Messages send fans out one edge invocation per device token, in parallel
 * (golf-message-fanout -> sendPushNotification -> functions.invoke). In the
 * production function logs each send booted 7-9 fresh isolates within ~150ms;
 * each one minted a different provider token from the same key, and Apple
 * throttled the key. The fix must give every isolate the SAME token for the
 * same time window, with no shared storage between them.
 */
import { describe, expect, it, vi } from 'vitest';
import { p256 } from '@noble/curves/p256';
import {
  TOKEN_WINDOW_SECONDS,
  createProviderTokenSource,
  type Es256Signer,
} from '../../../../supabase/functions/send-apns-push/provider-token';

const signer: Es256Signer = (digest, privateKey) => p256.sign(digest, privateKey).toCompactRawBytes();

/** A throwaway P-256 key in the same PKCS#8 PEM shape as an Apple .p8 file. */
async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, '$1\n');
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  return { privateKeyPem, publicKey: pair.publicKey };
}

const fromBase64Url = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)), (c) => c.charCodeAt(0));
const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));

// The two failing bursts on 2026-11-03, isolate boot times from the function logs.
const BURST_1 = ['15:34:01.998', '15:34:02.009', '15:34:02.016', '15:34:02.019', '15:34:02.043', '15:34:02.064', '15:34:02.138'];
const BURST_2 = ['15:34:14.174', '15:34:14.192', '15:34:14.237', '15:34:14.241', '15:34:14.246', '15:34:14.267', '15:34:14.270', '15:34:14.675'];
const at = (hms: string) => Date.parse(`2026-11-03T${hms}Z`);

describe('send-apns-push provider token', () => {
  it('gives every cold isolate in the failing Messages fan-out the same token', async () => {
    const { privateKeyPem } = await makeKey();
    const config = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem };

    // One source per isolate: each has its own empty module memory, exactly
    // like a freshly booted edge worker.
    const tokens = await Promise.all(
      [...BURST_1, ...BURST_2].map((hms) => createProviderTokenSource(config, { signer, now: () => at(hms) }).get()),
    );

    expect(new Set(tokens).size).toBe(1);
  });

  it('is a valid ES256 provider token that Apple will accept by age', async () => {
    const { privateKeyPem, publicKey } = await makeKey();
    const now = at('15:34:02.000');
    const token = await createProviderTokenSource(
      { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem },
      { signer, now: () => now },
    ).get();

    const [h, p, s] = token.split('.');
    expect(decode(h!)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const payload = decode(p!);
    expect(payload).toEqual({ iss: 'TEAM123456', iat: expect.any(Number) });
    // Never in the future, and well inside Apple's one-hour limit.
    expect(payload.iat * 1000).toBeLessThanOrEqual(now);
    expect(now - payload.iat * 1000).toBeLessThan(TOKEN_WINDOW_SECONDS * 1000);
    expect(TOKEN_WINDOW_SECONDS).toBeLessThan(60 * 60);

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64Url(s!),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(verified).toBe(true);
  });

  it('rotates no more often than every 20 minutes, across any number of isolates', async () => {
    const { privateKeyPem } = await makeKey();
    const config = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem };
    const start = at('15:00:00.000');

    // A fresh isolate every minute for three hours.
    const tokens: string[] = [];
    for (let minute = 0; minute < 180; minute++) {
      tokens.push(await createProviderTokenSource(config, { signer, now: () => start + minute * 60_000 }).get());
    }

    const distinct = [...new Set(tokens)];
    const issuedAt = distinct.map((t) => decode(t.split('.')[1]!).iat as number);
    for (let i = 1; i < issuedAt.length; i++) {
      expect(issuedAt[i]! - issuedAt[i - 1]!).toBeGreaterThanOrEqual(20 * 60);
    }
    expect(distinct.length).toBeLessThanOrEqual(Math.ceil(180 / (TOKEN_WINDOW_SECONDS / 60)) + 1);
  });

  it('signs once per window inside an isolate', async () => {
    const { privateKeyPem } = await makeKey();
    const spy = vi.fn(signer);
    let now = at('15:34:02.000');
    const source = createProviderTokenSource(
      { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem },
      { signer: spy, now: () => now },
    );

    const first = await source.get();
    now += 60_000;
    expect(await source.get()).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);

    now += TOKEN_WINDOW_SECONDS * 1000;
    expect(await source.get()).not.toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
