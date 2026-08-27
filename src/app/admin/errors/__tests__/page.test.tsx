// =============================================================================
// /admin/errors — Archive wiring
//
// This page's data-fetching body (`Body`) is an async Server Component
// embedded via `<Suspense>`. React 19 only supports async components on the
// server, so this repo's Vitest/jsdom setup cannot resolve it in a plain
// client render — it suspends on the skeleton forever (verified directly
// against the sibling fingerprint-detail page: React logs "Only Server
// Components can be async at the moment" and the fallback never swaps in).
// A full-page render test would therefore only prove the shell mounted,
// never that the archive wiring below actually ran.
//
// So this suite tests `loadErrorsPageData` directly — the pure async
// function `Body` calls, extracted specifically so the wiring ("fetch the
// triage tab and the resolution archive together, hand both through") is
// verifiable without rendering anything. ArchivePanel's own suite covers
// what it does with the result once mounted.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ResolutionArchiveSnapshot } from '@/lib/admin/data/resolutions';
import type { ErrorsTabFilters } from '@/lib/admin/data/errors';

const fetchErrorsTab = vi.fn();
vi.mock('@/lib/admin/data/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/data/errors')>();
  return {
    ...actual,
    fetchErrorsTab: (...args: unknown[]) => fetchErrorsTab(...args),
  };
});

const fetchResolutionArchive = vi.fn();
vi.mock('@/lib/admin/data/resolutions', () => ({
  fetchResolutionArchive: (...args: unknown[]) => fetchResolutionArchive(...args),
}));

import { loadErrorsPageData } from '../_data';

function archiveOk(): AdminFetchResult<ResolutionArchiveSnapshot> {
  return {
    status: 'ok',
    fetchedAt: '2026-08-27T00:00:00.000Z',
    data: { resolutions: [], evaluated: 0, confirmedTotal: 0 },
  };
}

const filters: ErrorsTabFilters = { windowHours: 24 };

beforeEach(() => {
  fetchErrorsTab.mockReset();
  fetchResolutionArchive.mockReset();
});

describe('loadErrorsPageData', () => {
  it('fetches the triage tab and the resolution archive together, and returns both', async () => {
    const tab = { incidents: [], counts: { totalGroups: 0 } } as never;
    const archive = archiveOk();
    fetchErrorsTab.mockResolvedValue(tab);
    fetchResolutionArchive.mockResolvedValue(archive);

    const result = await loadErrorsPageData(filters);

    expect(fetchErrorsTab).toHaveBeenCalledWith(filters);
    expect(fetchResolutionArchive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ tab, archiveResult: archive });
  });

  it('passes a FAILED archive read straight through, rather than swallowing it', async () => {
    const failed: AdminFetchResult<ResolutionArchiveSnapshot> = {
      status: 'error',
      data: null,
      fetchedAt: null,
      error: 'could not read admin_error_resolutions',
    };
    fetchErrorsTab.mockResolvedValue({ incidents: [] } as never);
    fetchResolutionArchive.mockResolvedValue(failed);

    const { archiveResult } = await loadErrorsPageData(filters);

    expect(archiveResult).toEqual(failed);
  });

  it('does not let one fetcher wait on the other — both are invoked before either resolves', async () => {
    let errorsResolved = false;
    let archiveStartedBeforeErrorsResolved = false;

    fetchErrorsTab.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            errorsResolved = true;
            resolve({ incidents: [] });
          }, 10);
        }),
    );
    fetchResolutionArchive.mockImplementation(() => {
      archiveStartedBeforeErrorsResolved = !errorsResolved;
      return Promise.resolve(archiveOk());
    });

    await loadErrorsPageData(filters);

    expect(archiveStartedBeforeErrorsResolved).toBe(true);
  });
});
