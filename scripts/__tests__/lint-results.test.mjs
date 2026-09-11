import { afterEach, describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_RULES, loadResults, produceReport, runESLint, standardDiagnostics } from '../lib/lint-results.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'helm-lint-')));
  temporary.push(root);
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/example.ts'), 'export const example = 1;\n');
  for (const name of ['lint-ci.mjs', 'lint-ratchet.mjs', 'supabase-error-audit.mjs', 'fail-open-audit.mjs', 'paginated-read-audit.mjs', 'lib/lint-results.mjs']) {
    copyFileSync(join(repo, 'scripts', name), join(root, 'scripts', name));
  }
  const env = { ...process.env, HELM_ESLINT_REPORT: join(root, 'report.json'), HELM_ESLINT_REPORT_ID: 'run-1' };
  const file = (path, messages = []) => ({ filePath: join(root, path), messages });
  const report = (results = [file('src/example.ts'), file('scripts/example.mjs')], extra = {}) => {
    writeFileSync(env.HELM_ESLINT_REPORT, JSON.stringify({ version: 1, root, runId: env.HELM_ESLINT_REPORT_ID, results, ...extra }));
  };
  const run = (script, args = []) => spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd: root, env, encoding: 'utf8' });
  return { root, env, file, report, run };
}
const diagnostic = (ruleId, severity = 1) => ({ ruleId, severity, message: 'fixture diagnostic' });

describe('one ESLint scan', () => {
  it('accepts exit 1 JSON, enables all audits, and does not invoke a scan for consumers', () => {
    const f = fixture();
    let calls = 0;
    produceReport(f.root, f.env, (_command, args) => {
      calls++;
      expect(args.slice(1, 3)).toEqual(['src', 'scripts']);
      expect(JSON.parse(args[args.indexOf('--rule') + 1])).toEqual(Object.fromEntries(AUDIT_RULES.map((rule) => [rule, 'warn'])));
      throw Object.assign(new Error('diagnostics'), { status: 1, stdout: JSON.stringify([f.file('src/example.ts', [diagnostic('regular', 2)]), f.file('scripts/example.mjs')]) });
    });
    expect(loadResults(f.root, [], f.env)).toHaveLength(2);
    expect(calls).toBe(1);
  });

  it('preserves default unused-disable warnings when an audit consumes the directive', () => {
    const f = fixture();
    const linter = new Linter();
    const rule = AUDIT_RULES[0];
    const text = `// eslint-disable-next-line ${rule}\nconst example = 1;`;
    const config = (enabled) => ({
      plugins: { helm: { rules: { 'no-unchecked-supabase-error': {
        meta: { schema: [] },
        create(context) { return { VariableDeclaration(node) { context.report({ node, message: 'audit' }); } }; },
      } } } },
      rules: { [rule]: enabled ? 'warn' : 'off' },
    });
    const combined = linter.verify(text, config(true));
    const suppressedMessages = linter.getSuppressedMessages();
    const regular = linter.verify(text, config(false));
    expect(combined).toEqual([]);
    expect(regular[0].message).toContain('Unused eslint-disable');
    let calls = 0;
    produceReport(f.root, f.env, (_command, args) => {
      calls++;
      if (calls === 1) return JSON.stringify([
        { ...f.file('src/example.ts', combined), suppressedMessages }, f.file('scripts/example.mjs'),
      ]);
      expect(args).toContain(join(f.root, 'src/example.ts'));
      expect(args).not.toContain('src');
      expect(args).not.toContain('--rule');
      return JSON.stringify([f.file('src/example.ts', regular)]);
    });
    expect(calls).toBe(2);
    expect(f.run('lint-ci.mjs').status).toBe(1);
    writeFileSync(join(f.root, '.lint-baseline.json'), '{}');
    expect(f.run('lint-ratchet.mjs').status).toBe(1);
    expect(loadResults(f.root, [], f.env)[0].messages).toEqual([]);
  });

  it.each([2, null, undefined])('rejects tooling failure %s even with valid partial JSON and removes old reports', (status) => {
    const f = fixture();
    f.report();
    expect(() => produceReport(f.root, f.env, () => {
      throw Object.assign(new Error('tool failed'), { status, stdout: JSON.stringify([f.file('src/example.ts'), f.file('scripts/example.mjs')]) });
    })).toThrow('tool failed');
    expect(existsSync(f.env.HELM_ESLINT_REPORT)).toBe(false);
    expect(f.run('lint-ci.mjs').status).toBe(1);
  });

  it.each(['', 'not json', '[]', '{}'])('rejects invalid/empty producer output %j', (raw) => {
    const f = fixture();
    expect(() => produceReport(f.root, f.env, () => raw)).toThrow();
    expect(existsSync(f.env.HELM_ESLINT_REPORT)).toBe(false);
  });

  it('rejects stale, wrong-workspace, missing-scope, and malformed reports without fallback', () => {
    const f = fixture();
    for (const extra of [{ runId: 'old-run' }, { root: '/old-worktree' }, { results: [] }, { results: [f.file('src/example.ts')] }, { results: [f.file('src/example.ts', [{}]), f.file('scripts/example.mjs')] }]) {
      f.report(undefined, extra);
      expect(() => loadResults(f.root, [], f.env)).toThrow();
    }
    f.report();
    expect(() => loadResults(f.root, [], { ...f.env, HELM_ESLINT_REPORT_ID: '' })).toThrow();
  });

  it('retains a direct standalone ESLint execution path', () => {
    const f = fixture();
    const results = runESLint(f.root, ['src', '--rule', '{"rule":"warn"}'], (command, args) => {
      expect(command).toBe('npx');
      expect(args).toEqual(['eslint', 'src', '--rule', '{"rule":"warn"}', '--format', 'json', '--max-warnings', '999999']);
      return JSON.stringify([f.file('src/example.ts')]);
    });
    expect(results).toHaveLength(1);
  });
});

