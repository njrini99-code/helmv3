// =============================================================================
// src/app/baseball/actions/__tests__/demo-render-reads.test.ts
//
// A demo visitor must be able to load every BaseballHelm dashboard page.
//
// withBaseballAction fails closed for the shared demo coach (Issue #392): any
// action not registered with `demoSafe: true` throws BaseballDemoReadOnlyError
// for that session. That is right for writes, but when a page READS through a
// wrapped action while it renders, the demo visitor gets an error screen and
// the throw lands in the server error logs. On Nov 26 2026 this produced 83
// server errors from one demo session: the shell's program brand on every page,
// the notification bell's unread poll, and the Decision Room page.
//
// This test reads the source of every server-rendered dashboard page/layout,
// plus the client components that load data as soon as they mount, finds each
// wrapped action they call, and checks that action is registered demoSafe.
// A write called at render (which should never happen) fails here too.
// =============================================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ACTIONS_DIR = join(ROOT, 'src/app/baseball/actions');
const DASHBOARD_DIR = join(ROOT, 'src/app/baseball/(dashboard)');

/**
 * Client components that call a read as soon as they mount (not on a click),
 * paired with the reads in question. The shell pair runs on every page.
 */
const MOUNT_READS: ReadonlyArray<{ file: string; actions: readonly string[] }> = [
  { file: 'src/components/baseball/settings/BaseballProgramBrand.tsx', actions: ['getProgramBrand'] },
  {
    file: 'src/components/baseball/NotificationBell.tsx',
    actions: ['getUnreadNotificationCount', 'getBaseballNotifications'],
  },
  { file: 'src/components/baseball/settings/AiAuditLog.tsx', actions: ['getAiAuditLog'] },
  {
    file: 'src/components/baseball/performance/LiftBuilderClient.tsx',
    actions: ['getGroupAvailabilityForWeek'],
  },
  {
    file: 'src/components/baseball/practice-planner/PracticePlannerClient.tsx',
    actions: [
      'getCanManagePractice',
      'getPracticeObjectives',
      'getClassConflictsForPractice',
      'getPracticeIntelligence',
    ],
  },
  {
    file: 'src/components/baseball/practice-planner/PracticeRecapPanel.tsx',
    actions: ['getPracticeObjectives', 'getTeamScrimmages'],
  },
  { file: 'src/components/baseball/practice-planner/ScrimmagePanel.tsx', actions: ['getTeamScrimmages'] },
];

/** The three reads behind the Nov 26 2026 errors. Named so they can't regress quietly. */
const INCIDENT_READS = [
  'getProgramBrand',
  'getUnreadNotificationCount',
  'getDecisionRoomData',
] as const;

