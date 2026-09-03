import { describe, it, expect } from 'vitest';
import {
  buildEvidenceCoverage,
  describeEvidenceCoverage,
  isEvidenceComplete,
  EVIDENCE_COVERAGE_SOURCES,
  type EvidenceReading,
} from '../coverage';

describe('buildEvidenceCoverage', () => {
  it('always returns one cell per source, in the declared order, even with zero readings', () => {
    const coverage = buildEvidenceCoverage([]);
    expect(coverage.cells.map((c) => c.source)).toEqual([...EVIDENCE_COVERAGE_SOURCES]);
    expect(coverage.total).toBe(6);
  });

  it('a source missing from readings becomes an explicit unknown cell, not a dropped row', () => {
    const readings: EvidenceReading[] = [{ source: 'sentry', health: 'reading', reason: null }];
    const coverage = buildEvidenceCoverage(readings);
    const github = coverage.cells.find((c) => c.source === 'github');
    expect(github?.health).toBe('unknown');
    expect(github?.mark).toBe('question');
    expect(github?.reason).toMatch(/no github read was attempted/i);
  });

  it('reading -> check (✓), never renders as blind or question', () => {
    const coverage = buildEvidenceCoverage([{ source: 'vercel', health: 'reading', reason: null }]);
    const cell = coverage.cells.find((c) => c.source === 'vercel')!;
    expect(cell.mark).toBe('check');
    expect(cell.reason).toBeNull();
  });

  it('blind -> blind, and is counted in blindSources/anyBlind', () => {
    const coverage = buildEvidenceCoverage([
      { source: 'sentry', health: 'blind', reason: 'Sentry read token invalid' },
    ]);
    const cell = coverage.cells.find((c) => c.source === 'sentry')!;
    expect(cell.mark).toBe('blind');
    expect(cell.reason).toBe('Sentry read token invalid');
    expect(coverage.anyBlind).toBe(true);
    expect(coverage.blindSources).toEqual(['sentry']);
  });

  it('partial -> question, distinct from blind, with its own reason preserved', () => {
    const coverage = buildEvidenceCoverage([
      { source: 'supabase', health: 'partial', reason: 'reliability snapshot truncated at top-N' },
    ]);
    const cell = coverage.cells.find((c) => c.source === 'supabase')!;
    expect(cell.mark).toBe('question');
    expect(cell.reason).toBe('reliability snapshot truncated at top-N');
    expect(coverage.anyBlind).toBe(false);
  });

  it('explicit unknown health (attempted-but-unknown, distinct from omitted) also marks question with its own reason', () => {
    const coverage = buildEvidenceCoverage([
      { source: 'jobs', health: 'unknown', reason: 'background_job_logs read timed out' },
    ]);
    const cell = coverage.cells.find((c) => c.source === 'jobs')!;
    expect(cell.mark).toBe('question');
    expect(cell.reason).toBe('background_job_logs read timed out');
  });

  it('present counts ONLY reading cells — never treats a blind or unknown source as a healthy zero', () => {
    const coverage = buildEvidenceCoverage([
      { source: 'sentry', health: 'reading', reason: null },
      { source: 'supabase', health: 'reading', reason: null },
      { source: 'flight-recorder', health: 'blind', reason: 'trace_runs unreadable' },
      { source: 'vercel', health: 'partial', reason: 'deploy history truncated' },
      // github, jobs omitted entirely -> unknown
    ]);
    expect(coverage.present).toBe(2);
    expect(coverage.total).toBe(6);
    expect([...coverage.unknownSources].sort()).toEqual(['github', 'jobs'].sort());
  });

  it('a fully blind incident is present=0 of total=6, never total=0', () => {
    const coverage = buildEvidenceCoverage(
      EVIDENCE_COVERAGE_SOURCES.map((source) => ({ source, health: 'blind' as const, reason: 'down' })),
    );
    expect(coverage.present).toBe(0);
    expect(coverage.total).toBe(6);
    expect(coverage.blindSources.length).toBe(6);
  });
});

describe('describeEvidenceCoverage', () => {
  it('never says "0 sources" for a fully unread incident — names all six by state', () => {
    const coverage = buildEvidenceCoverage([]);
    const line = describeEvidenceCoverage(coverage);
    expect(line).toBe('Evidence 0/6 · Sentry ? · Supabase ? · Flight Recorder ? · Vercel ? · GitHub ? · Jobs ?');
  });

  it('mixed coverage names each source with its own glyph', () => {
    const coverage = buildEvidenceCoverage([
      { source: 'sentry', health: 'reading', reason: null },
      { source: 'supabase', health: 'reading', reason: null },
      { source: 'flight-recorder', health: 'reading', reason: null },
      { source: 'vercel', health: 'partial', reason: 'x' },
      { source: 'github', health: 'blind', reason: 'y' },
      { source: 'jobs', health: 'reading', reason: null },
    ]);
    expect(describeEvidenceCoverage(coverage)).toBe(
      'Evidence 4/6 · Sentry ✓ · Supabase ✓ · Flight Recorder ✓ · Vercel ? · GitHub blind · Jobs ✓',
    );
  });
});

describe('isEvidenceComplete', () => {
  it('true only when every one of the six sources actually read', () => {
    const complete = buildEvidenceCoverage(
      EVIDENCE_COVERAGE_SOURCES.map((source) => ({ source, health: 'reading' as const, reason: null })),
    );
    expect(isEvidenceComplete(complete)).toBe(true);
  });

  it('false when even one source is partial, unknown, or blind', () => {
    const almost = buildEvidenceCoverage([
      ...EVIDENCE_COVERAGE_SOURCES.slice(0, 5).map((source) => ({ source, health: 'reading' as const, reason: null })),
      { source: EVIDENCE_COVERAGE_SOURCES[5]!, health: 'partial' as const, reason: 'x' },
    ]);
    expect(isEvidenceComplete(almost)).toBe(false);
  });

  it('false for a totally blind incident', () => {
    expect(isEvidenceComplete(buildEvidenceCoverage([]))).toBe(false);
  });
});
