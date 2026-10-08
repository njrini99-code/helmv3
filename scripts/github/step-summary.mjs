#!/usr/bin/env node
/**
 * The end-of-job aggregate for Static checks and Lint.
 *
 * Every check in those jobs is `continue-on-error: true` so one failure cannot
 * hide another; this step fails the job afterwards, naming each step that did
 * not succeed. Since 2026-10-07 it also writes the failing step's NAME and the
 * first error line of its output to $GITHUB_STEP_SUMMARY, so the run's summary
 * page says what broke without opening a 3,000-line log.
 *
 * Inputs (environment):
 *   STEP_OUTCOMES   toJSON(steps) — id -> { outcome, conclusion }
 *   WORKFLOW_FILE   the workflow, to map step ids to step names
 *   JOB_ID          the job's key in that file
 *   IGNORE_STEPS    comma-separated step ids that are plumbing (a path filter and
 *                   its gate), not checks, and so may be skipped or fail
 *   RUNNER_TEMP     where scripts/github/step-shell.sh left <id>.log files
 *   GITHUB_STEP_SUMMARY
 *
 * A skipped step counts as a failure: a gate that did not run is not a gate that
 * passed. Exit 1 if any step did not succeed.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** id -> name for the steps of one job, from the workflow text. No YAML dependency: this runs after a failed `npm ci` too. */
export function stepNames(workflowText, jobId) {
  const lines = workflowText.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === `  ${jobId}:`);
  if (start === -1) return new Map();
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const names = new Map();
  let block = [];
  const flush = () => {
    const id = block.map((l) => /^\s+(?:- )?id:\s*(\S+)\s*$/.exec(l)?.[1]).find(Boolean);
    const name = block.map((l) => /^\s+(?:- )?name:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
    if (id && name) names.set(id, name.replace(/^['"]|['"]$/g, ''));
    block = [];
  };
  for (const line of lines.slice(start + 1, end)) {
    if (/^ {6}- /.test(line)) flush();
    block.push(line);
  }
  flush();
  return names;
}

const ERROR_LINE = /^::error[^:]*::(.*)$|^(?:##\[error\])(.*)$/;
const LOOKS_LIKE_ERROR = /\berror\b|\bfail(ed|ure|s)?\b|✖|✗|FAIL\b|REGRESSION|Cannot find|not found/i;

/** The first error line of a step's output. Pure. */
export function firstErrorLine(logText) {
  const lines = String(logText).split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  for (const l of lines) {
    const m = ERROR_LINE.exec(l);
    if (m) return (m[1] ?? m[2] ?? '').trim();
  }
  const guess = lines.find((l) => LOOKS_LIKE_ERROR.test(l));
  if (guess) return guess.trim();
  return lines.length ? lines[lines.length - 1].trim() : '';
}

/** Build the plain-text report, the markdown summary and the verdict. Pure. */
export function summarize({ outcomes, names, logs, ignore = new Set() }) {
  const rows = Object.entries(outcomes).filter(([id]) => !ignore.has(id)).map(([id, v]) => ({ id, name: names.get(id) ?? id, outcome: v?.outcome ?? 'unknown' }));
  const bad = rows.filter((r) => r.outcome !== 'success');
  const text = rows.map((r) => (r.outcome === 'success' ? `ok      ${r.id}` : `FAILED  ${r.id} -> ${r.outcome}`)).join('\n');
  const md = [];
  if (bad.length) {
    md.push('| Step | Outcome | First error |', '| --- | --- | --- |');
    for (const r of bad) {
      const first = r.outcome === 'skipped' ? 'did not run (an earlier step failed it)' : firstErrorLine(logs.get(r.id) ?? '') || '(no output captured)';
      md.push(`| ${r.name} (\`${r.id}\`) | ${r.outcome} | ${first.replace(/\|/g, '\\|').slice(0, 300)} |`);
    }
  }
  return { bad, text, markdown: md.join('\n'), ok: bad.length === 0 };
}

function main() {
  const outcomes = JSON.parse(process.env.STEP_OUTCOMES ?? '{}');
  const workflow = process.env.WORKFLOW_FILE ? readFileSync(process.env.WORKFLOW_FILE, 'utf8') : '';
  const names = stepNames(workflow, process.env.JOB_ID ?? '');
  const dir = join(process.env.RUNNER_TEMP ?? '/tmp', 'step-logs');
  const logs = new Map();
  for (const id of Object.keys(outcomes)) {
    const file = join(dir, `${id}.log`);
    if (existsSync(file)) logs.set(id, readFileSync(file, 'utf8'));
  }
  const ignore = new Set((process.env.IGNORE_STEPS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  const result = summarize({ outcomes, names, logs, ignore });
  console.log(result.text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const title = `### ${process.env.JOB_ID ?? 'job'}: ${result.ok ? 'every check passed' : `${result.bad.length} check(s) did not succeed`}`;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${title}\n\n${result.markdown}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
