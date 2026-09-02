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
/**
 * The canonical production domain is deliberately code-owned.
 *
 * `INNGEST_SERVE_ORIGIN` otherwise overrides the URL registered with Inngest.
 * A stale preview/deployment URL there makes Inngest call an old deployment,
 * whose credentials can legitimately differ from the live app. That produces
 * the misleading loop of rotating valid keys while signature validation keeps
 * failing. Preview and local environments retain normal request-based origin
 * discovery.
 */
const productionServeOrigin =
  process.env.VERCEL_ENV === 'production' ? 'https://helmsportslabs.com' : undefined;

const handlers = serve({
  client: inngest,
  functions,
  ...(productionServeOrigin ? { serveOrigin: productionServeOrigin } : {}),
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

      // Signature present but rejected. The SDK gives back a bare 401 with no
      // reason, and it rejects for two very different causes: the signature is
      // older than five minutes (clock skew), or the HMAC doesn't match (wrong
      // key). Guessing between them is how an operator gets sent to reissue a
      // key that was never the problem — so measure the one we CAN measure.
      // The `t=` half of the header is a plain unix timestamp and needs no
      // secret to read, and five minutes is the SDK's own tolerance
      // (RequestSignature.hasExpired in inngest@4).
      if (response?.status === 401 && signed) {
        const sigHeader = req?.headers?.get?.('x-inngest-signature') ?? '';
        const stamped = Number.parseInt(new URLSearchParams(sigHeader).get('t') ?? '', 10);
        const skewSeconds = Number.isFinite(stamped)
          ? Math.round(Math.abs(Date.now() - stamped * 1000) / 1000)
          : null;
        const expired = skewSeconds !== null && skewSeconds > 300;

        // `skewSeconds` is DELIBERATELY not interpolated into either message.
        // admin_events fingerprints hash the first 80 characters of the
        // message, and `(signature was ${skewSeconds}s old` sits at roughly
        // character 70 — so a one-digit measurement landed inside the hashed
        // prefix and split one continuous outage into five incidents. Measured
        // on production 2026-08-27: 450 of the 751 error events in 30 days were
        // this single fault wearing 5 fingerprints, purely because the elapsed
        // seconds read 0, 1, 2, 3 or 4. The normaliser cannot save this — it
        // collapses UUIDs, long hex and integers of 5+ digits, and a 1-digit
        // number is none of those.
        //
        // Same lesson already written down for Cloudflare Ray IDs in
        // describe-error.ts: a message that is fingerprinted must be STABLE
        // across occurrences. The number is still reported, on `errorHint`
        // (rendered by the Bridge's Forensics panel) and `extra` — neither of
        // which is hashed — so nothing is lost from triage.
        await logServerError(
          expired
            ? '[inngest] A SIGNED request was rejected because its signature was past the ' +
              "SDK's 5-minute tolerance. This is a clock/latency problem, NOT a bad key — do not reissue " +
              'INNGEST_SIGNING_KEY on the strength of this line.'
            : '[inngest] A SIGNED request failed signature validation' +
              ' — the INNGEST_SIGNING_KEY in Vercel Production does not match the Inngest app that is calling us. ' +
              'Corroborating evidence, not inference: these land within seconds of every production deploy, which ' +
              'is Inngest Cloud re-syncing; and INNGEST_EVENT_KEY from the same pair is rejected too — every round ' +
              'submitted since 2026-07-30 logged "Inngest API Error: 404 Event key not found". Both values are ' +
              'well-formed (signkey-prod-<64 hex> and an 86-char event key, no padding, not swapped), so they are ' +
              'not mistyped: they belong to an Inngest app or environment that no longer recognises them. ' +
              'Fix: open the Inngest app that syncs this deployment, copy its CURRENT event + signing keys into ' +
              'Vercel Production — or delete the manual overrides and let the Inngest↔Vercel integration manage ' +
              'them — then redeploy, because Vercel bakes env vars in at build time. ' +
              'Until then durable jobs are degraded: round analysis runs inline, with no retry and no crash recovery.',
          {
            action: 'inngest.signatureValidation',
            featureArea: 'integrations',
            // A credential that IS present and IS being rejected — the exact
            // definition of provider-fault kind `invalid_credential`. Setting
            // it explicitly rather than leaving it to provider-fault.ts's
            // pattern match, which near-misses this text: its rule reads
            // /signature verification failed/ and this route says "failed
            // signature validation". That one-word gap is why all 450 of these
            // rows carry NO errorCode today while the client-side send path's
            // 12 rows are correctly tagged `provider_inngest_invalid_credential`
            // — same root cause, two different groups, one of them invisible to
            // the Jobs panel, which detects Inngest rejection with
            // `metadata->>errorCode LIKE 'provider_inngest_%'`.
            //
            // buildIncidentSignature() gives any `provider_`-prefixed code its
            // own branch, hashing `provider::<code>` alone — so this also folds
            // the route's failures in with the send path's across call site,
            // route, wording and severity. One upstream fault, one incident.
            //
            // The EXPIRED branch deliberately gets no provider code: a
            // signature past the 5-minute tolerance is a clock/latency problem
            // on our side, not the provider rejecting a credential. Tagging it
            // `invalid_credential` would tell an operator to reissue keys — the
            // exact advice its own message warns against.
            ...(expired ? {} : { errorCode: 'provider_inngest_invalid_credential' }),
            ...(skewSeconds === null ? {} : { errorHint: `signature was ${skewSeconds}s old when checked` }),
            extra: { skewSeconds, expired },
          },
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
