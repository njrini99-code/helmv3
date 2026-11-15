// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chCsv, chCsvCell, chCsvName, csvPlace, csvRound, saveCsv } from '../csv';

/** Launch readiness F-02: every Clubhouse export is built by lib/csv.ts. */
describe('chCsvCell', () => {
  it('writes numbers bare with an ASCII minus, so a spreadsheet sums them', () => {
    expect(chCsvCell(72)).toBe('72');
    expect(chCsvCell(-6)).toBe('-6');
    expect(chCsvCell(0)).toBe('0');
    expect(chCsvCell(71.4)).toBe('71.4');
    expect(chCsvCell(Number.NaN)).toBe('');
    expect(chCsvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('writes nothing as an empty cell and a flag as Yes or No', () => {
    expect(chCsvCell(null)).toBe('');
    expect(chCsvCell(undefined)).toBe('');
    expect(chCsvCell('')).toBe('');
    expect(chCsvCell(true)).toBe('Yes');
    expect(chCsvCell(false)).toBe('No');
  });

  it('quotes text and doubles its quotes, so commas and line breaks stay in their cell', () => {
    expect(chCsvCell('Pinehurst No. 2')).toBe('"Pinehurst No. 2"');
    expect(chCsvCell('Smith, Jr.')).toBe('"Smith, Jr."');
    expect(chCsvCell('The "Old" Course')).toBe('"The ""Old"" Course"');
    expect(chCsvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('opens text a spreadsheet would run as a formula as text, behind a control character too', () => {
    expect(chCsvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(chCsvCell('+1')).toBe('"\'+1"');
    expect(chCsvCell('-2')).toBe('"\'-2"');
    expect(chCsvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(chCsvCell('\t=1+1')).toBe('"\'\t=1+1"');
    // A name, a tie and a status are left as they are.
    expect(chCsvCell('O’Neil')).toBe('"O’Neil"');
    expect(chCsvCell('T3')).toBe('"T3"');
  });
});

describe('chCsv', () => {
  it('starts with the byte order mark and ends every line CRLF', () => {
    const text = chCsv(
      ['Player', 'Score', 'To par'],
      [
        ['Ava Lindqvist', 70, -2],
        ['Théo Marchetti', null, null],
      ],
    );
    expect(text.startsWith('﻿')).toBe(true);
    expect(text.slice(1)).toBe('"Player","Score","To par"\r\n"Ava Lindqvist",70,-2\r\n"Théo Marchetti",,\r\n');
  });
});

describe('csvRound', () => {
  it('rounds to its places as a number, and passes nothing through', () => {
    expect(csvRound(71.449, 1)).toBe(71.4);
    expect(csvRound(-0.526, 2)).toBe(-0.53);
    expect(csvRound(0.1 + 0.2, 1)).toBe(0.3);
    expect(csvRound(null)).toBeNull();
    expect(csvRound(Number.NaN)).toBeNull();
  });
});

describe('csvPlace', () => {
  it('writes a plain place as a number, so the column sorts 1, 2, 10, and a tie as written', () => {
    expect(csvPlace('1')).toBe(1);
    expect(csvPlace('10')).toBe(10);
    expect(csvPlace('T3')).toBe('T3');
    expect(csvPlace(4)).toBe(4);
    expect(csvPlace(null)).toBeNull();
    expect(csvPlace('')).toBeNull();
  });
});

describe('chCsvName', () => {
  it('makes a plain file name from its parts', () => {
    expect(chCsvName('Demo University', 'rounds', '2026-11-15')).toBe('demo-university-rounds-2026-11-15.csv');
    expect(chCsvName('Spring Qualifier: Round 2', 'standings')).toBe('spring-qualifier-round-2-standings.csv');
    expect(chCsvName('Théo’s Invitational', null, '', undefined, 'results')).toBe('theo-s-invitational-results.csv');
    expect(chCsvName('', null)).toBe('export.csv');
  });
});

describe('saveCsv', () => {
  const file = { name: 'rounds.csv', head: ['Score'], rows: [[70]] };
  const realShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const realCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  afterEach(() => {
    vi.restoreAllMocks();
    if (realShare) Object.defineProperty(navigator, 'share', realShare);
    else delete (navigator as { share?: unknown }).share;
    if (realCanShare) Object.defineProperty(navigator, 'canShare', realCanShare);
    else delete (navigator as { canShare?: unknown }).canShare;
  });

  function stubShare(share: (data: ShareData) => Promise<void>) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn(share) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
  }

  it('downloads the file on a computer', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    stubShare(async () => {});
    await expect(saveCsv(file, { share: false })).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('rounds.csv');
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it('hands the file to the share sheet on a phone, and closing the sheet is not a failure', async () => {
    stubShare(async () => {});
    await expect(saveCsv(file, { share: true })).resolves.toBe('shared');
    const shared = (navigator.share as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ShareData;
    expect(shared.files?.[0]?.name).toBe('rounds.csv');
    expect(shared.files?.[0]?.type).toBe('text/csv;charset=utf-8');

    stubShare(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    await expect(saveCsv(file, { share: true })).resolves.toBe('cancelled');

    stubShare(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    await expect(saveCsv(file, { share: true })).rejects.toThrow('no');
  });
});
