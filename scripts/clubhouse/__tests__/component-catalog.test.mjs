import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCatalog } from '../component-catalog.mjs';

test('catalog separates source inventory from gallery examples and ignores comment class hints', () => {
  const root = mkdtempSync(join(tmpdir(), 'clubhouse-catalog-'));
  const write = (path, text) => { const target = join(root, path); mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, text); };
  try {
    write('src/clubhouse/ui/Example.tsx', `// ch-comment belongs to another module
export function Example(){return <div className="ch-real"/>}
export const Provider = () => null;`);
    write('src/clubhouse/ui/__tests__/ignored.tsx', 'export function Ignored(){return null}');
    write('src/clubhouse/preview/ComponentGallery.tsx', `import { Example } from '../ui/Example'; export function Gallery(){return <Example/>}`);
    write('src/clubhouse/styles/real.css', '.ch-real {color:red} @media(max-width:820px){[data-ui="clubhouse"]{--ch-tone:blue}}');
    write('src/clubhouse/styles/comment.css', '.ch-comment {color:blue}');
    write('src/app/clubhouse-preview/[screen]/page.tsx', `  const screens: Record<string, unknown> = {\n    home: { fixture: true },\n    'home-player': { fixture: true },\n  };\n  const viewer = {};`);
    const catalog = buildCatalog(root);
    assert.equal(catalog.components.length, 2);
    const example = catalog.components.find(component => component.file.endsWith('/Example.tsx'));
    assert.deepEqual(example.exports, ['Example', 'Provider']);
    assert.deepEqual(example.examples, ['Example']);
    assert.deepEqual(example.styles, ['src/clubhouse/styles/real.css']);
    assert.deepEqual(catalog.previews.slice(0, 2).map(preview => preview.name), ['home', 'home-player']);
    const token = catalog.styles.find(style => style.file.endsWith('/real.css')).tokens[0];
    assert.match(token.scope, /@media.*820px.*data-ui/);
    assert.equal(token.line, 1);
    assert.deepEqual(buildCatalog(root), catalog);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
