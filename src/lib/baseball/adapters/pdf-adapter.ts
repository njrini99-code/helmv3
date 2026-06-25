// =============================================================================
// src/lib/baseball/adapters/pdf-adapter.ts
//
// Packet: qa-screens / stats-integrations (BaseballHelm — imports DEEPEN)
//
// The CONCRETE adapter for the `pdf_extract` registry source. It is deliberately a
// PRESERVE-FOR-MANUAL adapter, NOT an auto-extractor: it best-effort-pulls visible
// text out of the PDF (so the coach can read + hand-map it) but emits ZERO
// committable event rows, because grain extraction from arbitrary PDF box-score
// layout is precisely the "low-confidence extraction" the registry rule forbids:
//
//   pdf_extract: "extract text if a parser exists, else preserve as a source
//   document for manual row mapping. Never silently commit low-confidence
//   extraction to official stats."
//
// Returning zero rows means the detect step lands in the `do_not_commit` band and
// the diff viewer has nothing to commit — the file is held for manual mapping, by
// construction. The preserved text rides along on `preservedText` for the UI.
//
// PURE: no DB, no DOM, no 'use server'.
// =============================================================================

import type { ConcreteParseResult } from '@/lib/baseball/adapters/tracking-adapters';
import { decodeImportBody } from '@/lib/baseball/adapters/import-file-body';
import { extractPdfText, looksLikePdf } from '@/lib/baseball/adapters/pdf-reader';

export function parsePdfExtract(body: string): ConcreteParseResult {
  const decoded = decodeImportBody(body);
  const bytes =
    decoded.kind === 'binary' ? decoded.bytes : new TextEncoder().encode(decoded.text);

  if (!looksLikePdf(bytes)) {
    return {
      sourceKey: 'pdf_extract',
      rows: [],
      rowsRead: 0,
      warnings: ['This file is not a PDF. Choose a PDF box score, or use the CSV/XLSX path.'],
      preservedText: '',
    };
  }

  const { text, hasText, warnings } = extractPdfText(bytes);
  const notes = [
    'PDF box scores are preserved for manual mapping — BaseballHelm never auto-commits ' +
      'numbers guessed from a PDF layout. Read the recovered text below and enter the lines ' +
      'in the box-score wizard, or re-export the source as CSV/XLSX for a full import.',
    ...warnings,
  ];

  return {
    sourceKey: 'pdf_extract',
    rows: [], // ALWAYS zero — never silently commit a PDF-extracted stat.
    rowsRead: 0,
    warnings: notes,
    preservedText: hasText ? text : '',
  };
}
