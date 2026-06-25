// =============================================================================
// src/lib/baseball/adapters/import-file-body.ts
//
// Packet: qa-screens / stats-integrations (BaseballHelm — imports DEEPEN)
//
// The file-body envelope that lets BINARY uploads (XLSX, PDF) travel through the
// EXISTING string parse seam — `parse(body: string): ConcreteParseResult` and the
// legacy `previewImport({ csvContent })` — without changing every adapter to take
// an ArrayBuffer.
//
// THE PROBLEM: text adapters (CSV/TSV/XML) read a `string` body. XLSX and PDF are
// binary; FileReader.readAsText corrupts them. Rather than fork the whole seam, the
// client reads a binary file with readAsArrayBuffer and wraps it as a tiny, opaque
// envelope string:  "baseballhelm:b64:<mime>:<base64>". The server decodes it back
// to bytes for the XLSX/PDF readers. Plain text bodies pass through untouched, so
// nothing about the CSV/XML path changes.
//
// PURE: no DB, no DOM, no 'use server'. `encodeBinaryBody` runs client-side (after
// FileReader); `decodeImportBody` runs server-side in the parse path.
// =============================================================================

export const BINARY_BODY_PREFIX = 'baseballhelm:b64:';

export type DecodedImportBody =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; mime: string; bytes: Uint8Array };

/**
 * Wrap raw bytes (e.g. an XLSX/PDF ArrayBuffer) as the opaque transport string.
 * Uses btoa in the browser; falls back to Buffer on the server (for tests).
 */
export function encodeBinaryBody(bytes: ArrayBuffer | Uint8Array, mime: string): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let b64: string;
  if (typeof btoa === 'function') {
    // Chunk to avoid call-stack limits on String.fromCharCode for large files.
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) {
      binary += String.fromCharCode(...u8.subarray(i, i + CHUNK));
    }
    b64 = btoa(binary);
  } else {
    // Node / test environment.
    b64 = Buffer.from(u8).toString('base64');
  }
  return `${BINARY_BODY_PREFIX}${mime}:${b64}`;
}

/** True when a body string is the binary envelope (vs plain text). */
export function isBinaryBody(body: string): boolean {
  return body.startsWith(BINARY_BODY_PREFIX);
}

/**
 * Decode a transport body: plain text passes through; the binary envelope is
 * base64-decoded back to bytes + its mime. Malformed envelopes degrade to empty
 * bytes with the original mime so the reader surfaces an honest "could not read"
 * warning rather than throwing.
 */
export function decodeImportBody(body: string): DecodedImportBody {
  if (!isBinaryBody(body)) return { kind: 'text', text: body };
  const rest = body.slice(BINARY_BODY_PREFIX.length);
  const sep = rest.indexOf(':');
  const mime = sep >= 0 ? rest.slice(0, sep) : '';
  const b64 = sep >= 0 ? rest.slice(sep + 1) : '';
  let bytes: Uint8Array;
  try {
    if (typeof atob === 'function') {
      const binary = atob(b64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    }
  } catch {
    bytes = new Uint8Array(0);
  }
  return { kind: 'binary', mime, bytes };
}

/** File extensions that must be read as BINARY (ArrayBuffer), not text. */
export function isBinaryFileName(fileName: string): boolean {
  return /\.(xlsx|xlsm|xlsb|pdf)$/i.test(fileName);
}
