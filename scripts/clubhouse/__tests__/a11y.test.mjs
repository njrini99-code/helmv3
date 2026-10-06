import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanOptions } from '../a11y.mjs';

test('keeps the existing default matrix', () => {
  const options = scanOptions({});
  assert.deepEqual(options.engines, ['chromium']);
  assert.deepEqual(options.motions, ['reduce']);
  assert.deepEqual(options.widths, [1280, 390]);
  assert.equal(options.heights, null);
  assert.ok(options.pages.length > 100);
});
test('selects engines, motion and short viewports independently', () => {
  const options = scanOptions({ CH_ENGINES: 'chromium,webkit', CH_MOTION: 'reduce,no-preference', CH_WIDTHS: '390,430', CH_HEIGHTS: '480,844' }, ['home']);
  assert.deepEqual(options.engines, ['chromium', 'webkit']);
  assert.deepEqual(options.motions, ['reduce', 'no-preference']);
  assert.deepEqual(options.heights, [480, 844]);
  assert.ok(options.pages.every(([name]) => name === 'home'));
});
test('rejects mixed unknown page names instead of passing a subset', () => {
  assert.throws(() => scanOptions({}, ['home', 'typo']), /Unknown Clubhouse pages/);
  assert.throws(() => scanOptions({}, ['']), /Unknown Clubhouse pages/);
});
test('rejects empty and malformed matrix selections before launch', () => {
  for (const env of [
    { CH_ENGINES: '' }, { CH_ENGINES: 'safari' }, { CH_ENGINES: 'chromium,' },
    { CH_MOTION: '' }, { CH_MOTION: 'normal' }, { CH_WIDTHS: '' },
    { CH_WIDTHS: '0' }, { CH_WIDTHS: 'NaN' }, { CH_WIDTHS: '390.5' },
    { CH_HEIGHTS: '-1' }, { CH_HEIGHTS: '10001' }, { CH_HEIGHTS: '480,' },
  ]) assert.throws(() => scanOptions(env));
});
