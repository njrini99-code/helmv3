// =============================================================================
// src/lib/baseball/import-source-enabled.ts
//
// Shared helpers for the per-team import-source registry (baseball_import_sources).
// Unregistered adapter keys remain available; a registered row with enabled=false
// is blocked from preview/commit and hidden from the import picker merge.
// =============================================================================

import type { BaseballImportSourceConfig } from '@/lib/types/baseball-settings';

/**
 * Thrown when a coach attempts preview/commit against a disabled registry row.
 * Re-raised by withBaseballAction so callers see a stable, user-safe message.
 */
export class BaseballDisabledSourceError extends Error {
  readonly status = 403;
  constructor(message = 'This import source is disabled for your program.') {
    super(message);
    this.name = 'BaseballDisabledSourceError';
  }
}

export type ImportSourceRegistration = Pick<
  BaseballImportSourceConfig,
  'source_name' | 'enabled'
>;

/**
 * Unregistered sources (null/undefined) use adapter defaults and stay available.
 */
export function isImportSourceEnabled(
  registration: ImportSourceRegistration | null | undefined,
): boolean {
  if (!registration) return true;
  return registration.enabled !== false;
}

/**
 * Throws BaseballDisabledSourceError when the team's registry row is disabled.
 */
export function assertImportSourceEnabled(
  registration: ImportSourceRegistration | null | undefined,
  sourceKey: string,
): void {
  if (isImportSourceEnabled(registration)) return;
  const label = registration?.source_name?.trim() || sourceKey;
  throw new BaseballDisabledSourceError(
    `"${label}" is disabled. Re-enable it in Program Settings → Import Sources.`,
  );
}

type ImportSourceLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        or: (filter: string) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
};

/** Load the team's registry row for a source key, if any. */
export async function loadImportSourceRegistration(
  db: ImportSourceLookupClient,
  teamId: string,
  sourceKey: string,
): Promise<ImportSourceRegistration | null> {
  const { data } = await db
    .from('baseball_import_sources')
    .select('source_name, enabled')
    .eq('team_id', teamId)
    .or(`source_type.eq.${sourceKey},source_name.eq.${sourceKey}`);

  const rows = (data ?? []) as ImportSourceRegistration[];
  if (rows.length === 0) return null;

  // If any matching row is disabled, treat the source as disabled (#407).
  const disabled = rows.find((row) => row.enabled === false);
  return disabled ?? rows[0] ?? null;
}

/** Block preview/commit when the registry row exists and is disabled. */
export async function assertImportSourceAllowed(
  db: ImportSourceLookupClient,
  teamId: string,
  sourceKey: string,
): Promise<void> {
  const registration = await loadImportSourceRegistration(db, teamId, sourceKey);
  assertImportSourceEnabled(registration, sourceKey);
}
