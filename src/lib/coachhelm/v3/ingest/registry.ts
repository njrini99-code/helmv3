import arccos from './providers/arccos';
import garmin from './providers/garmin';
import trackman from './providers/trackman';
import type { IngestAdapter, IngestProvider } from './types';

const REGISTRY: Record<IngestProvider, IngestAdapter> = {
  arccos,
  garmin,
  trackman,
};

export function getAdapter(provider: IngestProvider): IngestAdapter {
  return REGISTRY[provider];
}

export const ALL_ADAPTERS: readonly IngestAdapter[] = Object.values(REGISTRY);
