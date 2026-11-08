/**
 * The APNs provider token (ES256 JWT), shared by every isolate WITHOUT any
 * shared storage.
 *
 * Why this exists: Apple asks for one provider token per signing key, renewed
 * no more than once every 20 minutes, and answers
 * `429 TooManyProviderTokenUpdates` when a key presents new tokens faster than
 * that. A Messages send fans out one invocation per device, in parallel, and
 * the edge runtime boots a fresh isolate for most of them; on 2026-11-03 one
 * send booted 7-9 isolates inside 150 ms. A module-level cache only lives in
 * one isolate, so each of those minted its own token, Apple throttled the key,
 * and five phones got no alert.
 *
 * The fix makes the token a pure function of the clock window:
 *   - `iat` is the start of the current fixed 40-minute window, so every
 *     isolate agrees on it, it is never in the future, and it is always less
 *     than 40 minutes old (Apple rejects tokens older than an hour);
 *   - the signature is deterministic (RFC 6979 ECDSA, supplied as `signer`),
 *     whereas WebCrypto ECDSA uses a random nonce and gives a different
 *     signature on every call.
 * Same claims plus deterministic signature means every isolate produces the
 * byte-identical token, so Apple sees exactly one new token per window.
 *
 * Kept free of Deno and npm imports so it runs unchanged under Deno (the edge
 * function) and Node (the vitest suite); the signer is injected.
 */

export interface ProviderTokenConfig {
  teamId: string;
  keyId: string;
  /** Contents of the Apple .p8 file (PKCS#8 PEM). */
  privateKeyPem: string;
}

/** Deterministic ES256: SHA-256 digest + raw 32-byte scalar -> 64-byte r||s. */
export type Es256Signer = (digest: Uint8Array, privateKey: Uint8Array) => Uint8Array;

/** Between Apple's 20-minute minimum and 60-minute maximum, with margin both ways. */
export const TOKEN_WINDOW_SECONDS = 40 * 60;

export function windowIssuedAt(nowMs: number): number {
  const nowSeconds = Math.floor(nowMs / 1000);
  return nowSeconds - (nowSeconds % TOKEN_WINDOW_SECONDS);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** The raw private scalar `d`, read through WebCrypto's JWK export (no hand-rolled ASN.1). */
async function privateScalar(pem: string): Promise<Uint8Array> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (!jwk.d) throw new Error("APNS_PRIVATE_KEY is not a P-256 private key");
  return base64UrlDecode(jwk.d);
}

async function signToken(config: ProviderTokenConfig, signer: Es256Signer, issuedAt: number): Promise<string> {
  const encoder = new TextEncoder();
  // Fixed key order: the claims, and therefore the token, must be identical in every isolate.
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "ES256", kid: config.keyId })));
  const payload = base64Url(encoder.encode(JSON.stringify({ iss: config.teamId, iat: issuedAt })));
  const signingInput = `${header}.${payload}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(signingInput)));
  const signature = signer(digest, await privateScalar(config.privateKeyPem));
  return `${signingInput}.${base64Url(signature)}`;
}

/**
 * One per isolate. `get()` signs at most once per window; that is only a cost
 * saving, since any other isolate would produce the same string anyway.
 */
export function createProviderTokenSource(
  config: ProviderTokenConfig,
  deps: { signer: Es256Signer; now?: () => number },
) {
  const now = deps.now ?? Date.now;
  let memo: { issuedAt: number; token: string } | null = null;

  return {
    async get(): Promise<string> {
      const issuedAt = windowIssuedAt(now());
      if (memo?.issuedAt === issuedAt) return memo.token;
      const token = await signToken(config, deps.signer, issuedAt);
      memo = { issuedAt, token };
      return token;
    },
  };
}
