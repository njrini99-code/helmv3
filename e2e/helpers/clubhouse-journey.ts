/**
 * Shared steps for the Clubhouse write journeys (e2e/clubhouse-journeys.spec.ts), LOCAL Supabase only, like the seed they
 * run on (clubhouse-local-seed.ts): signing a seeded user in, reading what a journey wrote straight from the local database,
 * and proving that removing the seed also removed every row the journeys made through the app.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PgClient } from './pg-client';
import { localDbUrl, tablesWith, type SeededTeam } from './clubhouse-local-seed';

/**
 * Signs a seeded user in through the GolfHelm sign-in form and lands on the dashboard. A first sign-in shows the welcome
 * greeting, which waits for Continue. A dev server compiles each route on its first request, hence the long timeouts.
 */
export async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto('/golf/login', { timeout: 180_000 });
  // Already signed in (a retried warm-up): the login page sends the user on.
  if (new URL(page.url()).pathname.startsWith('/golf/login')) {
    await page.locator('#golf-signin-email').fill(who.email);
    await page.locator('#golf-signin-password').fill(who.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await page.waitForURL((u) => /^\/golf\/(welcome|dashboard)(\/|$)/.test(u.pathname), { timeout: 120_000 });
  if (new URL(page.url()).pathname.startsWith('/golf/welcome')) {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/golf/dashboard'), { timeout: 120_000 });
  }
}

/**
 * Compiles, before the first test, every route a run visits. `next dev` compiles a route on its first request, and each compile
 * sends a hot update that can reload a page still open in the browser in the middle of a step; with HELM_DEV_KEEP_ROUTES=1 on
 * the server (next.config.mjs) nothing is compiled again afterwards. Each visit is retried while a reload interrupts it. Against
 * a server that has compiled them already, it is a few quick page loads.
 */
export async function warmRoutes(browser: Browser, who: { email: string; password: string }, paths: string[]): Promise<void> {
  const use = test.info().project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, timezoneId: use.timezoneId, locale: use.locale });
  const page = await context.newPage();
  try {
    await expect(async () => signIn(page, who)).toPass({ timeout: 10 * 60_000 });
    for (const path of paths) {
      await expect(async () => {
        await page.goto(path, { timeout: 240_000 });
        await expect(page.locator('.ch-root')).toBeVisible({ timeout: 120_000 });
      }).toPass({ timeout: 10 * 60_000 });
    }
  } finally {
    await context.close();
  }
}

/** One query against the local database (refuses anything that is not local). */
export async function sql<Row = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<Row[]> {
  const db = new PgClient({ connectionString: localDbUrl() });
  try {
    return (await db.query<Row>(text, params)).rows;
  } finally {
    await db.end();
  }
}

/** Today's date in the seeded team's timezone (America/New_York), as the app computes it. */
export function teamToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Rows the journeys made through the app on a seeded team, by the columns other tables refer to them with. */
export type JourneyRows = Array<{ table: string; column: string; ids: string[] }>;

export async function journeyRows(team: SeededTeam): Promise<JourneyRows> {
  const ids = async (text: string, params: unknown[]) => (await sql<{ id: string }>(text, params)).map((r) => r.id);
  return [
    { table: 'golf_events', column: 'event_id', ids: await ids('select id from golf_events where team_id = $1 and not (id = any($2::uuid[]))', [team.teamId, team.eventIds]) },
    { table: 'golf_announcements', column: 'announcement_id', ids: await ids('select id from golf_announcements where team_id = $1', [team.teamId]) },
    {
      table: 'golf_conversations',
      column: 'conversation_id',
      ids: await ids('select id from golf_conversations where team_id = $1 and id <> $2', [team.teamId, team.conversationId]),
    },
    {
      table: 'golf_messages',
      column: 'message_id',
      ids: await ids('select id from golf_messages where conversation_id in (select id from golf_conversations where team_id = $1)', [team.teamId]),
    },
  ];
}

/** Throws when any of these rows, or anything that refers to them, is still in the local database. */
export async function assertGone(rows: JourneyRows): Promise<void> {
  const db = new PgClient({ connectionString: localDbUrl() });
  try {
    const left: string[] = [];
    for (const { table, column, ids } of rows) {
      if (!ids.length) continue;
      const own = (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [ids])).rows[0]!.n;
      if (own) left.push(`${table}.id=${own}`);
      for (const t of await tablesWith(db, column)) {
        const n = (await db.query<{ n: number }>(`select count(*)::int as n from public."${t}" where "${column}" = any($1::uuid[])`, [ids])).rows[0]!.n;
        if (n) left.push(`${t}.${column}=${n}`);
      }
    }
    expect(left, 'rows the journeys made are still in the local database after the seed was removed').toEqual([]);
  } finally {
    await db.end();
  }
}
