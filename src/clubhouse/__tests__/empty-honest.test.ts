import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk, type Hit } from './_scan';

/**
 * CONS-11: an empty state says which honest state it is. An `EmptyState` names its `kind` (first run, filtered,
 * restricted…) or draws a `shape`, or is a whole-page state (`size="page"`). The legacy section form (none of these)
 * is ratcheted per file and moves as each screen is read; the hand-rolled empty classes may only fall too.
 */
function legacy(): Hit[] {
  const out: Hit[] = [];
  for (const file of walk(ROOT, /\.tsx$/)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('<EmptyState')) continue;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      const open = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (open && open.tagName.getText(src) === 'EmptyState') {
        const attr = (name: string) => open.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(src) === name) as ts.JsxAttribute | undefined;
        const size = attr('size')?.initializer;
        const page = size && ts.isStringLiteral(size) && size.text === 'page';
        if (!attr('kind') && !attr('shape') && !page) {
          out.push({ file: relative(ROOT, file), line: src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1, text: '' });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return out;
}

const ALLOW_LEGACY: Record<string, number> = {
  'preview/ComponentGallery.tsx': 1,
  'screens/calendar/Calendar.tsx': 1,
  'screens/calendar/CalendarPhone.tsx': 2,
  'screens/classes/ImportSchedule.tsx': 2,
  'screens/classes/parts.tsx': 1,
  'screens/coachhelm/PlayerBoard.tsx': 1,
  'screens/coachhelm/views/DeepDive.tsx': 4,
  'screens/coachhelm/views/TrackRecord.tsx': 1,
  'screens/home/PlayerGame.tsx': 2,
  'screens/home/TeamLegs.tsx': 1,
  'screens/home/Week.tsx': 1,
  'screens/hub/parts.tsx': 2,
  'screens/hub/widgets.tsx': 6,
  'screens/messages/MessagesPhone.tsx': 2,
  'screens/messages/MessagesView.tsx': 3,
  'screens/messages/RailEmpty.tsx': 1,
  'screens/qualifiers/CoursePicker.tsx': 2,
  'screens/qualifiers/QualifierDetail.tsx': 1,
  'screens/qualifiers/QualifierDetailPhone.tsx': 1,
  'screens/qualifiers/QualifierForm.tsx': 1,
  'screens/qualifiers/QualifierSelection.tsx': 2,
  'screens/qualifiers/QualifiersList.tsx': 2,
  'screens/roster/Roster.tsx': 1,
  'screens/rounds/RoundReview.tsx': 1,
  'screens/rounds/RoundsLibrary.tsx': 1,
  'screens/rounds/TeamRounds.tsx': 1,
  'screens/stats/GameDetail.tsx': 6,
  'screens/stats/OverviewZones.tsx': 1,
  'screens/stats/PlayerStage.tsx': 1,
  'screens/stats/RoundTrend.tsx': 1,
  'screens/stats/StatsPlayer.tsx': 4,
  'screens/stats/StatsPlayerPhone.tsx': 5,
  'screens/stats/StatsTeam.tsx': 2,
  'screens/stats/StatsTeamIslands.tsx': 2,
  'screens/stats/StatsTeamPhone.tsx': 3,
  'screens/stats/TeamRank.tsx': 1,
  'screens/whats-new/WhatsNew.tsx': 1,
  'shell/Bell.tsx': 1,
};

const ALLOW_HAND_ROLLED: Record<string, number> = {
  'screens/home/HomePhone.tsx': 1,
  'screens/qualifiers/QualifiersList.tsx': 2,
  'screens/recruiting/parts.tsx': 1,
  'screens/rounds/track/RoundTracking.tsx': 1,
  'shell/BellStacks.tsx': 1,
  'styles/home.css': 9,
  'styles/qualifiers.css': 2,
  'styles/recruiting.css': 10,
  'styles/rounds-track.css': 1,
  'styles/shell.css': 2,
};

describe('honest empty states (CONS-11)', () => {
  it('EmptyState always says which honest state it is', () => {
    const r = ratchet(legacy(), ALLOW_LEGACY);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it('no new hand-rolled empty classes', () => {
    const r = ratchet(hits(/ch-(rec|bst|hm|qf)-empty\b|ch-rt--empty/, walk(ROOT, /\.(tsx|css)$/)), ALLOW_HAND_ROLLED);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
