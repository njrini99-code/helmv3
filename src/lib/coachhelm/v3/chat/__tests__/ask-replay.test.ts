/**
 * Offline replay of Ask's grounding audit over stored staging turns (see ask-replay-harness.ts).
 *
 * Three questions, answered without a model or a database:
 *
 *  1. Wrong blocks: of the stored answers whose figures are all true (hand labels in
 *     fixtures/ask-turn-labels.json), how many does the audit reject?
 *  2. Wrong accepts, real: of the stored answers that state something false, how many does it let through?
 *  3. Wrong accepts, constructed: of deliberately corrupted copies (a changed figure, a figure moved to another
 *     player, an invented date), how many does it let through?
 *
 * A label carrying `knownWrongBlock` / `knownWrongAccept` is a gap the audit has today: the suite reports it and
 * passes. Everything else must match its label, and a new gap fails the suite. When the audit is fixed the entry
 * starts matching its label and the run says so; set ASK_REPLAY_STRICT=1 to make every known gap fail, which is how
 * to confirm a fix closed them. ASK_REPLAY_REPORT=<path> writes the numbers as JSON.
 *
 * Re-export fixtures: node scripts/coachhelm/export-ask-turns.mjs --apply (then label any new turn).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadFixtures, loadLabels, replayVerdict, VERDICT_ARGS, type AskFixture, type AskLabel } from './ask-replay-harness';
import { answerText, corruptionsFor, type Corruption, type CorruptionKind } from './ask-replay-corruptions';

const STRICT = process.env.ASK_REPLAY_STRICT === '1';
const KNOWN_GAPS_PATH = join(__dirname, 'fixtures', 'ask-known-gaps.json');

const fixtures = loadFixtures();
const labels = loadLabels();
const knownGaps = JSON.parse(readFileSync(KNOWN_GAPS_PATH, 'utf8')) as { acceptedCorruptions: string[] };

interface RealResult {
  fixture: AskFixture;
  label: AskLabel;
  actual: 'accepted' | 'rejected';
  flagged: string[];
}
const real: RealResult[] = fixtures.map((fixture) => {
  // A missing label fails the first test below; a placeholder keeps the rest of the module (and ASK_REPLAY_DUMP) running.
  const label: AskLabel = labels[fixture.id] ?? { expect: 'incomplete', why: 'UNLABELLED' };
  const verdict = replayVerdict(fixture);
  return {
    fixture,
    label,
    actual: verdict.outcome,
    flagged: verdict.outcome === 'rejected' ? (verdict.unsupported ?? []).map((u) => u.text) : [],
  };
});

/** Stored turns only: the hand-written citation fixtures are asserted below but belong in no rate. */
const stored = real.filter((r) => !r.fixture.authored);

interface CorruptionResult {
  corruption: Corruption;
  actual: 'accepted' | 'rejected';
}
// A corruption is only attributable when the clean answer passes: start from labelled-true answers the audit accepts.
const corruptions: CorruptionResult[] = stored
  .filter((r) => r.label.expect === 'accepted' && replayVerdict(r.fixture, { text: answerText(r.fixture) }).outcome === 'accepted')
  .flatMap((r) => corruptionsFor(r.fixture))
  .map((corruption) => {
    const fixture = fixtures.find((f) => f.id === corruption.fixtureId) as AskFixture;
    return { corruption, actual: replayVerdict(fixture, { text: corruption.text }).outcome };
  });

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);

function summary() {
  const trueAnswers = stored.filter((r) => r.label.expect === 'accepted');
  const falseAnswers = stored.filter((r) => r.label.expect === 'rejected');
  const wrongBlocks = trueAnswers.filter((r) => r.actual === 'rejected');
  const wrongAccepts = falseAnswers.filter((r) => r.actual === 'accepted');
  const kinds: CorruptionKind[] = ['changed-figure', 'moved-figure', 'figure-to-no-data-player', 'invented-date', 'shifted-date-in-window'];
  const byKind = Object.fromEntries(
    kinds.map((k) => {
      const set = corruptions.filter((c) => c.corruption.kind === k);
      return [k, { total: set.length, accepted: set.filter((c) => c.actual === 'accepted').length }];
    }),
  );
  const acceptedCorruptions = corruptions.filter((c) => c.actual === 'accepted');
  return {
    fixtures: fixtures.length,
    answersWithWrongEvidence: stored.filter((r) => r.label.evidenceHeldWrong).map((r) => r.fixture.id),
    wrongBlock: { rate: pct(wrongBlocks.length, trueAnswers.length), count: wrongBlocks.length, of: trueAnswers.length, fixtures: wrongBlocks.map((r) => ({ id: r.fixture.id, flagged: r.flagged, question: r.fixture.userMessage.content.slice(0, 70) })) },
    wrongAcceptReal: { rate: pct(wrongAccepts.length, falseAnswers.length), count: wrongAccepts.length, of: falseAnswers.length, fixtures: wrongAccepts.map((r) => r.fixture.id) },
    wrongAcceptConstructed: { rate: pct(acceptedCorruptions.length, corruptions.length), count: acceptedCorruptions.length, of: corruptions.length, byKind, ids: acceptedCorruptions.map((c) => `${c.corruption.id} (${c.corruption.detail})`) },
  };
}

