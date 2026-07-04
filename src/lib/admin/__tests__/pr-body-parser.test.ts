import { describe, expect, it } from 'vitest';
import { inferWorkAreaFromTitle, parsePullRequestBody } from '@/lib/admin/pr-body-parser';

const SAMPLE_BODY = `## Summary

Fix calendar timezone drift on GolfHelm events.

## Partner-readable summary

Coaches saw practice blocks on the wrong day after DST. What changed: events now store team timezone and render in local wall time. Why it matters: demo reliability for spring onboarding.

## Type of change

- [x] Bug fix
- [ ] Feature / new behavior

## Area

golf

## Git Activity Timeline note

Calendar events stay on the correct day after timezone changes.

## Checklist

- [x] Tests pass
`;

describe('parsePullRequestBody', () => {
  it('extracts template sections into problem / fix / area', () => {
    const parsed = parsePullRequestBody(SAMPLE_BODY, 'fix(golf): calendar timezone');
    expect(parsed.area).toBe('golf');
    expect(parsed.summary).toContain('timezone drift');
    expect(parsed.problem).toContain('wrong day');
    expect(parsed.fix).toContain('local wall time');
    expect(parsed.timelineNote).toContain('correct day');
    expect(parsed.changeTypes).toEqual(['Bug fix']);
  });

  it('falls back to title inference when Area is missing', () => {
    const parsed = parsePullRequestBody('## Summary\n\nPipeline card drag fix.', 'fix(baseball): pipeline stage drag');
    expect(parsed.area).toBe('baseball');
  });

  it('uses summary when partner block is absent', () => {
    const parsed = parsePullRequestBody('## Summary\n\nHarden admin Sentry read API.', 'fix(admin): sentry errors tab');
    expect(parsed.area).toBe('bridge');
    expect(parsed.problem).toContain('Sentry');
  });
});

describe('inferWorkAreaFromTitle', () => {
  it('detects coachhelm from title keywords', () => {
    expect(inferWorkAreaFromTitle('feat(coachhelm): insight lifecycle')).toBe('coachhelm');
  });
});
