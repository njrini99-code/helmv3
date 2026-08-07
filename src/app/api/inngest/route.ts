import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Inngest Next.js handler — serves the function registry at
 * /api/inngest. The Inngest cloud (or local Dev Server) discovers
 * functions by hitting this endpoint on PUT.
 *
 * Local dev:
 *   1. Start the app: `npm run dev`
 *   2. In another terminal: `npx inngest-cli@latest dev`
 *      (auto-discovers http://localhost:3000/api/inngest)
 *   3. Open the Dev Server UI at http://localhost:8288
 *
 * Production:
 *   1. Sign up at https://app.inngest.com (free tier: 50K step runs/mo)
 *   2. Create an app, copy INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
 *   3. Add to Vercel env (Preview + Production)
 *   4. Deploy — Inngest auto-syncs functions from the production URL.
 */
const handlers = serve({
  client: inngest,
  functions,
});

/**
 * An UNSIGNED request to this endpoint is not an application error.
 *
 * This route is a public URL. Anything that touches it without an Inngest
 * signature — a port scanner, an uptime check, a crawler, a developer with
 * curl — made the SDK throw, which produced THREE Sentry groups per request:
 *
 *     Signature validation failed
 *     Error: No x-inngest-signature provided   (or "Error: Invalid signature")
 *     [object Object]                          with the body "MESSAGE LOST"
 *
 * The third is unreadable because the SDK reports a bare `{ method: 'GET' }`
 * object and `String({ method: 'GET' })` is `[object Object]`. So three
 * entries sat at the top of the Helm Bridge incident queue, none naming a
 * cause, all showing "0 users" — because there is no user; it is a robot.
 *
 * PROVEN, not inferred: a single unauthenticated `curl` of this endpoint on
 * 2026-08-07 at 14:03:10Z reproduced all three groups exactly. That also
 * explains the bursts on every deploy (a deploy invites a fresh round of
 * probes) and the 2026-08-06 20:42 start, when the route first went live.
 *
 * The correct response to an unsigned request is a quiet 401, which is what
 * the SDK already returns — the defect was only that it also reported it as a
 * crash. Unsigned requests are now answered without touching the error
 * pipeline.
 *
 * A request that DOES carry a signature which then fails is a different thing:
 * that would mean INNGEST_SIGNING_KEY no longer matches the Inngest app, which
 * is a real misconfiguration that silently degrades durable jobs (round
 * analysis falls back to the non-durable inline path — see isInngestConfigured
 * in lib/inngest/client.ts). That case is still reported, once, with the fix
 * spelled out. Nothing real is being suppressed here.
 */
type InngestHandler = (typeof handlers)['GET'];

function quietUnsignedProbes(handler: InngestHandler, method: string): InngestHandler {
  return (async (...args: Parameters<InngestHandler>) => {
    const req = args[0] as Request | undefined;
    const signed = Boolean(req?.headers?.get?.('x-inngest-signature'));

    // SHORT-CIRCUIT before the SDK runs. Wrapping the handler in try/catch was
    // not enough and I verified that against production: the SDK CATCHES its
    // own signature failure, reports it, and returns 401 itself — it never
    // throws, so an outer catch never sees it and the three Sentry groups kept
    // firing. The only place to stop it is before delegating.
    //
    // The response is byte-identical to what the SDK already returned for an
    // unsigned request (401 + {"message":"Unauthorized"}), so nothing about
    // Inngest's own behaviour changes — real traffic from Inngest Cloud always
    // carries x-inngest-signature and still reaches the SDK untouched.
    if (!signed) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    try {
      const response = (await (handler as (...a: unknown[]) => Promise<Response>)(...args)) as Response;

      // Signature present but rejected → a genuine key mismatch. Say so once,
      // in terms that name the fix.
      if (response?.status === 401 && signed) {
        await logServerError(
          '[inngest] A SIGNED request failed signature validation — INNGEST_SIGNING_KEY no longer matches the ' +
            'Inngest app. Durable jobs are degraded: round analysis runs inline with no retry or crash recovery. ' +
            'Fix: reissue the signing key in the Inngest dashboard, set it in Vercel production, and redeploy ' +
            '(Vercel bakes env vars at build time, so a dashboard change alone has no effect).',
          { action: 'inngest.signatureValidation', featureArea: 'integrations' },
        );
      }

      return response;
    } catch (error) {
      // Only reachable for a SIGNED request now — unsigned ones returned above
      // without ever entering the SDK. A signed request that still throws is
      // real, and is named here rather than left as "[object Object]".
      await logServerError(
        `[inngest] ${method} handler threw on a signed request: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
        { action: 'inngest.handler', featureArea: 'integrations' },
      );
      throw error;
    }
  }) as InngestHandler;
}

const GET = quietUnsignedProbes(handlers.GET, 'GET');
const POST = quietUnsignedProbes(handlers.POST, 'POST');
const PUT = quietUnsignedProbes(handlers.PUT, 'PUT');

export { GET, POST, PUT };