afterAll(() => {
  // ASK_REPLAY_DUMP=<file>: every stored turn with its question, answer and verdict, for labelling a new export.
  if (process.env.ASK_REPLAY_DUMP) {
    writeFileSync(
      process.env.ASK_REPLAY_DUMP,
      real.map((r) => `### ${r.fixture.id} ${r.fixture.turn.createdAt.slice(0, 16)} recorded=${r.fixture.turn.recorded.outcome}:${r.fixture.turn.recorded.reason ?? ''}${JSON.stringify(r.fixture.turn.recorded.unmatchedTokens ?? [])} now=${r.actual}${JSON.stringify(r.flagged)} label=${labels[r.fixture.id]?.expect ?? 'NONE'}\nQ: ${r.fixture.userMessage.content.replace(/\n/g, ' ')}\nA: ${r.fixture.turn.content}\n`).join('\n'),
    );
  }
  const s = summary();
  const lines = [
    '',
    `Ask replay: ${stored.length} stored turns (${stored.filter((r) => r.label.expect === 'incomplete').length} incomplete, in no rate) + ${real.length - stored.length} citation fixtures, ${corruptions.length} corrupted copies${STRICT ? ' (strict)' : ''}`,
    '  constructed corruptions are the headline; the stored false-answer set is small',
    `  wrong-block rate (true answers rejected):          ${s.wrongBlock.rate}  (${s.wrongBlock.count}/${s.wrongBlock.of})  ${s.wrongBlock.fixtures.map((f) => `${f.id}[${f.flagged.join(' ')}]`).join(' ')}`,
    `  wrong-accept rate, stored (false answers accepted): ${s.wrongAcceptReal.rate}  (${s.wrongAcceptReal.count}/${s.wrongAcceptReal.of})  ${s.wrongAcceptReal.fixtures.join(' ')}`,
    `  wrong-accept rate, constructed corruptions:         ${s.wrongAcceptConstructed.rate}  (${s.wrongAcceptConstructed.count}/${s.wrongAcceptConstructed.of})\n      by kind: ${Object.entries(s.wrongAcceptConstructed.byKind).map(([k, v]) => `${k} ${v.accepted}/${v.total}`).join(', ')}`,
    `  false answers whose own reads held the wrong data: ${s.answersWithWrongEvidence.join(' ') || 'none'}`,
    ...s.wrongAcceptConstructed.ids.map((id) => `      accepted: ${id}`),
  ];
  console.log(lines.join('\n'));
  const out = process.env.ASK_REPLAY_REPORT;
  if (out) writeFileSync(out, `${JSON.stringify(s, null, 2)}\n`);
});

