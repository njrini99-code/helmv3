// @vitest-environment node
// =============================================================================
// src/lib/baseball/__tests__/import-formats.test.ts
//
// Runs in the NODE environment (not jsdom): fflate's zip/unzip relies on real
// Node typed-array semantics, and jsdom's structured-clone shim corrupts archive
// entry keys. The XLSX/PDF readers run server-side (Node) in production anyway.
//
// Locks the imports DEEPEN invariants: BaseballHelm can ingest the formats real
// official + tracking exports actually ship in — XLSX (workbooks), the full set of
// official-game XML providers (Presto/NCAA/SIDEARM/StatBroadcast on top of
// GameChanger/StatCrew), and a CONSERVATIVE PDF preserve-for-manual path that never
// auto-commits. Asserts the binary-envelope transport, the XLSX→CSV bridge that
// gives every CSV adapter workbook support, and the "never fabricate" rules.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import {
  readXlsx,
  xlsxToCsv,
  columnRefToIndex,
} from '@/lib/baseball/adapters/xlsx-reader';
import {
  encodeBinaryBody,
  decodeImportBody,
  isBinaryBody,
  isBinaryFileName,
} from '@/lib/baseball/adapters/import-file-body';
import {
  parsePrestoSportsXml,
  parseStatBroadcastXml,
} from '@/lib/baseball/adapters/official-xml-adapters';
import { parsePdfExtract } from '@/lib/baseball/adapters/pdf-adapter';
import { extractPdfText, looksLikePdf } from '@/lib/baseball/adapters/pdf-reader';
import {
  getConcreteParser,
  hasConcreteEventAdapter,
  detectSourceFile,
} from '@/lib/baseball/adapters';

