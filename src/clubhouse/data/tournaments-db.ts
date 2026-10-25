/**
 * The narrowed types for the tournament tables and P-5's RPCs live in src/lib/golf/tournaments/db.ts, so the
 * server actions (outside src/clubhouse) and the Clubhouse loaders share one copy. The migrations are applied and the
 * generated types cover them; the file keeps the unions and jsonb shapes the generated types cannot express.
 */
export * from '@/lib/golf/tournaments/db';
