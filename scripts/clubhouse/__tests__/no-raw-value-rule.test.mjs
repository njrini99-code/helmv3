import { describe, it, after } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from '../../../eslint-rules/clubhouse-no-raw-value.mjs';

// The ESLint rule behind the Clubhouse literal ratchet (dsx-09). Pins what it
// finds and, as much, what it must leave alone: a rule that fires on computed
// values gets switched off.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = after;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const all = [{ reportAll: true }];
const filename = 'src/clubhouse/screens/x/X.tsx';

tester.run('clubhouse-no-raw-value', rule, {
  valid: [
    { filename, options: all, code: `<div style={{ color: 'var(--ch-text-primary)', gap: 0, opacity: 0.5, flex: 1 }} />` },
    { filename, options: all, code: `<div style={{ width: \`\${pct}%\`, height: h, ['--ch-fan-i' as string]: i - 1 }} />` },
    { filename, options: all, code: `<a href="#add" className="ch-row is-on" />` },
    { filename, options: all, code: `<path fill="currentColor" stroke="var(--ch-chart-gain)" />` },
    { filename, options: all, code: `const tone = '#1e6a45'; // data, not paint` },
    // Under its baseline count: quiet.
    { filename, options: [{ baseline: { [filename]: 1 } }], code: `<div style={{ gap: 8 }} />` },
  ],
  invalid: [
    { filename, options: all, code: `<div style={{ background: '#faf7ef' }} />`, errors: [{ messageId: 'colour' }] },
    { filename, options: all, code: `<div style={{ color: 'rgb(28 25 18 / 0.5)', borderColor: 'white' }} />`, errors: [{ messageId: 'colour' }, { messageId: 'colour' }] },
    { filename, options: all, code: `<circle fill="#fff" stroke={'#1f9240'} />`, errors: [{ messageId: 'colour' }, { messageId: 'colour' }] },
    { filename, options: all, code: `<div style={{ gap: 8, fontSize: '13px', zIndex: 40, marginTop: -4 }} />`, errors: 4 },
    { filename, options: all, code: `<div style={{ ['--ch-group-inset' as string]: '16px' }} />`, errors: [{ messageId: 'size' }] },
    { filename, options: all, code: `<div className="text-[13px] p-2" />`, errors: [{ messageId: 'arbitrary' }] },
    { filename, options: all, code: `el.style.color = '#000'; el.style.setProperty('--ch-x', 'rgba(0,0,0,.2)');`, errors: 2 },
    // Over the baseline: every literal in the file is reported.
    { filename, options: [{ baseline: { [filename]: 1 } }], code: `<div style={{ gap: 8, top: 4 }} />`, errors: 2 },
    // Under it: one report asking for the baseline to come down.
    { filename, options: [{ baseline: { [filename]: 3 } }], code: `<div style={{ gap: 8 }} />`, errors: [{ messageId: 'shrink' }] },
    // A file not in the baseline is allowed none.
    { filename, options: [{ baseline: {} }], code: `<div style={{ color: '#123456' }} />`, errors: 1 },
  ],
});
