// =============================================================================
// src/lib/baseball/__tests__/file-fingerprint.test.ts
//
// GAP 2 — locks the file fingerprint the "same file hash is ignored as duplicate"
// invariant depends on. The hash must be STABLE for identical bytes, DIFFER for
// changed bytes, and be computed over EXACTLY the bytes the server stores (a text
// body as UTF-8, a binary envelope decoded to raw bytes) so a tampered client hash
// can never poison dedupe.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  sha256Hex,
  bodyToStoredBytes,
  fingerprintBody,
} from '@/lib/baseball/adapters/file-fingerprint';
import { encodeBinaryBody } from '@/lib/baseball/adapters/import-file-body';

describe('sha256Hex', () => {
  it('is the known SHA-256 of an empty string', async () => {
    // RFC 6234 test vector for "".
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable for identical input and differs for changed input', async () => {
    const a = await sha256Hex('player,ab,h\nSmith,4,2');
    const b = await sha256Hex('player,ab,h\nSmith,4,2');
    const c = await sha256Hex('player,ab,h\nSmith,4,3'); // one byte changed
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('hashes a Uint8Array identically to the equivalent UTF-8 string', async () => {
    const text = 'héllo'; // multibyte to catch encoding bugs
    const fromString = await sha256Hex(text);
    const fromBytes = await sha256Hex(new TextEncoder().encode(text));
    expect(fromString).toBe(fromBytes);
  });

  it('hashes a subarray over only its own bytes (offset safety)', async () => {
    const full = new TextEncoder().encode('XXabcYY');
    const view = full.subarray(2, 5); // 'abc'
    expect(await sha256Hex(view)).toBe(await sha256Hex('abc'));
  });
});

describe('bodyToStoredBytes', () => {
  it('stores a plain text body as UTF-8 bytes', () => {
    const { bytes, mime } = bodyToStoredBytes('a,b,c');
    expect(new TextDecoder().decode(bytes)).toBe('a,b,c');
    expect(mime).toContain('text/plain');
  });

  it('decodes a binary envelope back to its exact bytes + mime', () => {
    const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const envelope = encodeBinaryBody(raw, 'application/pdf');
    const { bytes, mime } = bodyToStoredBytes(envelope);
    expect(Array.from(bytes)).toEqual(Array.from(raw));
    expect(mime).toBe('application/pdf');
  });
});

describe('fingerprintBody', () => {
  it('hashes exactly the bytes it reports storing', async () => {
    const body = 'player,ab\nDoe,3';
    const fp = await fingerprintBody(body);
    expect(fp.fileHash).toBe(await sha256Hex(fp.bytes));
    expect(fp.fileBytes).toBe(fp.bytes.byteLength);
  });

  it('a text body and the same content via binary envelope yield the same hash', async () => {
    const text = 'col1,col2\n1,2';
    const textFp = await fingerprintBody(text);
    const envelope = encodeBinaryBody(new TextEncoder().encode(text), 'text/csv');
    const binFp = await fingerprintBody(envelope);
    // Same underlying bytes => same content hash, regardless of transport shape.
    expect(binFp.fileHash).toBe(textFp.fileHash);
  });
});
