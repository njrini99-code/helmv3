import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/server';
import type { VerifyResult } from '@/lib/auth/verify-player-access';

export type StatsSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface StatsActionContext {
  supabase: StatsSupabaseClient;
  user: User;
  requestedPlayerId: string;
  authorization: VerifyResult & { allowed: true };
}

const statsActionContext = new AsyncLocalStorage<StatsActionContext>();

export function getStatsActionContext(): StatsActionContext | undefined {
  return statsActionContext.getStore();
}

export function runWithStatsActionContext<T>(
  context: StatsActionContext,
  operation: () => Promise<T>,
): Promise<T> {
  return statsActionContext.run(context, operation);
}
