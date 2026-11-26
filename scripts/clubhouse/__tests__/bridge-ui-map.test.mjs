import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBridgeContracts, renderBridgeUiMap, runBridgeUiMapCheck, CONTRACTS_PATH } from '../bridge-ui-map.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const sample = () => ({
  screens: { B11: { name: 'Drift', route: '/admin/clubhouse/drift' }, B13: { name: 'Duet desk', route: '/admin/clubhouse/duet' } },
  codes: [
    { code: 'BR-1101', screen: 'B11', key: 'drift.listTab', label: 'List tab', does: 'Switches list' },
    { code: 'BR-1301', screen: 'B13', key: 'duet.packRow', label: 'Pack row', does: 'Opens the preview' },
  ],
});

test('a well-formed contract file has no violations and renders deterministically', () => {
  assert.deepEqual(checkBridgeContracts(sample()), []);
  const a = renderBridgeUiMap(sample());
  assert.equal(a, renderBridgeUiMap(sample()));
  assert.match(a, /^# Bridge UI map\n/);
  assert.match(a, /\| BR-1101 \| List tab \| Switches list \| `BR\.drift\.listTab` \|/);
  assert.match(a, /## B13 Duet desk/);
});

test('catches a duplicate, a wrong screen, a missing label and an unsorted list', () => {
  const c = sample();
  c.codes.push({ code: 'BR-1101', screen: 'B11', key: 'drift.row', label: 'Row', does: 'x' });
  c.codes.push({ code: 'BR-1302', screen: 'B11', key: 'duet.copy', label: '', does: 'x' });
  c.codes.push({ code: 'BR-1201', screen: 'B12', key: 'readiness.pageRow', label: 'x', does: 'x' });
  const v = checkBridgeContracts(c).join('\n');
  assert.match(v, /BR-1101 is listed twice/);
  assert.match(v, /BR-1302 belongs to B13, not B11/);
  assert.match(v, /BR-1302 has no label/);
  assert.match(v, /BR-1201 is on B12, which is not in screens/);
  assert.match(v, /not sorted/);
});

test('the committed contracts and map are current', () => {
  assert.deepEqual(runBridgeUiMapCheck(root), []);
  const contracts = JSON.parse(readFileSync(join(root, CONTRACTS_PATH), 'utf8'));
  assert.ok(contracts.codes.length > 90);
});
