// =============================================================================
// src/lib/baseball/adapters/file-fingerprint.ts
//
// Packet: qa-screens (Import Dossier + adapters — stats-integrations DEEPEN)
//
// GAP 2 — the file fingerprint the "same file hash is ignored as duplicate"
// invariant needs. PURE module (no 'use server', no DB, no DOM) so it is safe to
// import from a server action, a read model, or a unit test, and runs on both the
// Edge and Node 20 runtimes via the Web Crypto SubtleCrypto API.
//
// CRITICAL (anti-tamper): the SERVER recomputes the hash from the EXACT bytes it
// stores. `bodyToStoredBytes` canonicalizes the wizard's transport body (a plain
// text CSV/XML string OR the binary base64 envelope from import-file-body.ts) into
// the same Uint8Array the storage upload writes, so the persisted file_hash always
// describes the persisted file — a client cannot poison dedupe with a forged hash.
//
// SHA-256 is content-addressing only (dedupe + audit), NOT a security primitive.
// =============================================================================

import { decodeImportBody } from '@/lib/baseball/adapters/import-file-body';

/**
 * SHA-256 of `bytes` (or a UTF-8 string), returned as lowercase hex. Uses the
 * Web Crypto SubtleCrypto digest available in both Edge and Node 20 runtimes.
 */
export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('SubtleCrypto is unavailable in this runtime.');
  }
  // Copy into a fresh ArrayBuffer so a Uint8Array view with a non-zero offset
  // (e.g. a subarray) never hashes neighboring bytes, and the BufferSource is a
  // plain ArrayBuffer (avoids ArrayBufferLike/SharedArrayBuffer typing friction).
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await subtle.digest('SHA-256', copy);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The bytes + mime that will be PERSISTED to storage for a given wizard transport
 * body. A plain-text body (CSV/TSV/XML) is stored as UTF-8 bytes; a binary
 * envelope (XLSX/PDF) is decoded back to its raw bytes + original mime. This is
 * the single source of truth both the upload and the hash read, so they agree.
 */
export function bodyToStoredBytes(body: string): { bytes: Uint8Array; mime: string } {
  const decoded = decodeImportBody(body);
  if (decoded.kind === 'binary') {
    return {
      bytes: decoded.bytes,
      mime: decoded.mime || 'application/octet-stream',
    };
  }
  return {
    bytes: new TextEncoder().encode(decoded.text),
    mime: 'text/plain; charset=utf-8',
  };
}

/**
 * Compute the canonical file fingerprint for a wizard transport body: the bytes
 * to store, their mime, the SHA-256 hex over EXACTLY those bytes, and the byte
 * count. The action uploads `bytes`, then persists `{ file_hash, file_bytes }`
 * from this same result — so the stored hash always describes the stored file.
 */
export async function fingerprintBody(body: string): Promise<{
  bytes: Uint8Array;
  mime: string;
  fileHash: string;
  fileBytes: number;
}> {
  const { bytes, mime } = bodyToStoredBytes(body);
  const fileHash = await sha256Hex(bytes);
  return { bytes, mime, fileHash, fileBytes: bytes.byteLength };
}
