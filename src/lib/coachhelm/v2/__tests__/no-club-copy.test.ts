/**
 * Guard: CoachHelm v2 copy names no clubs.
 *
 * Owner rule (2026-10-21): CoachHelm does not do clubs. Players do not record
 * them, so v2 reads speak in shot type, distance band, carry, contact and
 * target, and the only club-like word allowed is "driver" (tee shots are
 * driver or not driver).
 *
 * The test reads every string literal and template-literal text in the
 * non-test v2 sources with the TypeScript parser (comments are not strings,
 * so they are not scanned) and fails on any club word. The few literals that
 * are keys, ids or column names, never shown to a player or coach, are listed
 * by exact value in NON_COPY_LITERALS.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  deterministicShotPatternId,
  shotPatternSignature,
} from '../mining/shot-pattern-miner';

const V2_ROOT = join(__dirname, '..');

const CLUB_WORD =
  /\b(clubs?|clubbing|clubbed|club-?face|club up|club down|under-?clubbing|over-?clubbing|irons?|long-iron|mid-iron|short-iron|woods?|3-wood|5-wood|fairway wood|hybrids?|wedges?|choke down|choking down|putter)\b/i;

/** Literals that are ids, keys or column names, never rendered copy. */
const NON_COPY_LITERALS = new Set<string>([
  // Stable insight id; renaming it would orphan stored rows.
  'root-cause-club-selection',
  // Legacy band label kept only so shot-pattern ids stay stable.
  'Wedge (0-50)',
]);

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue;
      out.push(...listSources(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function isPropertyKeyOrTypePosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  return false;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function findClubWordsInStrings(file: string): Hit[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const check = (node: ts.Node, text: string) => {
    if (NON_COPY_LITERALS.has(text)) return;
    if (!CLUB_WORD.test(text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    hits.push({ file: relative(V2_ROOT, file), line: line + 1, text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isPropertyKeyOrTypePosition(node)) check(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      check(node.head, node.head.text);
      for (const span of node.templateSpans) check(span.literal, span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe('CoachHelm v2 copy names no clubs', () => {
  const sources = listSources(V2_ROOT);

  it('scans the v2 sources', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((f) => f.endsWith('stats-insight-generator.ts'))).toBe(true);
  });

  it('has no club word in any string literal (driver is the only allowed club)', () => {
    const hits = sources.flatMap(findClubWordsInStrings);
    expect(hits).toEqual([]);
  });

  it('the pattern catches the phrasings it replaced', () => {
    for (const phrase of [
      'Consider taking one more club',
      'an open club face at impact',
      'Hitting 3-wood on tight holes',
      'Strong iron play',
      'your best wedge distance',
      'under-clubbing',
      'Consider taking less club or choking down.',
    ]) {
      expect(CLUB_WORD.test(phrase), phrase).toBe(true);
    }
    expect(CLUB_WORD.test("a tee shot that isn't driver")).toBe(false);
    expect(CLUB_WORD.test('Driver (220+)')).toBe(false);
  });
});

describe('renamed distance band keeps its shot-pattern id', () => {
  it('Inside 50 (0-50) signs exactly like the old Wedge (0-50) label', () => {
    const player = '11111111-1111-4111-8111-111111111111';
    for (const lie of ['all', 'fairway', 'rough']) {
      expect(shotPatternSignature('Inside 50 (0-50)', lie)).toBe(
        shotPatternSignature('Wedge (0-50)', lie),
      );
      expect(deterministicShotPatternId(player, shotPatternSignature('Inside 50 (0-50)', lie))).toBe(
        deterministicShotPatternId(player, 'shot_dispersion::Wedge (0-50)::' + lie),
      );
    }
  });

  it('other band labels sign as themselves', () => {
    expect(shotPatternSignature('Mid (130-160)', 'fairway')).toBe('shot_dispersion::Mid (130-160)::fairway');
  });
});
