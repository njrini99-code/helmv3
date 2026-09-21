import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), scene: vi.fn() }));
vi.mock('../../../../../scripts/golf/course-geometry/factory-lab/loader', () => ({ loadFactoryHole: mocks.load }));
vi.mock('@/components/golf/course-geometry/CourseHoleScene', () => ({
  CourseHoleScene: ({ scene }: { scene: { key: string } }) => <div data-testid="scene">{scene.key}</div>,
}));
vi.mock('@/lib/golf/course-geometry/build-scene', () => ({ buildHoleScene: mocks.scene }));
vi.mock('@/lib/golf/course-geometry/terrain', () => ({ fitTerrainCamera: () => ({}), TERRAIN_PRESETS: { terrain: {}, top: {}, side: {} } }));

function response(key: string) {
  const holes = ['example-07', 'example-08'].map((id, index) => ({ key: id, ordinal: index + 7 }));
  return { manifest: { holes, admission: { report: null } }, pkg: { name: 'Example', contentHash: 'package' },
    mesh: { physicalHoleKey: key, contentHash: `mesh-${key}` }, context: null, hole: { key, glb: null }, assetBase: '/unused/' };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('factory lab controls', () => {
  it('waits for the selected hole response instead of rendering its predecessor mesh', async () => {
    history.replaceState(null, '', '/?layout=example&bundle=bundle&hole=example-07');
    const pending = new Map<string, (value: ReturnType<typeof response>) => void>();
    mocks.load.mockImplementation((_layout: string, _bundle: string, key: string) => new Promise(resolve => pending.set(key, resolve)));
    mocks.scene.mockImplementation((_pkg: unknown, key: string, _shots: unknown, mesh: { physicalHoleKey: string }) => {
      if (key !== mesh.physicalHoleKey) throw new Error('Terrain geometry version mismatch');
      return { key, attribution: 'source retained' };
    });
    const { FactoryLab } = await import('../../../../../scripts/golf/course-geometry/factory-lab/main');
    render(<FactoryLab />);
    await act(async () => { pending.get('example-07')!(response('example-07')); });
    expect(screen.getByTestId('scene')).toHaveTextContent('example-07');

    fireEvent.change(screen.getByRole('combobox', { name: 'Physical hole' }), { target: { value: 'example-08' } });
    expect(screen.getByRole('status')).toHaveTextContent('Loading immutable');
    expect(screen.queryByTestId('scene')).toBeNull();
    expect(mocks.scene.mock.calls.every(call => call[1] === call[3].physicalHoleKey)).toBe(true);

    await act(async () => { pending.get('example-08')!(response('example-08')); });
    expect(screen.getByTestId('scene')).toHaveTextContent('example-08');
    expect(document.querySelector('main')?.dataset.meshHash).toBe('mesh-example-08');
    fireEvent.click(screen.getByRole('button', { name: 'top' }));
    expect(screen.getByRole('button', { name: 'top' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('scene')).toHaveTextContent('example-08');
  });
});