// ---------------------------------------------------------------------------
// Helper: build a minimal-but-real .xlsx workbook in memory (ZIP of XML parts).
// ---------------------------------------------------------------------------
function makeXlsx(rows: string[][]): Uint8Array {
  // sharedStrings: every distinct text cell.
  const distinct: string[] = [];
  const idxOf = (s: string): number => {
    let i = distinct.indexOf(s);
    if (i < 0) {
      i = distinct.length;
      distinct.push(s);
    }
    return i;
  };
  const colLetter = (c: number): string => {
    let n = c + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  const rowXml = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === '') return '';
          // numbers as numeric cells, everything else as a shared string.
          if (/^-?\d+(\.\d+)?$/.test(cell)) {
            return `<c r="${colLetter(c)}${r + 1}"><v>${cell}</v></c>`;
          }
          return `<c r="${colLetter(c)}${r + 1}" t="s"><v>${idxOf(cell)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  const sharedStrings = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${distinct.length}" uniqueCount="${distinct.length}">${distinct
    .map((s) => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`)
    .join('')}</sst>`;
  const workbook = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hitting" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(sharedStrings),
  });
}

// ---------------------------------------------------------------------------
// XLSX reader
// ---------------------------------------------------------------------------
describe('xlsx-reader', () => {
  it('A1-style column refs decode to zero-based indices', () => {
    expect(columnRefToIndex('A1')).toBe(0);
    expect(columnRefToIndex('B2')).toBe(1);
    expect(columnRefToIndex('Z9')).toBe(25);
    expect(columnRefToIndex('AA1')).toBe(26);
    expect(columnRefToIndex('AB1')).toBe(27);
  });

  it('reads the first worksheet into header + aligned rows', () => {
    const xlsx = makeXlsx([
      ['Player', 'AB', 'H'],
      ['Smith, John', '4', '2'],
      ['Doe, Jane', '3', '1'],
    ]);
    const out = readXlsx(xlsx);
    expect(out.headers).toEqual(['Player', 'AB', 'H']);
    expect(out.rows[0]).toEqual(['Smith, John', '4', '2']);
    expect(out.rows[1]).toEqual(['Doe, Jane', '3', '1']);
    expect(out.sheetName).toBe('Hitting');
  });

  it('preserves blank middle cells (does not shift columns)', () => {
    // Row 2 has no AB value — the blank must stay column 2, not collapse left.
    const xlsx = makeXlsx([
      ['Player', 'AB', 'H'],
      ['Gap Guy', '', '5'],
    ]);
    const out = readXlsx(xlsx);
    expect(out.rows[0]).toEqual(['Gap Guy', '', '5']);
  });

  it('quote-escapes when flattening to CSV so a comma name never shifts a column', () => {
    const xlsx = makeXlsx([
      ['Player', 'AB'],
      ['Smith, John', '4'],
    ]);
    const { csv } = xlsxToCsv(xlsx);
    expect(csv).toContain('"Smith, John",4');
  });

  it('returns an honest warning (not a throw) on a non-xlsx buffer', () => {
    const out = readXlsx(strToU8('this is not a zip'));
    expect(out.headers).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Binary-envelope transport
// ---------------------------------------------------------------------------
describe('import-file-body transport', () => {
  it('round-trips arbitrary bytes through the base64 envelope', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64, 13, 10]);
    const body = encodeBinaryBody(bytes, 'application/octet-stream');
    expect(isBinaryBody(body)).toBe(true);
    const decoded = decodeImportBody(body);
    expect(decoded.kind).toBe('binary');
    if (decoded.kind === 'binary') {
      expect([...decoded.bytes]).toEqual([...bytes]);
      expect(decoded.mime).toBe('application/octet-stream');
    }
  });

  it('passes plain text through untouched', () => {
    const decoded = decodeImportBody('Pitcher,Velo\nSmith,92');
    expect(decoded.kind).toBe('text');
    if (decoded.kind === 'text') expect(decoded.text).toContain('Pitcher,Velo');
  });

  it('classifies binary file names', () => {
    expect(isBinaryFileName('export.xlsx')).toBe(true);
    expect(isBinaryFileName('boxscore.PDF')).toBe(true);
    expect(isBinaryFileName('trackman.csv')).toBe(false);
    expect(isBinaryFileName('game.xml')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// XLSX flows through a CSV-based adapter via the registered wrapper.
// ---------------------------------------------------------------------------
describe('XLSX -> CSV adapter bridge', () => {
  it('a Blast workbook produces swing events through the registered adapter', () => {
    const xlsx = makeXlsx([
      ['Player', 'Bat Speed (mph)', 'Attack Angle (deg)'],
      ['Smith, John', '72', '12'],
      ['Doe, Jane', '65', '9'],
    ]);
    const body = encodeBinaryBody(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const parser = getConcreteParser('blast_csv')!;
    const res = parser(body);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0]!.grain).toBe('swing');
    // The "read worksheet" note is folded in from the XLSX reader.
    expect(res.warnings.join(' ')).toMatch(/worksheet/i);
  });
});

// ---------------------------------------------------------------------------
// Official-game XML providers beyond GameChanger/StatCrew.
// ---------------------------------------------------------------------------
describe('official XML providers', () => {
  const PBP = `<?xml version="1.0"?>
    <bsgame>
      <plays>
        <play id="p1" pitcher="Jones, A" batter="Lee, B" pitches="BCSX"/>
      </plays>
    </bsgame>`;

  it('PrestoSports parses pitch rows from a ball/strike code string with NULL velocity', () => {
    const res = parsePrestoSportsXml(PBP);
    expect(res.sourceKey).toBe('prestosports_xml');
    expect(res.rows.length).toBe(4); // B C S X
    for (const row of res.rows) {
      expect(row.grain).toBe('pitch');
      // honest: a code string carries NO measured velocity.
      expect((row as { fields: { velocity: number | null } }).fields.velocity).toBeNull();
    }
  });

  it('StatBroadcast reuses the same honest extraction', () => {
    const res = parseStatBroadcastXml(PBP);
    expect(res.sourceKey).toBe('statbroadcast_xml');
    expect(res.rows.length).toBe(4);
  });

  it('every official XML provider is a registered concrete adapter', () => {
    for (const key of [
      'gamechanger_xml',
      'statcrew_xml',
      'prestosports_xml',
      'ncaa_live_stats',
      'sidearm_xml',
      'statbroadcast_xml',
    ]) {
      expect(hasConcreteEventAdapter(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PDF preserve-for-manual — NEVER auto-commits.
// ---------------------------------------------------------------------------
describe('PDF preserve-for-manual', () => {
  // A tiny uncompressed PDF with one visible text literal.
  const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog>>endobj
2 0 obj<</Length 44>>
stream
BT /F1 12 Tf (Smith 4 2 1 RBI) Tj ET
endstream
endobj
%%EOF`;

  it('detects the PDF magic header', () => {
    expect(looksLikePdf(new TextEncoder().encode(PDF))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('hello'))).toBe(false);
  });

  it('recovers visible text from an uncompressed content stream', () => {
    const out = extractPdfText(new TextEncoder().encode(PDF));
    expect(out.text).toContain('Smith 4 2 1 RBI');
    expect(out.hasText).toBe(true);
  });

  it('the adapter yields ZERO committable rows but preserves the text', () => {
    const body = encodeBinaryBody(new TextEncoder().encode(PDF), 'application/pdf');
    const res = parsePdfExtract(body);
    expect(res.rows.length).toBe(0); // hard rule: never auto-commit a PDF stat.
    expect(res.preservedText).toContain('Smith 4 2 1 RBI');
    expect(res.warnings.join(' ')).toMatch(/never auto-commit/i);
  });

  it('detection routes a PDF into the do_not_commit band', () => {
    const body = encodeBinaryBody(new TextEncoder().encode(PDF), 'application/pdf');
    const detection = detectSourceFile('pdf_extract', body);
    expect(detection.eventRowCount).toBe(0);
    expect(detection.autoCommit).toBe('do_not_commit');
    expect(detection.preservedText).toContain('Smith');
  });
});