describe('Ask replay: stored turns', () => {
  it('has fixtures, and a label for each (and no label without a fixture)', () => {
    expect(fixtures.length).toBeGreaterThan(20);
    const unlabelled = fixtures.filter((f) => !labels[f.id]).map((f) => f.id);
    const orphans = Object.keys(labels).filter((id) => !fixtures.some((f) => f.id === id));
    expect({ unlabelled, orphans }).toEqual({ unlabelled: [], orphans: [] });
  });

  it('has fixtures for each side of the audit, so the rates mean something', () => {
    expect(real.filter((r) => r.label.expect === 'accepted').length).toBeGreaterThan(15);
    expect(real.filter((r) => r.label.expect === 'rejected').length).toBeGreaterThan(1);
    expect(real.filter((r) => r.label.expect === 'incomplete').length).toBeGreaterThan(0);
    expect(corruptions.length).toBeGreaterThan(30);
  });

  describe.each(real.map((r) => [r.fixture.id, r] as const))('%s', (_id, r) => {
    const known = Boolean(r.label.knownWrongBlock || r.label.knownWrongAccept);
    it(`${known ? '[known gap] ' : ''}${r.label.expect}: ${r.fixture.userMessage.content.replace(/\s+/g, ' ').slice(0, 60)}`, () => {
      const why = r.actual === 'rejected' ? `audit flagged ${JSON.stringify(r.flagged)}` : 'audit accepted';
      if (r.label.expect === 'incomplete') {
        const verdict = replayVerdict(r.fixture);
        expect(verdict.outcome === 'rejected' ? verdict.reason : verdict.outcome, r.label.why).toBe('stream_incomplete');
        return;
      }
      if (known && !STRICT) {
        // A known gap passes whether or not the audit still disagrees with the label; say when it no longer does.
        if (r.actual === r.label.expect) console.log(`  ask-replay: ${r.fixture.id} now matches its label; remove its knownWrong* flag`);
        return;
      }
      expect(r.actual, `${r.label.why} (${why})`).toBe(r.label.expect);
    });
  });

  it('a stream that did not finish is rejected whatever the text says', () => {
    const fixture = fixtures.find((f) => labels[f.id]?.expect === 'accepted') as AskFixture;
    const verdict = replayVerdict(fixture, { streamComplete: false });
    expect(verdict.outcome).toBe('rejected');
    if (verdict.outcome === 'rejected') expect(verdict.reason).toBe('stream_incomplete');
  });
});

describe('Ask replay: corrupted copies of true answers', () => {
  const allowed = new Set(knownGaps.acceptedCorruptions);
  it.each(corruptions.map((c) => [c.corruption.id, c] as const))('%s is rejected', (_id, c) => {
    const message = `${c.corruption.kind}: ${c.corruption.detail}`;
    if (!STRICT && allowed.has(c.corruption.id)) return;
    expect(c.actual, message).toBe('rejected');
  });

  it('every known-accepted corruption still exists (the list does not rot)', () => {
    const ids = new Set(corruptions.map((c) => c.corruption.id));
    const gone = [...allowed].filter((id) => !ids.has(id));
    expect(gone).toEqual([]);
  });

  it('reports known-accepted corruptions the audit now rejects', () => {
    const fixed = corruptions.filter((c) => allowed.has(c.corruption.id) && c.actual === 'rejected').map((c) => c.corruption.id);
    if (fixed.length) console.log(`  ask-replay: ${fixed.length} known-accepted corruptions are now rejected; remove them from ask-known-gaps.json: ${fixed.join(', ')}`);
    if (STRICT) expect(corruptions.filter((c) => c.actual === 'accepted').map((c) => c.corruption.id)).toEqual([]);
  });
});

describe('Ask replay: matches the route', () => {
  it('passes computeTurnVerdict the same arguments as chat/stream/route.ts', () => {
    const source = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'app', 'api', 'coachhelm', 'v3', 'chat', 'stream', 'route.ts'), 'utf8');
    const start = source.indexOf('computeTurnVerdict({');
    expect(start).toBeGreaterThan(0);
    // Walk to the matching brace, then read the top-level keys of the object literal with comments removed.
    let depth = 0;
    let end = start + 'computeTurnVerdict('.length;
    for (let i = end; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{' || ch === '(' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ')' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const body = source
      .slice(start + 'computeTurnVerdict('.length + 1, end - 1)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const keys: string[] = [];
    let d = 0;
    let piece = '';
    for (const ch of body) {
      if (ch === '{' || ch === '(' || ch === '[') d += 1;
      if (ch === '}' || ch === ')' || ch === ']') d -= 1;
      if (ch === ',' && d === 0) {
        keys.push(piece);
        piece = '';
      } else piece += ch;
    }
    if (piece.trim()) keys.push(piece);
    // A conditional spread (`...(askV2 ? { cites: ... } : {})`) contributes the key inside its object.
    const names = keys.map((k) => (/^\s*\.\.\./.test(k) ? /\{\s*([A-Za-z_]\w*)\s*:/.exec(k)?.[1] : /^\s*([A-Za-z_]\w*)/.exec(k)?.[1])).filter(Boolean);
    expect(names, 'route.ts changed what it passes computeTurnVerdict: update replayVerdict in ask-replay-harness.ts and VERDICT_ARGS').toEqual([...VERDICT_ARGS]);
  });
});
