// The durable records must refer to things that exist, and every "none" must be
// a decision rather than a blank.
//
// This checker found five real problems on its first run against the live tree:
// four incidents whose `- Feature:` line carried prose ("Golf Round Lifecycle
// and Stats Analytics") instead of the backticked registry id, which made them
// readable and unlinkable — nothing could join them to the registry, the release
// queue, or the feature map, and one silently named two features in a field the
// model treats as one. Plus one repair unit with `incident_id: null` and no
// reason, which is indistinguishable from a forgotten link.
//
// The fixture below is a whole miniature knowledge base, because that is what
// the checker reads. It is built in a temp directory and the script is invoked
// with cwd pointed at it — the script resolves ROOT from cwd for exactly this
// reason.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../../scripts/knowledge/check-ledger-integrity.mjs');

describe('ledger integrity', () => {
  let root: string;

  function write(rel: string, body: string) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  }

  function run() {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  /** A minimal but VALID knowledge base — every test mutates one thing. */
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'helm-ledger-')));
    write('memory/registry.yml', 'version: 1\n\nfeatures:\n  qualifiers:\n    name: Qualifiers\n');
    write(
      'memory/incidents/qualifiers/INC-2026-08-22-a-real-defect.md',
      '# INC-2026-08-22 — a real defect\n\n- Feature: `qualifiers`\n',
    );
    write(
      'memory/operations/release-queue.yml',
      [
        'version: 1',
        'items:',
        '  - id: unit-a',
        '    feature_id: qualifiers',
        '    incident_id: memory/incidents/qualifiers/INC-2026-08-22-a-real-defect.md',
        '    status: verified',
        '',
      ].join('\n'),
    );
    mkdirSync(join(root, 'memory/ledgers/changes'), { recursive: true });
    mkdirSync(join(root, 'memory/ledgers/tests'), { recursive: true });
    write('memory/ledgers/changes/qualifiers.md', '# changes\n');
    write('memory/ledgers/tests/qualifiers.md', '# tests\n');
    write(
      'config/control-plane-gaps.json',
      JSON.stringify({
        gaps: [{ id: 'G1', owner: 'founder', opened: '2026-08-30', reason: 'r', closes_when: 'w' }],
        closed: [{ id: 'G0', how: 'measured' }],
      }),
    );
    mkdirSync(join(root, 'memory/decisions'), { recursive: true });
    write('memory/decisions/README.md', '# decisions\n');
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('passes a knowledge base whose records all resolve', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Every durable record refers to something that exists/);
  });

  it('REPRODUCES the live finding: a prose Feature line is unlinkable', () => {
    write(
      'memory/incidents/qualifiers/INC-2026-08-22-a-real-defect.md',
      '# INC\n\n- Feature: Qualifiers and Shot Tracking\n',
    );
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/INCIDENT_NO_FEATURE_LINE/);
  });

  it('refuses an incident filed under a feature that is not in the registry', () => {
    write('memory/incidents/not_a_feature/INC-2026-08-22-x.md', '- Feature: `not_a_feature`\n');
    expect(run().stderr).toMatch(/INCIDENT_DIR_NOT_A_FEATURE/);
  });

  it('refuses an incident whose declared feature is not its directory', () => {
    write('memory/incidents/qualifiers/INC-2026-08-22-a-real-defect.md', '- Feature: `shot_tracking`\n');
    expect(run().stderr).toMatch(/INCIDENT_FEATURE_MISMATCH/);
  });

  it('refuses an incident filename outside INC-YYYY-MM-DD-<slug>.md', () => {
    write('memory/incidents/qualifiers/notes.md', '- Feature: `qualifiers`\n');
    expect(run().stderr).toMatch(/INCIDENT_FILENAME/);
  });

  it('refuses a repair unit pointing at an incident that does not exist', () => {
    write(
      'memory/operations/release-queue.yml',
      'version: 1\nitems:\n  - id: unit-a\n    feature_id: qualifiers\n    incident_id: memory/incidents/qualifiers/INC-2026-01-01-gone.md\n    status: verified\n',
    );
    expect(run().stderr).toMatch(/REPAIR_UNIT_DEAD_INCIDENT/);
  });

  it('REPRODUCES the live finding: incident_id null with no reason', () => {
    write(
      'memory/operations/release-queue.yml',
      'version: 1\nitems:\n  - id: unit-a\n    feature_id: qualifiers\n    incident_id: null\n    status: verified\n',
    );
    expect(run().stderr).toMatch(/REPAIR_UNIT_UNEXPLAINED_NULL_INCIDENT/);
  });

  it('accepts incident_id null WITH a reason — that is a decision', () => {
    write(
      'memory/operations/release-queue.yml',
      'version: 1\nitems:\n  - id: unit-a\n    feature_id: qualifiers\n    incident_id: null\n    no_incident_reason: capability change, not a defect\n    status: verified\n',
    );
    expect(run().status).toBe(0);
  });

  it('REPORTS a cross-feature incident reference and does NOT fail on it', () => {
    // One incident per proven root cause can legitimately serve two features.
    write('memory/registry.yml', 'version: 1\n\nfeatures:\n  qualifiers:\n    name: Q\n  shot_tracking:\n    name: S\n');
    write('memory/ledgers/changes/shot_tracking.md', '# c\n');
    write(
      'memory/operations/release-queue.yml',
      'version: 1\nitems:\n  - id: unit-a\n    feature_id: shot_tracking\n    incident_id: memory/incidents/qualifiers/INC-2026-08-22-a-real-defect.md\n    status: verified\n',
    );
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/note: repair unit 'unit-a'/);
  });

  it('refuses a repair unit status outside the documented vocabulary', () => {
    write(
      'memory/operations/release-queue.yml',
      'version: 1\nitems:\n  - id: unit-a\n    feature_id: qualifiers\n    incident_id: null\n    no_incident_reason: x\n    status: mostly_done\n',
    );
    expect(run().stderr).toMatch(/REPAIR_UNIT_BAD_STATUS/);
  });

  it('refuses a ledger filed under a second spelling of a feature id', () => {
    // The normalization rule: ledgers use the registry key verbatim. A
    // kebab-cased sibling is the same feature under a name nothing can find.
    write('memory/ledgers/changes/qualifiers-extra.md', '# c\n');
    expect(run().stderr).toMatch(/LEDGER_NOT_A_FEATURE/);
  });

  it('refuses a gap that is both open and closed', () => {
    write(
      'config/control-plane-gaps.json',
      JSON.stringify({
        gaps: [{ id: 'G1', owner: 'f', opened: 'd', reason: 'r', closes_when: 'w' }],
        closed: [{ id: 'G1', how: 'measured' }],
      }),
    );
    expect(run().stderr).toMatch(/GAP_OPEN_AND_CLOSED/);
  });

  it('refuses a gap whose contract path does not resolve', () => {
    write(
      'config/control-plane-gaps.json',
      JSON.stringify({
        gaps: [{ id: 'G1', owner: 'f', opened: 'd', reason: 'r', closes_when: 'w', contract: 'docs/GONE.md' }],
        closed: [],
      }),
    );
    expect(run().stderr).toMatch(/GAP_DEAD_CONTRACT/);
  });

  it('refuses a closed gap with no evidence of how', () => {
    write('config/control-plane-gaps.json', JSON.stringify({ gaps: [], closed: [{ id: 'G0' }] }));
    expect(run().stderr).toMatch(/GAP_CLOSED_WITHOUT_EVIDENCE/);
  });

  it('refuses an ADR that supersedes something which does not exist', () => {
    write('memory/decisions/ADR-2026-08-30-x.md', '**Supersedes:** ADR-2020-01-01-gone\n');
    expect(run().stderr).toMatch(/ADR_DEAD_SUPERSEDES/);
  });

  it('refuses an ADR filename outside ADR-YYYY-MM-DD-<slug>.md', () => {
    write('memory/decisions/notes.md', '# x\n');
    expect(run().stderr).toMatch(/ADR_FILENAME/);
  });
});
