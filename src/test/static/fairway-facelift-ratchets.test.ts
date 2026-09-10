/**
 * ============================================================================
 * Fairway facelift — enforcement ratchets (BRIEF.md §15 roadmap item 10)
 * ----------------------------------------------------------------------------
 * Five static guards that keep the facelift's own rules from eroding once the
 * pages that motivated them stop being top of mind. Each guard ships with an
 * explicit ALLOWLIST of every violation that exists TODAY (so this suite is
 * green right now) — the ratchet is that any NEW violation, anywhere not
 * already on that list, fails the build. Shrinking an allowlist as debt is
 * paid down is encouraged and expected; growing one should be a deliberate,
 * reviewed diff, not a drive-by.
 *
 * Every failure prints the offending `file:line` plus a one-line fix hint —
 * see each `it(...)` body below.
 *
 * 1. No legacy `@/components/ui/*` import under the two live-Fairway trees.
 * 2. No JSX use of the legacy dot-on-a-rail standing family outside its own
 *    deprecated file (or that file's own dedicated test).
 * 3. No hand-rolled `backdrop-filter` outside the two files that own blur.
 * 4. No `position: sticky` element that also carries a blur-tier class in the
 *    same className expression (scroll-repaint cost stacked on a pinned
 *    element — the "sticky glass" mistake AUDIT.md's competing-surfaces #6
 *    flagged across six bespoke recipes).
 * 5. Every fairway barrel's component-shaped export is named in registry.ts
 *    (registry.test.ts already proves the reverse — every registry name is a
 *    real export; this is the missing direction, so it lives here instead of
 *    duplicating that file).
 * ========================================================================== */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../');
const REPO_ROOT = resolve(SRC, '..');

/** Recursively collect files under `dir` whose name ends with one of `exts`. */
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === '__snapshots__') continue;
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** 1-based line number of `index` within `source`. */
function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Strip `//` and `/* *\/` comments so prose that merely NAMES a banned
 *  pattern (this file included) cannot trip a scan of itself. */
function stripJsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function rel(file: string): string {
  return file.slice(REPO_ROOT.length + 1);
}

