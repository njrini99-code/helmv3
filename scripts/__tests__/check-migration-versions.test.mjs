import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMigrationVersions, versionOf } from '../check-migration-versions.mjs';

test('versionOf extracts the leading timestamp segment', () => {
  assert.equal(versionOf('20260624000220_baseball_passport.sql'), '20260624000220');
  assert.equal(versionOf('20260624000220_a_b_c.sql'), '20260624000220');
});

test('passes when every version prefix is unique and well-formed', () => {
  const files = [
    '20260624000080_elite.sql',
    '20260624000081_staff.sql',
    '20260624000090_settings.sql',
  ];
  const { duplicates, malformed } = analyzeMigrationVersions(files);
  assert.equal(duplicates.length, 0);
  assert.equal(malformed.length, 0);
});

test('flags two files sharing a version prefix (the exact 220 hazard)', () => {
  const files = [
    '20260624000220_baseball_player_passport_and_daily_contract.sql',
    '20260624000220_baseball_video_links_and_class_conflicts.sql',
  ];
  const { duplicates } = analyzeMigrationVersions(files);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].version, '20260624000220');
  assert.deepEqual(duplicates[0].files, [
    '20260624000220_baseball_player_passport_and_daily_contract.sql',
    '20260624000220_baseball_video_links_and_class_conflicts.sql',
  ]);
});

test('flags a 3+-way duplicate group with all offenders sorted', () => {
  const files = [
    '20260624000090_z_third.sql',
    '20260624000090_a_first.sql',
    '20260624000090_m_second.sql',
  ];
  const { duplicates } = analyzeMigrationVersions(files);
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].files, [
    '20260624000090_a_first.sql',
    '20260624000090_m_second.sql',
    '20260624000090_z_third.sql',
  ]);
});

test('reports multiple duplicate groups ordered by version', () => {
  const files = [
    '20260624000220_b.sql',
    '20260624000080_b.sql',
    '20260624000220_a.sql',
    '20260624000080_a.sql',
    '20260624000099_unique.sql',
  ];
  const { duplicates } = analyzeMigrationVersions(files);
  assert.deepEqual(duplicates.map((d) => d.version), ['20260624000080', '20260624000220']);
});

test('flags malformed (non-14-digit) version prefixes', () => {
  const files = [
    '2026062400022_short.sql', // 13 digits
    '202606240002200_long.sql', // 15 digits
    'notanumber_x.sql',
    '20260624000220_ok.sql',
  ];
  const { malformed } = analyzeMigrationVersions(files);
  assert.deepEqual(malformed, [
    '202606240002200_long.sql',
    '2026062400022_short.sql',
    'notanumber_x.sql',
  ]);
});

test('empty input is clean', () => {
  const { duplicates, malformed } = analyzeMigrationVersions([]);
  assert.equal(duplicates.length, 0);
  assert.equal(malformed.length, 0);
});
