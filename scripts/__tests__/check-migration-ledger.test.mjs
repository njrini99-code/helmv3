import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../check-migration-ledger.mjs';

test('flags file missing from ledger', () => {
  const files = ['20260519100000_new.sql'];
  const ledger = [{ version: '20260518124505', name: 'old' }];
  const result = reconcile(files, ledger);
  assert.deepEqual(result.missingFromLedger, ['20260519100000_new.sql']);
  assert.deepEqual(result.missingFromDisk, [{ version: '20260518124505', name: 'old' }]);
});

test('flags ledger entry missing from disk', () => {
  const files = [];
  const ledger = [{ version: '20260519100000', name: 'ghost' }];
  const result = reconcile(files, ledger);
  assert.deepEqual(result.missingFromDisk, [{ version: '20260519100000', name: 'ghost' }]);
  assert.equal(result.missingFromLedger.length, 0);
});

test('passes when in sync', () => {
  const files = ['20260518124505_old.sql'];
  const ledger = [{ version: '20260518124505', name: 'old' }];
  const result = reconcile(files, ledger);
  assert.equal(result.missingFromLedger.length, 0);
  assert.equal(result.missingFromDisk.length, 0);
});

test('handles multiple files and ledger entries correctly', () => {
  const files = [
    '20260518124505_old.sql',
    '20260519100000_new.sql',
    '20260520123000_orphan_on_disk.sql',
  ];
  const ledger = [
    { version: '20260518124505', name: 'old' },
    { version: '20260519100000', name: 'new' },
    { version: '20260521000000', name: 'orphan_in_ledger' },
  ];
  const result = reconcile(files, ledger);
  assert.deepEqual(result.missingFromLedger, ['20260520123000_orphan_on_disk.sql']);
  assert.deepEqual(result.missingFromDisk, [{ version: '20260521000000', name: 'orphan_in_ledger' }]);
});
