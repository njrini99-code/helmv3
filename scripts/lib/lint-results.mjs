/** Shared ESLint transport for CI. Baseline decisions stay in their own gates. */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const AUDIT_RULES = [
  'helm/no-unchecked-supabase-error',
  'helm/no-empty-collection-on-error',
  'helm/no-unchecked-paginated-read',
];

export function sourceFile(root, file) {
  const path = relative(root, file.filePath).replaceAll('\\', '/');
  return path.startsWith('src/');
}

export function validateResults(results, root, combined = false) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('ESLint returned an empty or invalid report.');
  }
  const paths = new Set();
  for (const file of results) {
    if (!file || typeof file.filePath !== 'string' || !isAbsolute(file.filePath) ||
        !Array.isArray(file.messages) || paths.has(file.filePath)) {
      throw new Error('ESLint returned malformed or duplicate file results.');
    }
    const path = relative(root, file.filePath).replaceAll('\\', '/');
    if (!path.startsWith('src/') && !path.startsWith('scripts/')) {
      throw new Error(`ESLint returned an out-of-scope file: ${file.filePath}`);
    }
    paths.add(file.filePath);
    if (file.regularMessages !== undefined && !Array.isArray(file.regularMessages)) {
      throw new Error('ESLint returned malformed regular diagnostics.');
    }
    for (const message of [...file.messages, ...(file.regularMessages ?? [])]) {
      if (!message || ![1, 2].includes(message.severity) ||
          (message.ruleId !== null && typeof message.ruleId !== 'string')) {
        throw new Error('ESLint returned a malformed diagnostic.');
      }
    }
  }
  if (combined && (!results.some((file) => sourceFile(root, file)) ||
      !results.some((file) => !sourceFile(root, file)))) {
    throw new Error('ESLint report is missing a required scan scope.');
  }
  return results;
}

export function runESLint(root, args, execute = execFileSync) {
  let raw;
  try {
    raw = execute('npx', ['eslint', ...args, '--format', 'json', '--max-warnings', '999999'], {
      cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (error) {
    // Exit 1 means diagnostics; exit 2, a signal, or spawn failure means the
    // scan failed even if a partial JSON buffer happened to be written.
    if (error.status !== 1) throw error;
    raw = error.stdout;
  }
  return validateResults(JSON.parse(raw), root);
}

export function produceReport(root, env = process.env, execute = execFileSync) {
  const path = env.HELM_ESLINT_REPORT;
  if (!path || !env.HELM_ESLINT_REPORT_ID) throw new Error('A report path and run ID are required.');
  // A failed new scan must never leave a previously successful report behind.
  rmSync(path, { force: true });
  const rules = Object.fromEntries(AUDIT_RULES.map((rule) => [rule, 'warn']));
  const results = runESLint(root, ['src', 'scripts', '--rule', JSON.stringify(rules)], execute);
  validateResults(results, root, true);
  // Enabling a rule can consume an eslint-disable that the default run calls
  // unused. Recheck only those files under the default configuration so the
  // hard lint/regular ratchet retain that diagnostic. Most runs need none.
  const suppressed = results.filter((file) => file.suppressedMessages?.some(
    (message) => AUDIT_RULES.includes(message.ruleId),
  ));
  if (suppressed.length) {
    const regular = runESLint(root, suppressed.map((file) => file.filePath), execute);
    const byPath = new Map(regular.map((file) => [file.filePath, file.messages]));
    for (const file of suppressed) {
      if (!byPath.has(file.filePath)) throw new Error('ESLint omitted a suppression compatibility result.');
      file.regularMessages = byPath.get(file.filePath);
    }
    console.log(`ESLint rechecked ${suppressed.length} file(s) for default unused-disable semantics.`);
  }
  writeFileSync(path, JSON.stringify({
    version: 1, root: resolve(root), runId: env.HELM_ESLINT_REPORT_ID, results,
  }));
  console.log(`ESLint scanned ${results.length} files; shared report ready.`);
}

export function loadResults(root, standaloneArgs, env = process.env) {
  if (!env.HELM_ESLINT_REPORT) return runESLint(root, standaloneArgs);
  const report = JSON.parse(readFileSync(env.HELM_ESLINT_REPORT, 'utf8'));
  if (!env.HELM_ESLINT_REPORT_ID || report.version !== 1 ||
      report.runId !== env.HELM_ESLINT_REPORT_ID || report.root !== resolve(root)) {
    throw new Error('ESLint report does not belong to this workspace and CI run.');
  }
  return validateResults(report.results, root, true);
}

export function withoutAuditRules(results) {
  return results.map((file) => ({
    ...file, messages: (file.regularMessages ?? file.messages).filter((message) => !AUDIT_RULES.includes(message.ruleId)),
  }));
}

export function standardDiagnostics(root, results) {
  return withoutAuditRules(results).filter((file) =>
    sourceFile(root, file) && /\.(ts|tsx)$/.test(file.filePath),
  ).flatMap((file) => file.messages.map((message) => ({ filePath: file.filePath, ...message })));
}
