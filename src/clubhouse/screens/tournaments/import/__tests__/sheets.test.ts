import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { columnOf, readDelimited, readHtmlTables, readResultsBytes, readResultsText, sniffDelimiter } from '../sheets';

/** A small but real workbook: two sheets, shared and inline strings, a number Excel stored with a float tail. */
function workbook(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        '<sheet name="Round 1" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Team &amp; field" sheetId="3" r:id="rId3"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet3.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8('<?xml version="1.0"?><sst><si><t>Player</t></si><si><r><t>Smith, </t></r><r><t xml:space="preserve">John</t></r></si><si><t>Team</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0"?><worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>1</v></c><c r="D1"><v>2</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3"><v>4.0000000000000009</v></c><c r="D3" t="inlineStr"><is><t>5</t></is></c></row>' +
        '</sheetData></worksheet>',
    ),
    'xl/worksheets/sheet2.xml': strToU8('<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>9</v></c></row></sheetData></worksheet>'),
    'xl/worksheets/sheet3.xml': strToU8('<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="B1" t="s"><v>2</v></c></row></sheetData></worksheet>'),
  };
  return zipSync(files);
}

describe('results import: reading a file', () => {
  it('reads every visible sheet of a workbook, keeping each value in its own column', () => {
    const read = readResultsBytes(workbook(), 'gg.xlsx');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.sheets.map((s) => s.name)).toEqual(['Round 1', 'Team & field']);
    const r1 = read.sheets[0]!.rows;
    expect(r1[0]).toEqual(['Player', '', '1', '2']);
    // A blank row 2 stays a row, so row numbers match the file.
    expect(r1[1]).toEqual(['', '', '', '']);
    expect(r1[2]).toEqual(['Smith, John', '', '4', '5']);
    expect(read.sheets[1]!.rows[0]).toEqual(['', 'Team']);
  });

  it('refuses the old binary Excel format, PDFs and images with a reason the sheet can explain', () => {
    expect(readResultsBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toEqual({ ok: false, reason: 'binary_xls' });
    expect(readResultsBytes(strToU8('%PDF-1.7 ...'))).toEqual({ ok: false, reason: 'pdf' });
    expect(readResultsBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]))).toEqual({ ok: false, reason: 'image' });
    expect(readResultsBytes(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
    expect(readResultsBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toEqual({ ok: false, reason: 'broken' });
  });

  it('reads CSV with quoted commas, quotes and line breaks', () => {
    const rows = readDelimited('Player,Team,R1\n"Smith, John","Demo ""U""",72\n"Two\nLines",X,70\n');
    expect(rows).toEqual([
      ['Player', 'Team', 'R1'],
      ['Smith, John', 'Demo "U"', '72'],
      ['Two\nLines', 'X', '70'],
    ]);
  });

  it('picks the delimiter a pasted table uses: tabs, then semicolons, then commas', () => {
    expect(sniffDelimiter('Pos\tPlayer\tTotal\n1\tA, B\t70')).toBe('\t');
    expect(sniffDelimiter('Pos;Player;Total\n1;A;70')).toBe(';');
    expect(sniffDelimiter('Pos,Player,Total')).toBe(',');
  });

  it('reads Excel’s Unicode text (UTF-16 with tabs)', () => {
    const text = 'Player\tTotal\nAva Lind\t71\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) bytes[2 + i * 2] = text.charCodeAt(i);
    const read = readResultsBytes(bytes, 'board.txt');
    expect(read.ok && read.sheets[0]!.rows).toEqual([
      ['Player', 'Total'],
      ['Ava Lind', '71'],
    ]);
  });

  it('reads web tables (an .xls download that is HTML, or a copied leaderboard), honouring colspan', () => {
    const html = '<html><body><table><tr><th>Pos</th><th colspan="2">Player</th><th>Tot</th></tr><tr><td>T1</td><td><b>Ava</b>&nbsp;Lind</td><td>(a)</td><td>140</td></tr></table></body></html>';
    expect(readHtmlTables(html)).toEqual([
      {
        name: 'Table',
        rows: [
          ['Pos', 'Player', '', 'Tot'],
          ['T1', 'Ava Lind', '(a)', '140'],
        ],
      },
    ]);
    expect(readResultsText(html).ok).toBe(true);
  });

  it('turns cell references into columns', () => {
    expect(columnOf('A1')).toBe(0);
    expect(columnOf('Z9')).toBe(25);
    expect(columnOf('AA10')).toBe(26);
  });

  it('says a paste is empty rather than reading nothing', () => {
    expect(readResultsText('  \n\t\n')).toEqual({ ok: false, reason: 'empty' });
  });

  it('a cell keeps only its text, even when a tag is split around another or left open', () => {
    const html = '<table><tr><td><scr<b>ipt>alert(1)</script>Ava</td><td>7<i>2</i> <script>x</script></td><td>a < b</td></tr></table>';
    const cells = readHtmlTables(html)[0]!.rows[0]!;
    for (const c of cells) expect(c).not.toMatch(/[<>]/);
    expect(cells[1]).toBe('72');
  });
});
