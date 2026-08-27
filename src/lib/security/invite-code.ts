/**
 * Invite / join code generation.
 *
 * WHY THIS IS NOT `Math.random()`
 * ------------------------------
 * Possession of a team invite code is the ENTIRE authorization check for
 * joining that team — `/baseball/join/[code]` resolves the code and adds the
 * bearer to the roster on signup. That makes it a bearer credential, not an
 * identifier.
 *
 * `Math.random()` is a non-cryptographic PRNG. Its internal state is
 * recoverable from a small number of observed outputs, so codes minted from it
 * are not merely "hard to guess" — given one or two codes (a coach shares an
 * invite link in a group chat; an ex-player keeps an old one) an attacker can
 * derive others, including codes for teams they were never invited to. That is
 * CWE-338, and it was the shape of security scan finding F9.
 *
 * `crypto.getRandomValues` is available in every browser this app supports and
 * in Node 18+ via `globalThis.crypto`, so one implementation covers both the
 * client component that mints these and any future server-side caller.
 */

/**
 * Crockford base32 — no I, L, O or U.
 *
 * Chosen over base36 because these codes get read aloud, typed off a
 * screenshot, and pasted out of group chats. Dropping the letters that collide
 * with digits (I/1, O/0) and the one that forms unintended words (U) removes
 * the transcription failures that otherwise get reported as "the invite link is
 * broken".
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Default length. 10 symbols over a 32-char alphabet = 50 bits of entropy. */
const DEFAULT_LENGTH = 10;

/**
 * Generate a cryptographically random invite code.
 *
 * Rejection sampling, not modulo. 256 is not a multiple of 32 — well, it is,
 * so for THIS alphabet a plain mask is unbiased; the mask below is written so
 * the function stays correct if the alphabet length is ever changed to a
 * non-power-of-two, which is exactly the kind of edit that silently reintroduces
 * modulo bias.
 */
export function generateInviteCode(length: number = DEFAULT_LENGTH): string {
  const mask = nextPowerOfTwoMinusOne(ALPHABET.length);
  let out = '';

  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length);
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      const index = byte & mask;
      // Discard values that fall outside the alphabet rather than folding them
      // back with `%`, which would make the low indices more likely.
      if (index < ALPHABET.length) out += ALPHABET[index];
      if (out.length === length) break;
    }
  }

  return out;
}

function nextPowerOfTwoMinusOne(n: number): number {
  let mask = 1;
  while (mask < n) mask = (mask << 1) | 1;
  return mask;
}