describe('existing gate semantics', () => {
  it('keeps hard lint on src TS/TSX only, excluding opt-in diagnostics', () => {
    const f = fixture();
    const results = [f.file('src/example.ts', AUDIT_RULES.map((rule) => diagnostic(rule))), f.file('scripts/example.mjs', [diagnostic('regular', 2)]), f.file('src/example.js', [diagnostic('regular')])];
    expect(standardDiagnostics(f.root, results)).toEqual([]);
    f.report(results);
    expect(f.run('lint-ci.mjs').status).toBe(0);
    for (const severity of [1, 2]) {
      f.report([...results, f.file('src/failure.tsx', [diagnostic('regular', severity)])]);
      expect(f.run('lint-ci.mjs').status).toBe(1);
    }
  });

  it('counts script errors with ERROR: and ignores audit rules in the generic ratchet', () => {
    const f = fixture();
    f.report([f.file('src/example.ts', [diagnostic(AUDIT_RULES[0]), diagnostic('regular')]), f.file('scripts/example.mjs', [diagnostic('regular', 2), diagnostic(AUDIT_RULES[1])])]);
    writeFileSync(join(f.root, '.lint-baseline.json'), JSON.stringify({ regular: 1, 'ERROR:regular': 1 }));
    expect(f.run('lint-ratchet.mjs').status).toBe(0);
    writeFileSync(join(f.root, '.lint-baseline.json'), JSON.stringify({ regular: 1 }));
    const regression = f.run('lint-ratchet.mjs');
    expect(regression.status).toBe(1);
    expect(regression.stderr).toContain('ERROR:regular');
    expect(f.run('lint-ratchet.mjs', ['--update']).status).toBe(0);
    expect(JSON.parse(readFileSync(join(f.root, '.lint-baseline.json'), 'utf8'))).toEqual({ regular: 1, 'ERROR:regular': 1 });
  });

  it.each(['supabase-error', 'fail-open', 'paginated-read'])('%s retains src-only totals, false-zero, slack, regression and updates', (name) => {
    const f = fixture();
    const index = ['supabase-error', 'fail-open', 'paginated-read'].indexOf(name);
    const rule = AUDIT_RULES[index];
    const baseline = join(f.root, `.${name}-baseline.json`);
    const run = () => f.run(`${name}-audit.mjs`);
    const withTotal = (count) => f.report([f.file('src/example.ts', Array.from({ length: count }, () => diagnostic(rule))), f.file('scripts/example.mjs', [diagnostic(rule)])]);
    writeFileSync(baseline, JSON.stringify({ total: 2 }));
    withTotal(2);
    const passing = run();
    expect(passing.status).toBe(0);
    if (name === 'supabase-error') expect(passing.stdout).toContain('coverage (report-only');
    withTotal(0);
    expect(run().stderr).toContain('found 0');
    expect(run().status).toBe(1);
    withTotal(1);
    expect(run().stderr).toContain('SLACK:');
    withTotal(3);
    const regression = run();
    expect(regression.status).toBe(1);
    expect(regression.stderr).toContain('REGRESSION:');
    expect(f.run(`${name}-audit.mjs`, ['--update']).status).toBe(0);
    expect(JSON.parse(readFileSync(baseline, 'utf8')).total).toBe(3);
  });
});