/* ═══════════════════════════════════════════════════════════════════════
 * 1. No legacy `@/components/ui/*` import under the live Fairway trees.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('ratchet 1 — no legacy ui/* import under fairway or the golf dashboard', () => {
  const SCOPE_DIRS = [
    resolve(SRC, 'components/fairway'),
    resolve(SRC, 'app/golf/(dashboard)'),
  ];
  const BANNED_PACKAGES = ['button', 'input', 'confirm-dialog', 'skeleton', 'dropdown-menu', 'row-actions-menu'];

  /**
   * file (repo-relative) -> banned packages that file is currently allowed to
   * import. Every entry here is a real importer as of 2026-09-10 (`rg -n
   * "from ['\"]@/components/ui/<pkg>['\"]" src/components/fairway
   * "src/app/golf/(dashboard)"`). Migrate a file off the legacy import and
   * delete its line here — do not add a NEW file without also migrating it,
   * or without team-lead sign-off on why it still needs the legacy import.
   */
  const ALLOWLIST: Record<string, string[]> = {
    'src/app/golf/(dashboard)/FairwayDashboardShell.tsx': ['button'],
    'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/sections/FingerprintHero.tsx': ['button'],
    'src/components/fairway/data-table/data-table.tsx': ['button'],
    'src/components/fairway/app-shell/FairwaySidebar.tsx': ['button'],
    'src/components/fairway/app-shell/FairwayLargeTitle.test.tsx': ['button'],
    'src/components/fairway/app-shell/MoreSheetFooter.tsx': ['button'],
    'src/components/fairway/app-shell/FairwayBottomNav.tsx': ['button'],
    'src/components/fairway/app-shell/FairwayTopBar.tsx': ['button'],
    'src/components/fairway/app-shell/FairwayTopBar.test.tsx': ['button'],
    'src/components/fairway/app-shell/LargeTitleContext.test.tsx': ['button'],
    'src/components/fairway/overlays/ModalShell.focus-restore.test.tsx': ['button'],
    'src/components/fairway/pages/messages/MessageComposer.tsx': ['button', 'input'],
    'src/components/fairway/pages/calendar/EventWhenFields.tsx': ['button'],
    'src/components/fairway/pages/calendar/editor/EventEssentialsFields.tsx': ['button', 'input'],
    'src/components/fairway/pages/calendar/editor/EventRecurrenceFields.tsx': ['button', 'input'],
    'src/components/fairway/pages/calendar/editor/EventVerificationPanel.tsx': ['button'],
    'src/components/fairway/pages/calendar/editor/EventPeopleTimeFields.tsx': ['button', 'input'],
    'src/components/fairway/pages/calendar/__tests__/FairwayEventEditor.scope.test.tsx': ['button'],
    'src/components/fairway/pages/documents/FairwayDocuments.tsx': ['dropdown-menu'],
  };
  const ALLOWLIST_TOTAL = Object.values(ALLOWLIST).reduce((n, pkgs) => n + pkgs.length, 0);

  interface Violation {
    file: string;
    pkg: string;
    line: number;
  }

  function scan(): Violation[] {
    const violations: Violation[] = [];
    for (const dir of SCOPE_DIRS) {
      for (const file of walk(dir, ['.ts', '.tsx'])) {
        const source = stripJsComments(readFileSync(file, 'utf8'));
        for (const pkg of BANNED_PACKAGES) {
          const re = new RegExp(`from\\s*['"]@/components/ui/${pkg}['"]`);
          const m = re.exec(source);
          if (!m) continue;
          const allowed = ALLOWLIST[rel(file)] ?? [];
          if (allowed.includes(pkg)) continue;
          violations.push({ file: rel(file), pkg, line: lineAt(source, m.index) });
        }
      }
    }
    return violations;
  }

  it(`pins today's debt at ${ALLOWLIST_TOTAL} legacy ui/* imports across ${Object.keys(ALLOWLIST).length} files`, () => {
    expect(Object.keys(ALLOWLIST).length).toBe(19);
    expect(ALLOWLIST_TOTAL).toBe(23);
  });

  it('no NEW file imports a banned @/components/ui/* package', () => {
    const violations = scan().map(
      (v) =>
        `${v.file}:${v.line} imports @/components/ui/${v.pkg} — use the Fairway equivalent ` +
        `(controls/button, controls/text-field or forms/Input, overlays/ModalShell, feedback/Skeleton, ` +
        `overlays/Menu, controls) or add the file to ALLOWLIST with a reason`,
    );
    expect(violations).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 2. No JSX use of the legacy dot-on-a-rail standing family outside its own
 *    deprecated file (StandingBars — charts/StandingBars.tsx — replaces all
 *    three; see that file's own doc comment).
 * ═══════════════════════════════════════════════════════════════════════ */

describe('ratchet 2 — no new consumer of the legacy dot-on-a-rail standing family', () => {
  const ALL_TSX = walk(resolve(SRC, '..'), ['.tsx']);

  /** A component's own definition + its own dedicated test are not "usage". */
  const STANDING_STRIP_OWN = [
    'src/components/fairway/charts/StandingStrip.tsx',
    'src/components/fairway/charts/StandingStrip.test.tsx',
  ];
  const STANDING_TRACK_OWN = [
    'src/components/fairway/modules/StandingTrack.tsx',
    'src/components/fairway/modules/__tests__/StandingTrack.test.tsx',
  ];
  /** The whole legacy variant family lives here; its own tests live alongside it. */
  const STANDING_BAR_V3_DIR = 'src/components/golf/coachhelm/v3/StandingBar/';
  const STANDING_BAR_DEDICATED_TEST = 'src/test/golf/components/StandingBar.test.tsx';

  /**
   * file -> which of the three the file still renders. Empty as of
   * 2026-09-10: every real consumer has migrated to `StandingBars`
   * (`fairway/modules/Spine.tsx`, `golf/coachhelm/home/StandingDrill.tsx`,
   * and `golf/stats/spine-stage/StandingDrill.tsx`'s `StrokesGainedInstrument`
   * — verified: no `<StandingTrack`/`<StandingStrip` JSX remains in any of
   * them) — do not re-add an entry here on a future revert without also
   * reverting the migration.
   */
  const ALLOWLIST: Record<string, 'StandingStrip' | 'StandingTrack'> = {};

  it(`pins today's debt at ${Object.keys(ALLOWLIST).length} remaining consumer(s)`, () => {
    expect(Object.keys(ALLOWLIST).length).toBe(0);
  });

  it('no NEW JSX use of <StandingStrip> outside its own file/test', () => {
    const violations: string[] = [];
    for (const file of ALL_TSX) {
      const r = rel(file);
      if (STANDING_STRIP_OWN.includes(r)) continue;
      const source = stripJsComments(readFileSync(file, 'utf8'));
      const m = /<StandingStrip\b/.exec(source);
      if (!m) continue;
      if (ALLOWLIST[r] === 'StandingStrip') continue;
      violations.push(
        `${r}:${lineAt(source, m.index)} renders <StandingStrip> — use charts/StandingBars ` +
          `(replaces every dot-on-a-rail standing visual) or add to ALLOWLIST with a reason`,
      );
    }
    expect(violations).toEqual([]);
  });

  it('no NEW JSX use of <StandingTrack> outside its own file/test (beyond the pinned debt)', () => {
    const violations: string[] = [];
    for (const file of ALL_TSX) {
      const r = rel(file);
      if (STANDING_TRACK_OWN.includes(r)) continue;
      const source = stripJsComments(readFileSync(file, 'utf8'));
      const m = /<StandingTrack\b/.exec(source);
      if (!m) continue;
      if (ALLOWLIST[r] === 'StandingTrack') continue;
      violations.push(
        `${r}:${lineAt(source, m.index)} renders <StandingTrack> — use charts/StandingBars ` +
          `(replaces every dot-on-a-rail standing visual) or add to ALLOWLIST with a reason`,
      );
    }
    expect(violations).toEqual([]);
  });

  /**
   * `Card`/`Inline`/`Hero` are too generic a name to grep for as bare JSX
   * tags (false positives everywhere), so this resolves the JSX tag back to
   * the import it came from and only flags it when that import resolves to
   * the v3 StandingBar module — same precision requirement as
   * `rsc-function-prop-boundary.test.ts`.
   */
  const STANDING_BAR_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]@\/components\/golf\/coachhelm\/v3\/StandingBar(?:\/(?:Card|Inline|Hero|index))?['"]/g;
  const LEGACY_NAMES = new Set(['StandingBar', 'Card', 'Inline', 'Hero']);

  it('no NEW JSX render of the legacy StandingBar / Card / Inline / Hero variants outside their own module', () => {
    const violations: string[] = [];
    for (const file of ALL_TSX) {
      const r = rel(file);
      if (r.startsWith(STANDING_BAR_V3_DIR) || r === STANDING_BAR_DEDICATED_TEST) continue;
      const source = stripJsComments(readFileSync(file, 'utf8'));
      let m: RegExpExecArray | null;
      STANDING_BAR_IMPORT.lastIndex = 0;
      while ((m = STANDING_BAR_IMPORT.exec(source)) !== null) {
        for (const piece of m[1]!.split(',')) {
          const clause = piece.trim();
          if (!clause) continue;
          const [imported, aliased] = clause.includes(' as ')
            ? clause.split(' as ').map((s) => s.trim())
            : [clause, clause];
          if (!LEGACY_NAMES.has(imported!)) continue;
          const localName = aliased!;
          const tagRe = new RegExp(`<${localName}\\b`);
          const tagMatch = tagRe.exec(source);
          if (!tagMatch) continue;
          violations.push(
            `${r}:${lineAt(source, tagMatch.index)} renders <${localName}> (legacy v3 StandingBar ` +
              `variant "${imported}") — use charts/StandingBars, or add to this guard's allowlist with a reason`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 3. No hand-rolled backdrop-filter outside the two files that own blur.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('ratchet 3 — backdrop-filter stays owned by the frost tiers', () => {
  const OWNERS = ['src/app/globals.css', 'src/components/fairway/overlays/fairway-overlays.css'];
  const CSS_RE = /-?(?:webkit-)?backdrop-filter\s*:/i;
  const TSX_RE = /(?:Webkit)?[Bb]ackdropFilter\s*:/;

  /**
   * Every CSS/.tsx file that declares `backdrop-filter`/`backdropFilter`
   * outside the two owning files, as of 2026-09-10 (`rg -n "backdrop-filter"
   * -g '*.css'` / `rg -n "backdropFilter" -g '*.tsx'` across the whole repo —
   * this guard is repo-wide, not scoped to golf/fairway, matching AUDIT.md
   * competing-surfaces #6's "six bespoke recipes" being a repo-wide finding).
   * Migrating a site onto a `fw-frost-*` tier (or GlassSurface) removes its
   * line here.
   */
  const ALLOWLIST = [
    'src/components/marketing/first-light/first-light.css',
    'src/components/fairway/instrument/instrument-panel.module.css',
    'src/styles/baseball-auth.css',
    'src/components/landing/landing.css',
    'src/components/fairway/pages/calendar/CalendarSurfaces.module.css',
    'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/print/print.css',
    'src/app/baseball/(onboarding)/player/onboarding-entry.css',
    'src/app/baseball/(onboarding)/coach-onboarding/onboarding-entry.css',
    'src/components/recruiting/USStateMap.tsx',
    'src/app/golf/(auth)/login/page.tsx',
    'src/app/golf/(auth)/AuthHomeLink.tsx',
    'src/app/golf/(auth)/demo/page.tsx',
    'src/components/landing/LandingHeader.tsx',
    'src/components/ui/page-header.tsx',
    'src/components/fairway/controls/Toolbar.tsx',
    'src/components/golf/calendar/PremiumCalendarClient.tsx',
    'src/components/golf/calendar/PremiumEventBlock.tsx',
    'src/components/auth/GolfAuthShell.tsx',
  ];

  it(`pins today's debt at ${ALLOWLIST.length} files`, () => {
    expect(ALLOWLIST.length).toBe(18);
  });

  it('no NEW backdrop-filter declaration outside globals.css / fairway-overlays.css', () => {
    const violations: string[] = [];
    const owners = new Set(OWNERS);
    for (const file of walk(REPO_ROOT + '/src', ['.css', '.tsx'])) {
      const r = rel(file);
      if (owners.has(r)) continue;
      const isCss = file.endsWith('.css');
      const source = isCss ? stripCssComments(readFileSync(file, 'utf8')) : stripJsComments(readFileSync(file, 'utf8'));
      const re = isCss ? CSS_RE : TSX_RE;
      const m = re.exec(source);
      if (!m) continue;
      if (ALLOWLIST.includes(r)) continue;
      violations.push(
        `${r}:${lineAt(source, m.index)} declares its own backdrop-filter — use a ` +
          `\`fw-frost-*\` tier / GlassSurface instead, or add to ALLOWLIST with a reason`,
      );
    }
    expect(violations).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 4. No `sticky` element that also carries a blur-tier class in the same
 *    className expression.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('ratchet 4 — sticky elements do not also carry a blur class', () => {
  // `.fw-frost-static` (globals.css, 2026-09-10) is the escape hatch for
  // exactly this guard: the subtle frost tier's bg/border/edge-light recipe
  // with NO `backdrop-filter` at all — safe on a sticky element because
  // there's no blur to repaint on scroll. The `(?!-)` below already excludes
  // it (and every other suffixed tier — `-modal`, `-floating`, `-bar`,
  // `-selection`) from this match: bare `fw-frost` is what's flagged, never
  // a `fw-frost-` prefix.
  const BLUR_CLASS_RE = /\bfw-glass-chrome\b|\bfw-glass-strong\b|\bfw-glass-regular\b|\bfw-frost\b(?!-)/;
  const STICKY_CLASS_RE = /(?:^|[\s'"`])sticky(?:[\s'"`]|$)/;

  /**
   * A `className={cn(...)}` (or plain string) expression's own text almost
   * always fits on a short run of lines; scanning a bounded window after the
   * `className` keyword catches every real component call site without
   * needing a real JSX/attribute parser. `sticky` and the blur class must
   * both be YES to flag — a file with only one of the two is fine.
   */
  function classNameWindows(source: string): string[] {
    const windows: string[] = [];
    const re = /className\s*=\s*(?:\{)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      windows.push(source.slice(m.index, m.index + 400));
    }
    return windows;
  }

  /**
   * file -> reason. Every entry is a real `sticky` + blur-class combination
   * as of 2026-09-10 (grepped for every non-CSS use of `fw-glass-chrome`,
   * bare `fw-frost`, `fw-glass-strong`, `fw-glass-regular`, then checked each
   * call site's own className expression for `sticky`).
   *
   * `FairwayCalendarHero.tsx` and `FairwayEventDetailDrawer.tsx` paid this
   * debt off (2026-09-10, the mobile pass): both sticky headers switched to
   * a plain matte `bg-surface` — no blur-tier class left in either
   * className — so they dropped off this list rather than move to
   * `.fw-frost-static` (that class didn't exist yet when they landed).
   */
  const ALLOWLIST: Record<string, string> = {
    'src/components/fairway/app-shell/FairwayHubSubNav.tsx': 'sticky sub-nav strip, fw-glass-chrome',
    'src/components/fairway/pages/calendar/FairwayEventEditor.tsx': 'sticky header/footer, fw-glass-chrome',
    'src/components/fairway/pages/calendar/CalendarPersonDialog.tsx': 'sticky mobile footer, fw-glass-chrome',
    'src/components/fairway/pages/calendar/scheduling/SchedulingWorkspace.tsx': 'sticky header, fw-glass-chrome',
    'src/components/fairway/pages/calendar/people/CalendarPeoplePicker.tsx': 'sticky header, fw-glass-chrome',
    'src/components/fairway/pages/calendar/conflicts/ConflictDetail.tsx': 'sticky header, fw-glass-chrome',
    'src/components/fairway/pages/calendar/conflicts/ConflictCenter.tsx': 'sticky header, fw-glass-chrome',
    'src/components/fairway/controls/Toolbar.tsx': 'sticky + material="frost" is a supported, tested combo (bare fw-frost)',
  };

  it(`pins today's debt at ${Object.keys(ALLOWLIST).length} files`, () => {
    expect(Object.keys(ALLOWLIST).length).toBe(8);
  });

  it('no NEW sticky element also carries a blur-tier class in the same className', () => {
    const violations: string[] = [];
    for (const file of walk(resolve(SRC, '..'), ['.tsx'])) {
      const r = rel(file);
      const source = stripJsComments(readFileSync(file, 'utf8'));
      const hits = classNameWindows(source).filter(
        (w) => STICKY_CLASS_RE.test(w) && BLUR_CLASS_RE.test(w),
      );
      if (hits.length === 0) continue;
      if (ALLOWLIST[r]) continue;
      violations.push(
        `${r} has a className combining \`sticky\` with a blur-tier class — a pinned element ` +
          `repaints its blur on every scroll frame; drop the blur or the sticky, or add to ALLOWLIST with a reason`,
      );
    }
    expect(violations).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * 5. Every fairway barrel's component export is named in registry.ts.
 *    (registry.test.ts already proves every registry NAME is a real export —
 *    this is the missing reverse direction.)
 * ═══════════════════════════════════════════════════════════════════════ */

import * as root from '../../components/fairway/index';
import * as modules from '../../components/fairway/modules';
import * as instrument from '../../components/fairway/instrument';
import * as charts from '../../components/fairway/charts';
import * as settings from '../../components/fairway/settings/settings-list';
import * as appShell from '../../components/fairway/app-shell';
import * as overlays from '../../components/fairway/overlays';
import * as feedback from '../../components/fairway/feedback';
import * as controls from '../../components/fairway/controls';
import * as surfaces from '../../components/fairway/surfaces';
import * as viewHeader from '../../components/fairway/view-header';
import * as calendarBarrel from '../../components/fairway/calendar';
import * as forms from '../../components/fairway/forms';
import * as command from '../../components/fairway/command';
import * as notifications from '../../components/fairway/notifications';
import * as cardsInsight from '../../components/fairway/cards-insight';
import * as dataTable from '../../components/fairway/data-table';
import { FAIRWAY_REGISTRY } from '../../components/fairway/registry';

describe('ratchet 5 — every barrel component export is named in the registry', () => {
  const BARRELS: Record<string, Record<string, unknown>> = {
    root,
    modules,
    instrument,
    charts,
    settings,
    appShell,
    overlays,
    feedback,
    controls,
    surfaces,
    viewHeader,
    calendarBarrel,
    forms,
    command,
    notifications,
    cardsInsight,
    dataTable,
  };

  const REGISTERED = new Set(FAIRWAY_REGISTRY.map((e) => e.name));

  /** A forwardRef/memo-wrapped component is an object at runtime, not a function. */
  function isComponentLike(value: unknown): boolean {
    if (typeof value === 'function') return true;
    if (typeof value === 'object' && value !== null) {
      const t = (value as { $$typeof?: symbol }).$$typeof;
      return t === Symbol.for('react.forward_ref') || t === Symbol.for('react.memo');
    }
    return false;
  }

  /** PascalCase, no underscore — excludes SCREAMING_SNAKE constants and hooks. */
  const COMPONENT_NAME_RE = /^[A-Z][A-Za-z0-9]*$/;

  function barrelComponentNames(): Map<string, string[]> {
    const owners = new Map<string, string[]>();
    for (const [barrelName, ns] of Object.entries(BARRELS)) {
      for (const [name, value] of Object.entries(ns)) {
        if (!COMPONENT_NAME_RE.test(name)) continue;
        if (!isComponentLike(value)) continue;
        const list = owners.get(name) ?? [];
        list.push(barrelName);
        owners.set(name, list);
      }
    }
    return owners;
  }

  /**
   * Component names exported from a fairway barrel but not yet in
   * registry.ts, as of 2026-09-10 — the FULL current gap (computed by
   * running this guard with an empty allowlist and reading back its own
   * violation list, then pinning it here). Most are the "ADDITIVE ONLY —
   * nothing existing imports this" primitive groups (view-header, calendar,
   * forms, command, notifications, cards-insight, data-table barrels' own
   * doc comments say so) staged ahead of registry entries; the rest are
   * infra/compound pieces (providers, panel sub-parts, chart primitives,
   * settings rows) the registry may or may not ever need one-by-one.
   * Adding a real entry to registry.ts removes its line here; do not add a
   * NEW name without either registering it or a reason.
   */
  const ALLOWLIST = new Set<string>([
    'AdoptionHeatGrid',
    'Badge',
    'BandHistogram',
    'BarCompare',
    'CalendarSurface',
    'ChartCard',
    'ChartCrosshairCursor',
    'ChartCrosshairLiveRegion',
    'ChartFrame',
    'ChartTooltip',
    'Checkbox',
    'CheckboxGroup',
    'CoachHelmShell',
    'CoachHelmSubNav',
    'Combobox',
    'CommandGlassSurface',
    'DataTableEmpty',
    'DataTableError',
    'DataTableSkeleton',
    'DatePicker',
    'DeltaChip',
    'Dial',
    'DiscardChangesModal',
    'EkgSparkline',
    'Eyebrow',
    'FairwayEffectiveness',
    'FairwayGenericPageSkeleton',
    'FairwayLargeTitle',
    'FairwayLargeTitleProvider',
    'FairwayMyDevelopment',
    'FairwayPlayerDashboard',
    'FairwaySidebar',
    'FairwayTopBar',
    'FeatureUnavailable',
    'FilterPillLink',
    'FocusAreaCard',
    'Form',
    'GenomeCompareView',
    'GenomeDetailView',
    'GenomeRadar',
    'Input',
    'InsetGroupRow',
    'InstrumentTable',
    'InstrumentTableToggle',
    'InsufficientData',
    'LeakMap',
    'MakeCurve',
    'MoreNavSheet',
    'MoreSheetFooter',
    'NotificationBell',
    'NotificationFeedPanel',
    'NotificationPanelProvider',
    'NotificationRow',
    'NotificationsLatestModule',
    'NumberField',
    'Numeric',
    'OnboardingStep',
    'OnboardingSteps',
    'PlayersGridView',
    'PressTarget',
    'Radio',
    'RadioGroup',
    'RechartsTooltip',
    'ReportProblemButton',
    'Ribbon',
    'RouteTransition',
    'RuledLeaderStat',
    'RxCard',
    'SearchField',
    'SegmentBar',
    'SegmentedLinks',
    'SegmentedPill',
    'Select',
    'SelectablePill',
    'SelectGroup',
    'SelectItem',
    'SettingsLinkRow',
    'SettingsRow',
    'SettingsStack',
    'SettingsToggleRow',
    'SkeletonCard',
    'SkeletonList',
    'SkeletonStat',
    'SkeletonText',
    'Slider',
    'SpineLedger',
    'SprayField',
    'StandingStrip',
    'StatTile',
    'SurfaceBody',
    'SurfaceFooter',
    'SurfaceHeader',
    'Switch',
    'TabsContent',
    'TabsList',
    'TabsTrigger',
    'TextArea',
    'ToastStack',
    'ToolbarIconButton',
    'TooltipProvider',
    'TrendChip',
    'TrendGlyph',
    'ViewHeaderSegments',
  ]);

  it(`pins today's debt at ${ALLOWLIST.size} unregistered component exports`, () => {
    expect(ALLOWLIST.size).toBe(103);
  });

  it('finds barrel exports to check (guard is not vacuous)', () => {
    expect(barrelComponentNames().size).toBeGreaterThan(30);
  });

  it('no NEW component export is missing from registry.ts', () => {
    const owners = barrelComponentNames();
    const violations: string[] = [];
    for (const [name, barrelNames] of owners) {
      if (REGISTERED.has(name)) continue;
      if (ALLOWLIST.has(name)) continue;
      violations.push(
        `${name} (exported from ${barrelNames.join(', ')}) is not in registry.ts — add an ` +
          `entry, or add the name to this guard's ALLOWLIST with a reason`,
      );
    }
    expect(violations).toEqual([]);
  });
});
