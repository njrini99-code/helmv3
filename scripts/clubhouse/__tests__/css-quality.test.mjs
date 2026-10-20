import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectCSS, lintCSS } from '../css-quality.mjs';

test('Stylelint parses CSS and catches duplicates and unknown properties', async () => {
  const findings = await lintCSS('.ch-card{color:red;color:red;colro:blue;--ch-x:1;--ch-x:2}');
  assert(findings.some((finding) => finding.rule === 'declaration-block-no-duplicate-properties'));
  assert(findings.some((finding) => finding.rule === 'declaration-block-no-duplicate-custom-properties'));
  assert(findings.some((finding) => finding.rule === 'property-no-unknown'));
  assert((await lintCSS('.ch-card{color:red')).some((finding) => finding.rule === 'CssSyntaxError'));
});
test('Stylelint catches malformed colors, broken calc and ineffective keyframe priority', async () => {
  const findings = await lintCSS('.ch-card{color:#ggg;width:calc(100% -2px)} @keyframes ch-test{to{opacity:0!important}}');
  for (const rule of ['color-no-invalid-hex', 'function-calc-no-unspaced-operator', 'keyframe-declaration-no-important'])
    assert(findings.some(finding => finding.rule === rule), rule);
  assert.deepEqual(await lintCSS('.ch-card{color:#abc;width:calc(100% - 2px)} @keyframes ch-test{to{opacity:0}}'), []);
});
test('AST ignores comments and catches all, implicit all and layout keyframes', () => {
  const findings = inspectCSS('/* transition: all */ .ch-card{transition:opacity 1s, all 1s} .ch-other{transition:1s} @keyframes ch-bad{from{height:0}to{height:40px}}');
  assert.equal(findings.filter((finding) => finding.rule === 'clubhouse/no-transition-all').length, 2);
  assert.equal(findings.filter((finding) => finding.rule === 'clubhouse/no-layout-motion').length, 2);
  assert.deepEqual(inspectCSS('@keyframes ch-good{from{transform:translateY(4px);opacity:0}to{transform:none;opacity:1}}'), []);
});
test('existing layout variants remain explicit while new layout transitions fail', () => {
  const before = '.ch-pane{transition:grid-template-columns var(--ch-dur-base) var(--ch-ease)}';
  assert.deepEqual(inspectCSS(before, { before }), []);
  assert.equal(inspectCSS(before + '.ch-new{transition:width var(--ch-dur-base)}', { before }).length, 1);
});
test('transition shorthand identifies properties regardless of component order', () => {
  assert.deepEqual(inspectCSS('.ch-card{transition:200ms opacity}'), []);
  assert.deepEqual(inspectCSS('.ch-card{transition:200ms cubic-bezier(.2, 0, .3, 1) opacity -50ms, var(--ch-dur-base) var(--ch-ease) transform}'), []);
  assert.deepEqual(inspectCSS('.ch-card{transition:steps(2, end) 200ms opacity, linear(0, .4 50%, 1) 200ms transform}'), []);
  assert.deepEqual(inspectCSS('.ch-card{transition:calc(200ms + 50ms) opacity}'), []);
  const findings = inspectCSS('.ch-card{transition:200ms width}');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'clubhouse/no-layout-motion');
  const before = '.ch-card{transition:width 200ms}';
  assert.deepEqual(inspectCSS(before, { before }), []);
  assert.equal(inspectCSS('.ch-card{transition:200ms ease}')[0].rule, 'clubhouse/no-transition-all');
  assert.equal(inspectCSS('.ch-card{transition:var(--ch-dur-base) var(--ch-ease)}')[0].rule, 'clubhouse/no-transition-all');
});
test('new outer blur uses tokens; rings and inset material remain independent', () => {
  assert.equal(inspectCSS('.ch-card{box-shadow:0 4px 20px rgb(1 2 3 / .2)}').length, 1);
  assert.deepEqual(inspectCSS('.ch-card{box-shadow:0 0 0 2px var(--ch-border-focus), var(--ch-elevation-reading)} .ch-well{box-shadow:inset 0 2px 3px rgb(1 2 3 / .2)}'), []);
});
test('shadow color order cannot hide an outer blur or invent blur on a ring', () => {
  assert.equal(inspectCSS('.ch-card{box-shadow:#000 2px 0 8px}')[0].rule, 'clubhouse/shadow-token');
  assert.equal(inspectCSS('.ch-card{box-shadow:#0008 2px 0 8px}')[0].rule, 'clubhouse/shadow-token');
  assert.deepEqual(inspectCSS('.ch-card{box-shadow:#000 2px 0 0 1px}'), []);
  assert.deepEqual(inspectCSS('.ch-card{box-shadow:#000000 2px 0 0px 1px}'), []);
  assert.equal(inspectCSS('.ch-card{box-shadow:#000 2px 0 0 1px, #fff 0 0 8px}').length, 1);
});
test('an established shadow is not a reusable blanket exemption', () => {
  const before = '.ch-card{box-shadow:0 4px 20px #111}';
  assert.deepEqual(inspectCSS(before, { before }), []);
  assert.equal(inspectCSS(before + '.ch-new{box-shadow:0 4px 20px #111}', { before }).length, 1);
  assert.equal(inspectCSS('@media(max-width:600px){' + before + '}', { before }).length, 1);
  assert.equal(inspectCSS('.ch-card{box-shadow:0 4px 30px #111}', { before }).length, 1);
});
test('new shadow token references must exist in the Clubhouse styles', () => {
  const tokens = new Set(['--ch-elevation-reading']);
  assert.deepEqual(inspectCSS('.ch-card{box-shadow:var(--ch-elevation-reading)}', { tokens }), []);
  assert.equal(inspectCSS('.ch-card{box-shadow:var(--ch-elevation-typo)}', { tokens }).length, 1);
});
