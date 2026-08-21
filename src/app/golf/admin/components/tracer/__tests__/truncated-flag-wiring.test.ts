/**
 * Bridge audit 2026-08-21: `TracerData.truncated` (admin-tracer-data.ts) was
 * computed correctly — true once golf_rounds/golf_players/golf_player_stats_cache
 * hit their query caps — but its own doc comment said "just expose, don't
 * render," and grepping components/tracer/ + TracerTab.tsx found zero reads
 * of it anywhere. The day total rounds crosses the 500-row cap, the
 * Completion Rate KPI (and the health score's completion component) would
 * silently under-count platform-wide with no warning. This pins the wiring
 * chain: TracerTab -> TracerHealthOverview -> TracerKPICards.
 *
 * Source-text guards, not a render test: no existing test file renders these
 * three components (no RTL harness set up for them), and this fix is pure
 * prop-threading with a 3-line conditional string — a full render test would
 * add more scaffolding than the bug warrants.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TRACER_DIR = path.join(process.cwd(), 'src/app/golf/admin/components/tracer');
const ADMIN_COMPONENTS_DIR = path.join(process.cwd(), 'src/app/golf/admin/components');

function read(file: string, dir: string = TRACER_DIR): string {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

describe('TracerData.truncated is wired to the Completion Rate KPI', () => {
  it('TracerKPICards accepts a truncated prop and renders the "first 500 rounds" caveat when true', () => {
    const src = read('TracerKPICards.tsx');
    expect(src).toMatch(/truncated\?:\s*boolean/);
    expect(src).toContain('first 500 rounds');
  });

  it('TracerHealthOverview passes truncated through to TracerKPICards, not just receives it', () => {
    const src = read('TracerHealthOverview.tsx');
    expect(src).toMatch(/truncated\?:\s*boolean/);
    expect(src).toMatch(/<TracerKPICards[\s\S]{0,400}?truncated=\{truncated\}/);
  });

  it('TracerTab passes data.truncated into TracerHealthOverview', () => {
    const src = read('TracerTab.tsx', ADMIN_COMPONENTS_DIR);
    expect(src).toMatch(/<TracerHealthOverview[\s\S]{0,1200}?truncated=\{data\.truncated\}/);
  });
});