type WrappedAction = { file: string; demoSafe: boolean };

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The options argument of `withBaseballAction('name', <options>, async (...`. */
function optionsText(source: string, actionName: string): string | null {
  const start = source.search(new RegExp(`withBaseballAction\\(\\s*['"\`]${actionName}['"\`]\\s*,`));
  if (start < 0) return null;
  const rest = source.slice(start);
  const end = rest.search(/\basync\s*\(/);
  return end < 0 ? null : stripComments(rest.slice(0, end));
}

function isDemoSafe(source: string, options: string): boolean {
  if (/demoSafe\s*:\s*true/.test(options)) return true;
  // `{ ...FEATURE }` or a bare `FEATURE` constant: look at what the constant holds.
  const ident = options.match(/,\s*(?:\{\s*\.\.\.)?([A-Z_][A-Z0-9_]*)\b/);
  if (!ident) return false;
  const decl = source.match(new RegExp(`const\\s+${ident[1]}\\b[^=]*=\\s*\\{([^}]*)\\}`));
  return Boolean(decl && /demoSafe\s*:\s*true/.test(decl[1]));
}

/** `exportName` in `src/app/baseball/actions/<module>.ts`, if it's a wrapped action. */
function resolveWrapped(module: string, exportName: string): WrappedAction | null {
  const file = join(ACTIONS_DIR, `${module}.ts`);
  let source: string;
  try {
    source = read(file);
  } catch {
    return null;
  }
  // Usually the export and the wrapped name match. A few exports are plain
  // functions that build the wrapper inside, e.g. getDecisionRoomData().
  let options = optionsText(source, exportName);
  if (options === null) {
    const fn = source.match(
      new RegExp(`export\\s+async\\s+function\\s+${exportName}\\b[\\s\\S]*?withBaseballAction\\(\\s*['"\`](\\w+)['"\`]`),
    );
    if (fn) options = optionsText(source, fn[1]);
  }
  if (options === null) return null;
  return { file: relative(ROOT, file), demoSafe: isDemoSafe(source, options) };
}

/** Named imports from `@/app/baseball/actions/<module>`: local name -> [module, export]. */
function actionImports(source: string): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  const re = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]@\/app\/baseball\/actions\/([\w-]+)['"]/g;
  for (const m of source.matchAll(re)) {
    if (m[1]) continue;
    for (const raw of m[2].split(',')) {
      const spec = raw.trim();
      if (!spec || spec.startsWith('type ')) continue;
      const [exported, local] = spec.split(/\s+as\s+/).map((s) => s.trim());
      out.set(local ?? exported, [m[3], exported]);
    }
  }
  return out;
}

function isCalled(source: string, localName: string): boolean {
  const body = stripComments(source).replace(/import\s[^;]+;/g, '');
  return new RegExp(`\\b${localName}\\s*\\(`).test(body);
}

function serverPagesAndLayouts(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...serverPagesAndLayouts(full));
    } else if (name === 'page.tsx' || name === 'layout.tsx') {
      if (!/^\s*['"]use client['"]/.test(read(full))) out.push(full);
    }
  }
  return out;
}

describe('BaseballHelm demo: reads that run while a page loads are demo-safe', () => {
  const pages = serverPagesAndLayouts(DASHBOARD_DIR);
  const renderCalls: Array<{ page: string; action: string; wrapped: WrappedAction }> = [];
  for (const page of pages) {
    const source = read(page);
    for (const [local, [module, exported]] of actionImports(source)) {
      if (!isCalled(source, local)) continue;
      const wrapped = resolveWrapped(module, exported);
      if (wrapped) renderCalls.push({ page: relative(ROOT, page), action: exported, wrapped });
    }
  }

  it('finds the dashboard pages and the wrapped reads they make', () => {
    expect(pages.length).toBeGreaterThan(40);
    expect(renderCalls.length).toBeGreaterThan(15);
  });

  it('every wrapped action a server-rendered dashboard page calls is demoSafe', () => {
    const unsafe = renderCalls
      .filter((c) => !c.wrapped.demoSafe)
      .map((c) => `${c.page} calls ${c.action} (${c.wrapped.file})`);
    expect(unsafe).toEqual([]);
  });

  it.each(MOUNT_READS)('$file only loads demo-safe reads on mount', ({ file, actions }) => {
    const source = read(join(ROOT, file));
    const imports = actionImports(source);
    for (const action of actions) {
      const entry = [...imports.entries()].find(([, [, exported]]) => exported === action);
      expect(entry, `${file} no longer imports ${action}; update MOUNT_READS`).toBeDefined();
      const [, [module]] = entry!;
      const wrapped = resolveWrapped(module, action);
      expect(wrapped, `${action} is not a wrapped action in ${module}.ts`).not.toBeNull();
      expect(wrapped!.demoSafe, `${action} (${wrapped!.file}) must be demoSafe`).toBe(true);
    }
  });

  it.each(INCIDENT_READS)('%s stays demoSafe', (action) => {
    const modules = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts'));
    const found = modules
      .map((f) => resolveWrapped(f.replace(/\.ts$/, ''), action))
      .filter((w): w is WrappedAction => w !== null);
    expect(found).toHaveLength(1);
    expect(found[0].demoSafe).toBe(true);
  });
});
