import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * A state updater runs later than the handler that queued it. If it reads `e.target.value` it can see the box after React
 * has put the controlled value back (hydration, a deferred render), and the typed text is lost: the Settings name that
 * never saved on WebKit. The repo's own ESLint config bans the read; this pins the ban with the shapes that shipped.
 */
const lint = async (source: string) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(source, { filePath: 'src/clubhouse/screens/settings/Probe.tsx' });
  return result!.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
};

const wrap = (jsx: string) => `export function Probe({ f, setV }: any) { return (${jsx}); }\n`;

describe('Clubhouse bans reading the event inside a state updater', () => {
  it.each([
    ['the Settings name field', `<input onChange={(e) => f.setDraft((d: any) => ({ ...d, firstName: e.target.value }))} />`],
    ['a curried setter', `<input onChange={((k: string) => (e: any) => setV((cur: any) => ({ ...cur, [k]: e.target.value })))('a')} />`],
    ['currentTarget', `<input onChange={(e) => setV((cur: any) => ({ ...cur, a: e.currentTarget.value }))} />`],
    ['a derived value', `<input onChange={(e) => setV((cur: any) => ({ ...cur, a: e.target.value.toUpperCase() }))} />`],
  ])('flags %s', async (_name, jsx) => {
    expect((await lint(wrap(jsx))).length).toBeGreaterThan(0);
  });

  it.each([
    ['reading first, then setting', `<input onChange={(e) => { const value = e.target.value; f.setDraft((d: any) => ({ ...d, firstName: value })); }} />`],
    ['passing the value directly', `<input onChange={(e) => setV(e.target.value)} />`],
    ['an updater that does not touch the event', `<button onClick={() => setV((n: number) => n + 1)} />`],
  ])('allows %s', async (_name, jsx) => {
    expect(await lint(wrap(jsx))).toEqual([]);
  });
});
