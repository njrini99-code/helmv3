// Import restrictions that are built from data (allowlists) and shared across
// several flat-config blocks. See eslint.config.mjs for where they are used.
//
// WHY THIS IS A MODULE AND NOT A FEW LINES IN THE CONFIG
//
// ESLint flat config does not merge rule options. When two config blocks match
// the same file, the LAST block's `no-restricted-imports` options replace the
// earlier block's entirely. This repo already has two scoped blocks that set
// that rule (the Clubhouse tree and the golf render paths), so a third block
// that only added "no Clubhouse imports" or "no legacy loggers" would silently
// switch the older bans off for every file it overlaps, or be switched off by
// them. Instead every block asks `restrictedImports()` for its complete option
// object, and the allowlisted files each get a block built the same way with
// their grandfathered restriction left out. Remove a file from the allowlist
// and its block simply gains the restriction back.
//
// Two restrictions live here:
//   1. Clubhouse boundary: code outside src/clubhouse may not import it, except
//      the route files that mount it (page, layout, loading, ... under src/app).
//   2. Legacy loggers: error-logging, admin-logger and structured-log are
//      replaced by server-error-logger (logServerError / logServerEvent) and
//      observed-action. Existing importers are allowlisted; new code is not.
//
// Tests are never restricted by either rule.

import {
  CLUBHOUSE_IMPORT_ALLOWLIST,
  LOGGING_IMPORT_ALLOWLIST,
} from './import-allowlists.mjs';

const TEST_FILE_NAME = /^.*\.(test|spec)\.[cm]?[jt]sx?$/;
/** A test file: named *.test.* / *.spec.*, or inside a __tests__ or test directory. */
function isTestFile(file) {
  const dirs = file.split('/').slice(0, -1);
  return dirs.includes('__tests__') || dirs.includes('test') || TEST_FILE_NAME.test(file);
}
const ROUTE_FILE = /^src\/app\/.*\/(page|layout|loading|error|not-found|route|template|default|global-error)\.(ts|tsx)$/;

/** Files the existing golf render-path block covers (see eslint.config.mjs). */
export function inGolfRenderScope(file) {
  if (isTestFile(file)) return false;
  if (file.startsWith('src/components/golf/calendar/')) return false;
  if (file.startsWith('src/app/golf/(dashboard)/dashboard/dev/haptics/')) return false;
  return (
    file.startsWith('src/components/fairway/') ||
    file.startsWith('src/components/golf/') ||
    file.startsWith('src/app/golf/') ||
    file.startsWith('src/lib/golf/round-session/')
  );
}

/** Files the existing Clubhouse block covers. */
export function inClubhouseScope(file) {
  return (
    file.startsWith('src/clubhouse/') &&
    file !== 'src/clubhouse/lib/haptics.ts' &&
    file !== 'src/clubhouse/lib/reduced-motion.ts'
  );
}

const GOLF_PATHS = [
  { name: 'framer-motion', importNames: ['useReducedMotion'], message: "Use useReducedMotionGuard() from '@/lib/coachhelm/v3/motion'." },
  { name: 'motion/react', importNames: ['useReducedMotion'], message: "Use useReducedMotionGuard() from '@/lib/coachhelm/v3/motion'." },
  { name: '@/lib/utils/capacitor', importNames: ['triggerHaptic'], message: "Use haptic('select' | 'commit' | ...) from '@/lib/haptics'." },
];

const CLUBHOUSE_PATHS = [
  { name: 'framer-motion', importNames: ['useReducedMotion'], message: "Use useChReducedMotion() from '@/clubhouse/lib/reduced-motion'." },
  { name: 'motion/react', importNames: ['useReducedMotion'], message: "Use useChReducedMotion() from '@/clubhouse/lib/reduced-motion'." },
  { name: '@/lib/utils/capacitor', importNames: ['triggerHaptic', 'triggerSelectionHaptic'], message: "Use haptic() from '@/clubhouse/lib/haptics'." },
];

const CLUBHOUSE_FAIRWAY_PATTERN = {
  group: ['@/components/fairway/*', '@/components/fairway', '@/lib/fairway/*', '@/lib/redesign/*'],
  message: 'Clubhouse never reuses Fairway UI. Build it in src/clubhouse.',
};

const CLUBHOUSE_BOUNDARY_PATTERN = {
  group: ['@/clubhouse', '@/clubhouse/*', '**/clubhouse', '**/clubhouse/*'],
  message:
    'Code outside src/clubhouse may not import it except route files (page, layout, loading, ...). ' +
    'Pass what you need in from the route file. See src/clubhouse/README.md.',
};

const LOGGING_REPLACEMENT =
  'Use logServerError / logServerEvent from @/lib/server-error-logger, or withAdminObserved from @/lib/admin/observed-action.';

