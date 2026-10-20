import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'golf_appearance_preferences';
const saved = { display_density: 'compact', date_format: 'YYYY-MM-DD', show_animations: false, score_display: 'raw' };

describe('appearance preference subscriptions', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounting another consumer does not rerender an existing consumer with unchanged saved preferences', async () => {
    localStorage.setItem(key, JSON.stringify(saved));
    const { useAppearancePreferences } = await import('../use-appearance-preferences');
    let renders = 0;
    const first = renderHook(() => { renders++; return useAppearancePreferences(); });
    expect(first.result.current.showAnimations).toBe(false);
    const settled = renders;
    renderHook(() => useAppearancePreferences());
    expect(renders).toBe(settled);
  });

  it('unchanged storage events do not rerender consumers', async () => {
    localStorage.setItem(key, JSON.stringify(saved));
    const { useAppearancePreferences } = await import('../use-appearance-preferences');
    let renders = 0;
    renderHook(() => { renders++; return useAppearancePreferences(); });
    const settled = renders;
    act(() => window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage })));
    expect(renders).toBe(settled);
  });

  it('propagates changes from another tab and clearing storage', async () => {
    localStorage.setItem(key, JSON.stringify(saved));
    const { useAppearancePreferences } = await import('../use-appearance-preferences');
    const hook = renderHook(() => useAppearancePreferences());
    act(() => {
      localStorage.setItem(key, JSON.stringify({ ...saved, date_format: 'DD/MM/YYYY' }));
      window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
    });
    expect(hook.result.current.dateFormat).toBe('DD/MM/YYYY');
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(hook.result.current.dateFormat).toBe('MM/DD/YYYY');
    expect(hook.result.current.showAnimations).toBe(true);
  });

  it('updates existing consumers in the same tab', async () => {
    const { useAppearancePreferences } = await import('../use-appearance-preferences');
    const first = renderHook(() => useAppearancePreferences());
    const second = renderHook(() => useAppearancePreferences());
    act(() => first.result.current.updatePreferences({ showAnimations: false }));
    expect(second.result.current.showAnimations).toBe(false);
    expect(JSON.parse(localStorage.getItem(key)!).show_animations).toBe(false);
  });
});
