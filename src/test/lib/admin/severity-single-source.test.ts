/**
 * The Bridge must have exactly ONE definition of "what counts".
 *
 * It used to have two, hand-written at seven call sites — `['error','critical']`
 * on the KPI surfaces and `neq('info')` on the operator-facing ones. Over the 30
 * days to 2026-08-06 that meant the feed showed 667 events while the tiles
 * counted 390: 41.5% of what an operator could see did not exist in the headline
 * number. Nothing in the codebase recorded that the two tiers were different on
 * purpose, so any new surface picked one at random.
 *
 * The last test here is the one that matters: it fails if a hand-written
 * severity filter reappears anywhere in the Bridge's data layer.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_SEVERITIES,
  FAILURE_SEVERITIES,
  INCIDENT_SEVERITIES,
  isFailureSeverity,
  isIncidentSeverity,
} from '@/lib/admin/severity';

describe('Bridge severity tiers', () => {
  it('pins each tier so a change has to be deliberate', () => {
    expect(INCIDENT_SEVERITIES).toEqual(['warning', 'error', 'critical']);
    expect(FAILURE_SEVERITIES).toEqual(['error', 'critical']);
  });

  it('what the headline counts is a strict subset of what the operator sees', () => {
    // Otherwise a KPI could count something the feed refuses to show, and no
    // amount of clicking would explain the number.
    for (const s of FAILURE_SEVERITIES) expect(INCIDENT_SEVERITIES).toContain(s);
    expect(INCIDENT_SEVERITIES.length).toBeGreaterThan(FAILURE_SEVERITIES.length);
  });

  it('classifies every severity the column actually holds', () => {
    // Production carries exactly these four (verified 2026-08-06). A fifth
    // appearing without a decision here would silently fall out of both tiers.
    expect(ALL_SEVERITIES).toEqual(['info', 'warning', 'error', 'critical']);
    expect(ALL_SEVERITIES.filter(isIncidentSeverity)).toEqual(['warning', 'error', 'critical']);
    expect(ALL_SEVERITIES.filter(isFailureSeverity)).toEqual(['error', 'critical']);
    // 'info' is deliberately in neither — routine narration, not an incident.
    expect(isIncidentSeverity('info')).toBe(false);
    expect(isFailureSeverity('info')).toBe(false);
  });

  it('no Bridge data module hand-writes a severity filter', () => {
    const dir = path.join(process.cwd(), 'src/lib/admin/data');
    const offenders: string[] = [];

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = fs
        .readFileSync(path.join(dir, file), 'utf8')
        // Ignore comments — prose about the old filters is not a filter.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');

      src.split('\n').forEach((line, i) => {
        // A severity predicate whose values are written inline rather than
        // imported from the shared module.
        const inlineList = /\.(in|eq|neq|not)\(\s*'severity'\s*,\s*(\[?\s*')/.test(line);
        const usesSharedConst = /(FAILURE|INCIDENT|ALL)_SEVERITIES/.test(line);
        if (inlineList && !usesSharedConst) {
          offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(
      offenders,
      `Hand-written severity filter(s) found. Import FAILURE_SEVERITIES (headline\n` +
        `counts) or INCIDENT_SEVERITIES (what an operator sees) from\n` +
        `@/lib/admin/severity instead — that is the only place the tiers are defined:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
