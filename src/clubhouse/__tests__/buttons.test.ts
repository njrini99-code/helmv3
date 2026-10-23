import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * CONS-2: every button is `ui/Button`, so weight, size, icons, busy and the haptic come from one place. A raw
 * `<button>`, `<a>` or `<Link>` drawn with `ch-btn` classes outside ui/ only falls, file by file (rounds/track went
 * first). A site that needs a prop Button does not take yet (an aria-label, a ref) stays until Button grows it.
 */
const ALLOW: Record<string, number> = {
  'preview/ComponentGallery.tsx': 2,
  'preview/PopupLab.tsx': 2,
  'screens/auth/ForgotPassword.tsx': 2,
  'screens/auth/SignInForm.tsx': 1,
  'screens/auth/gate-fields.tsx': 1,
  'screens/calendar/Calendar.tsx': 1,
  'screens/calendar/extras.tsx': 1,
  'screens/calendar/inspector.tsx': 1,
  'screens/coachhelm/chat/ActionCard.tsx': 1,
  'screens/coachhelm/chat/EvidencePanel.tsx': 1,
  'screens/home/Leaderboard.tsx': 1,
  'screens/home/TeamLegs.tsx': 1,
  'screens/home/Week.tsx': 1,
  'screens/hub/sheets.tsx': 1,
  'screens/messages/MessagesPhone.tsx': 1,
  'screens/messages/MessagesView.tsx': 5,
  'screens/recruiting/RecruitingDesktop.tsx': 1,
  'screens/roster/Roster.tsx': 1,
  'screens/rounds/entry/CourseNudge.tsx': 1,
  'screens/rounds/setup/AddCourseSheet.tsx': 3,
  'screens/rounds/setup/CoursePicker.tsx': 1,
  'screens/rounds/setup/RoundSetup.tsx': 3,
  'screens/rounds/track/DataPrompts.tsx': 1,
  'screens/rounds/track/HoleReview.tsx': 2,
  'screens/rounds/track/ShotEntry.tsx': 2,
  'screens/rounds/track/round-sheets.tsx': 2,
  'screens/stats/StatsFilter.tsx': 1,
  'screens/stats/StatsPlayer.tsx': 2,
  'shell/AskSheet.tsx': 1,
  'shell/AskSheetBody.tsx': 2,
  'shell/Bell.tsx': 2,
  'shell/TopBar.tsx': 1,
};

function rawButtons(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of walk(ROOT, /\.tsx$/)) {
    const rel = relative(ROOT, file);
    if (rel.startsWith('ui/') || rel.includes('__tests__')) continue;
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ['button', 'a', 'Link'].includes(n.tagName.getText(src))) {
        const cls = n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(src) === 'className');
        if (cls && /\bch-btn\b(?!-)/.test(cls.getText(src))) out[rel] = (out[rel] ?? 0) + 1;
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return out;
}

describe('every button is ui/Button (CONS-2)', () => {
  it('raw ch-btn markup only falls, file by file', () => {
    const now = rawButtons();
    const grew = Object.entries(now).filter(([f, n]) => n > (ALLOW[f] ?? 0)).map(([f, n]) => `${f}: ${n} (allowed ${ALLOW[f] ?? 0})`);
    expect(grew).toEqual([]);
  });

  it('rounds/track keeps only the keys Button cannot take yet', () => {
    const track = Object.entries(rawButtons()).filter(([f]) => f.startsWith('screens/rounds/track/'));
    expect(track.reduce((n, [, c]) => n + c, 0)).toBeLessThanOrEqual(7);
  });
});
