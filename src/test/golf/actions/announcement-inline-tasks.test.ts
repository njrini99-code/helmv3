import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tasks attached to an announcement could never be created.
 *
 * The insert named `created_by`, and `golf_tasks` has no such column — it has
 * `assigned_by`, which is what createTask (tasks.ts:312) writes. Postgres
 * answers 42703 undefined_column; supabase-js RESOLVES that as
 * `{ data: null, error }` rather than throwing; the error was discarded.
 * `insertedTaskIds` came back empty, the `length > 0` guard skipped the link
 * and assignment inserts, and the action returned success.
 *
 * So a coach composing "read this, then do these three things" was told it all
 * went out, and not one task existed. Nothing was logged either, so there was
 * no trace to find it by — only a player who never saw a task and a coach who
 * assumed they had ignored it.
 *
 * This file pins the column names against the real schema and pins that each
 * of the three inserts now reports its own failure, because they fail in
 * three different and separately confusing ways.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/app/golf/actions/announcements.ts'),
  'utf8',
);

/** Comments name the very patterns this file forbids — matching one is a false pass. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

/** The inline-task block, isolated so assertions cannot drift onto other code. */
function inlineTaskBlock(): string {
  const start = CODE.indexOf('const taskRows =');
  expect(start, 'inline task block not found — was it renamed?').toBeGreaterThan(-1);
  return CODE.slice(start, start + 3000);
}

describe('announcement inline tasks — the insert has to match the real table', () => {
  beforeEach(() => logServerError.mockClear());

  it('writes assigned_by, the column golf_tasks actually has', () => {
    // Verified against the live table on 2026-08-08: golf_tasks has
    // id, team_id, assigned_by, assigned_to, title, description, task_type,
    // due_date, status, completed_at, priority, created_at, updated_at,
    // reminder_at, reminder_type, reminder_sent, category, recurrence_rule,
    // parent_task_id. There is no created_by.
    const block = inlineTaskBlock();
    expect(block).toContain('assigned_by: coach.id');
    expect(block).not.toContain('created_by: coach.id');
  });

  it("uses the status every other reader and writer uses", () => {
    // 'active' would have inserted fine — status is free text — and then been
    // invisible to the tasks list. The same bug one layer later.
    const block = inlineTaskBlock();
    expect(block).toContain("status: 'pending'");
    expect(block).not.toContain("status: 'active'");
  });
});

describe('announcement inline tasks — each insert reports its own failure', () => {
  it('a failed task insert is recorded, naming what the coach is left with', () => {
    const block = inlineTaskBlock();
    expect(block).toContain('insertedTasksResult.error');
    expect(CODE).toMatch(/the announcement exists but carries no tasks/);
  });

  it('a failed link insert is recorded — orphaned tasks look unrelated to the announcement', () => {
    const block = inlineTaskBlock();
    expect(block).toContain('linkResult.error');
    expect(CODE).toMatch(/tasks exist but are not attached to it/);
  });

  it('a failed assignment insert is recorded — the worst of the three', () => {
    // The task exists and is linked, so the coach sees it on the announcement,
    // but it reached nobody and the completion count sits at 0/0 looking done.
    const block = inlineTaskBlock();
    expect(block).toContain('assignmentResult.error');
    expect(CODE).toMatch(/the tasks reached no players/);
  });

  it('none of the three failures aborts the announcement itself', () => {
    // The announcement row is already committed by this point. Throwing here
    // would leave it sent with no way to retry the tasks, which is worse than
    // reporting the partial failure.
    const block = inlineTaskBlock();
    expect(block).not.toMatch(/insertedTasksResult\.error[\s\S]{0,300}throw /);
  });
});
