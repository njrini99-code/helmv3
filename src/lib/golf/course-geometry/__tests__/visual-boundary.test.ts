import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Meridian §7 code boundary. Canonical (reconstruction) modules describe
 * truth: geometry, elevation, evidence, framing metrics. Visual modules may
 * read them and never mutate them; canonical modules may not depend on the
 * visual layer, on Three, or on React components. ESLint carries the same
 * rule for editors; this test is the merge gate. */
const root = join(__dirname, '..');
const CANONICAL = ['build-scene', 'camera', 'canopy', 'context-layer', 'context-taxonomy', 'describe-position', 'display-outline', 'display-trajectories', 'normalize',
  'project', 'quality', 'reconstruct', 'schema', 'selected-shot-focus', 'shot-camera-target', 'spatial', 'surface-compatibility', 'terrain', 'terrain-residency', 'terrain-source',
  'tracking-scene', 'types'];
const VISUAL = ['three-camera', 'three-flight-path', 'three-renderer', 'shadow-bounds', 'terrain-canopy', 'terrain-material',
  'terrain-viewport', 'shot-overlay-controller', 'shot-overlay-layout', 'runtime-controller', 'camera-motion', 'visual-style', 'visual-artifact', 'render-quality',
  'scene-markers', 'visual-artifact-v2', 'terrain-curvature', 'terrain-sky-field', 'surface-distance-field', 'display-mesh-v2', 'hero-patches', 'green-display-mesh'];
const imports = (file: string) => [...readFileSync(join(root, file), 'utf8').matchAll(/from\s+'([^']+)'/g)].map(match => match[1]!);

describe('Meridian visual code boundary', () => {
  it('classifies every library module as canonical or visual', () => {
    const modules = readdirSync(root).filter(name => name.endsWith('.ts')).map(name => name.slice(0, -3)).sort();
    const known = new Set([...CANONICAL, ...VISUAL]);
    expect(modules.filter(name => !known.has(name))).toEqual([]);
  });
  it('keeps canonical modules free of visual, Three and component imports', () => {
    for (const name of CANONICAL) {
      let file: string;
      try { file = `${name}.ts`; readFileSync(join(root, file)); } catch { continue; }
      for (const specifier of imports(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/^three(\/|$)/);
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/^@\/components\//);
        const local = specifier.startsWith('./') ? specifier.slice(2) : null;
        if (local) expect(VISUAL, `${file} imports visual module ${local}`).not.toContain(local);
      }
    }
  });
  it('lets visual modules read canonical truth without a mutation API', () => {
    // Visual modules never receive a setter for canonical geometry: the
    // package and mesh types expose no mutating function, and no visual
    // module writes into mesh.vertices, feature rings, or evidence.
    for (const name of VISUAL) {
      let source: string;
      try { source = readFileSync(join(root, `${name}.ts`), 'utf8'); } catch { continue; }
      expect(source, `${name} writes canonical vertices`).not.toMatch(/mesh\.vertices\s*(\[[^\]]*\]\s*=|\.(push|splice|fill|set)\()/);
      expect(source, `${name} writes canonical rings`).not.toMatch(/\.parts\s*(\[[^\]]*\]\s*=|\.(push|splice)\()/);
      expect(source, `${name} writes evidence`).not.toMatch(/\.evidence\s*=|\.anchorM\s*=/);
    }
  });
});