/** Patterns (not paths) so relative imports of the same module are caught too. */
const LOGGING_PATTERNS = {
  'error-logging': {
    group: ['@/lib/error-logging', '**/error-logging'],
    message: `error-logging is deprecated. ${LOGGING_REPLACEMENT}`,
  },
  'admin-logger': {
    group: ['@/lib/admin-logger', '**/admin-logger'],
    message: `admin-logger is deprecated. ${LOGGING_REPLACEMENT}`,
  },
  'structured-log': {
    group: ['@/lib/observability/structured-log', '**/structured-log'],
    message: `structured-log is deprecated for new code. ${LOGGING_REPLACEMENT}`,
  },
};

export const LOGGING_IDS = Object.keys(LOGGING_PATTERNS);

/**
 * The complete `no-restricted-imports` entry for one class of file.
 *
 * @param {object} scope
 * @param {boolean} scope.golf             golf render-path bans (useReducedMotion, triggerHaptic)
 * @param {boolean} scope.clubhouse        Clubhouse-internal bans (same hooks, no Fairway UI)
 * @param {boolean} scope.boundary         forbid importing src/clubhouse
 * @param {string[]} scope.logging         legacy logger ids still forbidden here
 */
export function restrictedImports({ golf, clubhouse, boundary, logging }) {
  const paths = [...(clubhouse ? CLUBHOUSE_PATHS : []), ...(golf ? GOLF_PATHS : [])];
  const patterns = [
    ...(clubhouse ? [CLUBHOUSE_FAIRWAY_PATTERN] : []),
    ...(boundary ? [CLUBHOUSE_BOUNDARY_PATTERN] : []),
    ...logging.map((id) => LOGGING_PATTERNS[id]),
  ];
  return ['error', { paths, patterns }];
}

/**
 * Block that applies to every non-test file under src except src/clubhouse. The
 * golf block (later in the config) replaces it for golf render paths, with the
 * same new restrictions included.
 */
export const importRestrictionBase = {
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/clubhouse/**', '**/*.test.{ts,tsx}', '**/__tests__/**', 'src/test/**'],
  rules: {
    'no-restricted-imports': restrictedImports({ golf: false, clubhouse: false, boundary: true, logging: LOGGING_IDS }),
  },
};

/** What a golf render-path file gets (used by the golf block in eslint.config.mjs). */
export const golfRestrictions = restrictedImports({ golf: true, clubhouse: false, boundary: true, logging: LOGGING_IDS });

/** What a Clubhouse file gets (used by the Clubhouse block in eslint.config.mjs). */
export const clubhouseRestrictions = restrictedImports({ golf: false, clubhouse: true, boundary: false, logging: LOGGING_IDS });

/**
 * Blocks that must come AFTER the golf and Clubhouse blocks:
 *   - Clubhouse tests keep the Clubhouse-internal bans but no logger ban.
 *   - Route files may import src/clubhouse.
 *   - Each allowlisted file gets its grandfathered restriction removed.
 */
export function importRestrictionOverrides() {
  const blocks = [];

  blocks.push({
    files: ['src/clubhouse/**/__tests__/**', 'src/clubhouse/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': restrictedImports({ golf: false, clubhouse: true, boundary: false, logging: [] }) },
  });

  // Route files that mount Clubhouse. Golf render-path routes also keep the golf bans.
  const ROUTE_GLOB = '{page,layout,loading,error,not-found,route,template,default,global-error}.{ts,tsx}';
  blocks.push({
    files: [`src/app/golf/**/${ROUTE_GLOB}`],
    ignores: ['src/app/golf/(dashboard)/dashboard/dev/haptics/**'],
    rules: { 'no-restricted-imports': restrictedImports({ golf: true, clubhouse: false, boundary: false, logging: LOGGING_IDS }) },
  });
  blocks.push({
    files: [`src/app/**/${ROUTE_GLOB}`],
    ignores: ['src/app/golf/**'],
    rules: { 'no-restricted-imports': restrictedImports({ golf: false, clubhouse: false, boundary: false, logging: LOGGING_IDS }) },
  });

  // Allowlisted files, grouped by the exact option set they need.
  const files = new Set([
    ...CLUBHOUSE_IMPORT_ALLOWLIST,
    ...Object.values(LOGGING_IMPORT_ALLOWLIST).flatMap((s) => [...s]),
  ]);
  const groups = new Map();
  for (const file of files) {
    const scope = {
      golf: inGolfRenderScope(file),
      clubhouse: inClubhouseScope(file),
      boundary: !file.startsWith('src/clubhouse/') && !ROUTE_FILE.test(file) && !CLUBHOUSE_IMPORT_ALLOWLIST.includes(file),
      logging: LOGGING_IDS.filter((id) => !LOGGING_IMPORT_ALLOWLIST[id].has(file)),
    };
    const key = JSON.stringify(scope);
    if (!groups.has(key)) groups.set(key, { scope, files: [] });
    groups.get(key).files.push(file);
  }
  for (const { scope, files: group } of groups.values()) {
    blocks.push({
      files: group.sort(),
      rules: { 'no-restricted-imports': restrictedImports(scope) },
    });
  }
  return blocks;
}
