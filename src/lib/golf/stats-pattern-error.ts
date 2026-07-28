export function isMissingGolfPatternsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  if (code === '42P01') return true;
  return code === 'PGRST205' && /golf_patterns_v2/i.test(message);
}
