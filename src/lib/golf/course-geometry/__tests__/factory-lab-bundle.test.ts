import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadBundle, loadBundleObject, readConfined } from '../../../../../scripts/golf/course-geometry/factory-lab/server';

const roots: string[] = [];
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  // macOS /var is a symlink: the configured root is deliberately canonical.
  const { realpath } = await import('node:fs/promises');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'golf-bundle-'))); roots.push(root);
  const objectBytes = Buffer.from('{"retained":true}'); const objectHash = hash(objectBytes);
  await mkdir(join(root, 'lab', 'objects'), { recursive: true });
  await mkdir(join(root, 'lab', 'bundles', 'example'), { recursive: true });
  await writeFile(join(root, 'lab', 'objects', objectHash), objectBytes);
  const ref = { sha256: objectHash, bytes: objectBytes.length, mediaType: 'application/json', sourceRelativePath: 'layouts/example/package/normalized.json' };
  const doc = { schema: 'golfhelm-factory-lab-bundle-v1', layoutId: 'example', packageHash: 'a'.repeat(64), purpose: 'local-review-only', measurementAuthority: false,
    package: ref, context: null, admission: { status: 'unassessed', version: null, report: null },
    holes: [{ key: 'physical-one', ordinal: 1, terrain: ref, meshHash: 'b'.repeat(64), decodedSha256: 'c'.repeat(64), decodedBytes: 100, glb: null, physicalWorldHash: null, truthGatePassed: false }] };
  const bytes = JSON.stringify(doc); const bundleHash = hash(bytes);
  await writeFile(join(root, 'lab', 'bundles', 'example', `${bundleHash}.json`), bytes);
  return { root, objectHash, bundleHash, objectBytes, doc };
}
describe('immutable local factory bundles', () => {
  it('serves only a hash-valid object belonging to the explicitly selected bundle', async () => {
    const f = await fixture();
    expect((await loadBundle(f.root, 'example', f.bundleHash)).manifest.packageHash).toBe('a'.repeat(64));
    expect((await loadBundleObject(f.root, 'example', f.bundleHash, f.objectHash)).bytes).toEqual(f.objectBytes);
    await expect(loadBundleObject(f.root, 'example', f.bundleHash, 'e'.repeat(64))).rejects.toThrow('not a member');
    await expect(loadBundle(f.root, 'unknown', f.bundleHash)).rejects.toThrow();
  });
  it('refuses traversal and symlink escapes or aliases, including parent directories', async () => {
    const f = await fixture();
    await expect(readConfined(f.root, ['..', 'other'])).rejects.toThrow('Invalid asset path');
    await expect(loadBundle(f.root, '../example', f.bundleHash)).rejects.toThrow('Explicit layout');
    const target = join(f.root, 'lab', 'objects', f.objectHash); const saved = join(f.root, 'saved');
    await writeFile(saved, f.objectBytes); await rm(target); await symlink(saved, target);
    await expect(loadBundleObject(f.root, 'example', f.bundleHash, f.objectHash)).rejects.toThrow('Symlink');
    await rm(join(f.root, 'lab', 'objects'), { recursive: true });
    await mkdir(join(f.root, 'aliased')); await writeFile(join(f.root, 'aliased', f.objectHash), f.objectBytes);
    await symlink(join(f.root, 'aliased'), join(f.root, 'lab', 'objects'));
    await expect(loadBundleObject(f.root, 'example', f.bundleHash, f.objectHash)).rejects.toThrow('Symlink');
  });
  it('detects changed manifest bytes and object bytes instead of loading latest', async () => {
    const f = await fixture();
    await writeFile(join(f.root, 'lab', 'objects', f.objectHash), Buffer.from('{"retained":nope}'));
    await expect(loadBundleObject(f.root, 'example', f.bundleHash, f.objectHash)).rejects.toThrow('integrity mismatch');
    const manifest = join(f.root, 'lab', 'bundles', 'example', `${f.bundleHash}.json`);
    await writeFile(manifest, (await readFile(manifest, 'utf8')).replace('example', 'changed'));
    await expect(loadBundle(f.root, 'example', f.bundleHash)).rejects.toThrow('manifest hash mismatch');
  });
  it('refuses malformed admission or measurement authority even with a matching manifest hash', async () => {
    const f = await fixture();
    const bytes = JSON.stringify({ ...f.doc, measurementAuthority: true }); const wrong = hash(bytes);
    await writeFile(join(f.root, 'lab', 'bundles', 'example', `${wrong}.json`), bytes);
    await expect(loadBundle(f.root, 'example', wrong)).rejects.toThrow('Unsupported');
  });
});
