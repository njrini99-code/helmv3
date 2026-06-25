// =============================================================================
// src/lib/baseball/adapters/pdf-reader.ts
//
// Packet: qa-screens / stats-integrations (BaseballHelm — imports DEEPEN)
//
// A deliberately CONSERVATIVE PDF text-extraction PLACEHOLDER that honours the
// registry's `pdf_extract` rule verbatim:
//   "extract text if a parser exists, else preserve as a source document for
//    manual row mapping. Never silently commit low-confidence extraction to
//    official stats."
//
// We do NOT ship a full PDF layout engine (that would need a heavy dependency and
// still misread tabular box scores). Instead we do a best-effort, dependency-light
// text scan — pulling visible text out of the PDF's content streams (decompressing
// FlateDecode streams with `fflate`, already a dependency) — so the coach SEES what
// is in the file and can hand-map it. Critically:
//   * It produces ZERO committable event rows (grain extraction from arbitrary PDF
//     layout is exactly the "low-confidence extraction" the rule forbids).
//   * It returns the preserved text + a hard "manual review required" signal so the
//     UI routes the file to manual mapping, never to an auto-commit band.
//
// PURE: no DB, no DOM, no 'use server'.
// =============================================================================

import { inflateSync, strFromU8 } from 'fflate';

export interface PdfExtractResult {
  /** Best-effort visible text pulled from the PDF content streams. */
  text: string;
  /** Number of stream objects we could read text from. */
  streamsRead: number;
  /** Whether any text was recovered at all. */
  hasText: boolean;
  warnings: string[];
}

const PDF_MAGIC = '%PDF-';

/** True when a buffer begins with the PDF magic bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = strFromU8(bytes.subarray(0, 8));
  return head.startsWith(PDF_MAGIC);
}

/**
 * Pull the TJ/Tj text-show operands out of a decoded content stream. PDF text is
 * drawn by `(literal) Tj` and `[ (a) -250 (b) ] TJ` operators inside BT…ET blocks;
 * we collect the parenthesised literals (decoding the handful of escapes that
 * matter) and the <hex> strings. This is intentionally simple — enough for a coach
 * to recognise names/numbers and hand-map them, not a faithful layout reconstruction.
 */
function extractTextOperands(content: string): string {
  const out: string[] = [];
  // Parenthesised literal strings: ( ... ) with \) \( \\ escapes.
  const litRe = /\((?:\\.|[^\\()])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = litRe.exec(content)) !== null) {
    const inner = m[0]!.slice(1, -1);
    out.push(
      inner
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\'),
    );
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Best-effort extraction. Walks `stream … endstream` blocks, inflates the ones that
 * are FlateDecode (the overwhelmingly common case for modern exporters), and scrapes
 * text operands. Uncompressed streams are scanned directly. Never throws.
 */
export function extractPdfText(bytes: Uint8Array): PdfExtractResult {
  const warnings: string[] = [];
  if (!looksLikePdf(bytes)) {
    return {
      text: '',
      streamsRead: 0,
      hasText: false,
      warnings: ['This does not look like a PDF file (missing %PDF header).'],
    };
  }

  // Decode the whole file as latin1 so byte offsets line up with the binary content
  // (we only need ASCII operators + stream boundaries; binary stream bytes are
  // re-read from the original buffer by offset).
  const latin1 = (() => {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return s;
  })();

  const pieces: string[] = [];
  let streamsRead = 0;

  const streamRe = /stream\r?\n/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRe.exec(latin1)) !== null) {
    const dataStart = sm.index + sm[0].length;
    const endIdx = latin1.indexOf('endstream', dataStart);
    if (endIdx < 0) break;
    // Trim a trailing EOL before endstream.
    let dataEnd = endIdx;
    if (latin1[dataEnd - 1] === '\n') dataEnd--;
    if (latin1[dataEnd - 1] === '\r') dataEnd--;

    const isFlate = /\/FlateDecode/.test(latin1.slice(Math.max(0, sm.index - 400), sm.index));
    const rawBytes = bytes.subarray(dataStart, dataEnd);

    let content = '';
    if (isFlate) {
      try {
        content = strFromU8(inflateSync(rawBytes));
        streamsRead++;
      } catch {
        // Some encoders prepend the zlib header differently; skip silently.
      }
    } else {
      content = latin1.slice(dataStart, dataEnd);
      streamsRead++;
    }
    if (content) {
      const t = extractTextOperands(content);
      if (t) pieces.push(t);
    }
  }

  const text = pieces.join('\n').trim();
  if (!text) {
    warnings.push(
      'No selectable text was recovered — this PDF is likely scanned/image-only. ' +
        'Re-export as CSV/XLSX, or type the lines into the box-score wizard.',
    );
  }
  return { text, streamsRead, hasText: text.length > 0, warnings };
}
