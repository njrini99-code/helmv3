import type { EvalDb } from './supabase-eval-fake';

/** What the parity test's mocks read: the database both pipelines query, and the team the Fairway page resolves. */
export const parityState: { db: EvalDb | null; teamId: string } = { db: null, teamId: '' };
