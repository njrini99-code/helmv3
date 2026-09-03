import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { initEdgeSentry, captureEdgeException } from "../_shared/sentry.ts";

initEdgeSentry("send-apns-push");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushRequest {
  deviceToken: string;
  platform: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * Absolute unread count to paint on the app icon. Omit to leave the badge
   * untouched; pass 0 to clear it. (Previously defaulted to 1, which pinned
   * every user's badge to "1" no matter how many unread items they had.)
   */
  badge?: number;
  /** Optional subtitle — iOS renders it between title and body. */
  subtitle?: string;
  /**
   * Registered category id. Drives the actionable buttons the user gets on a
   * long-press / pull-down. Must match a category registered on the client.
   */
  category?: string;
  /**
   * Groups related notifications into one stack in Notification Center.
   * Use a stable per-conversation / per-team id (e.g. `team:<id>`).
   */
  threadId?: string;
  /**
   * iOS 15+ delivery treatment. `time-sensitive` breaks through Focus modes
   * and requires the Time Sensitive Notifications entitlement; `passive`
   * delivers silently to the list without waking the screen.
   */
  interruptionLevel?: "passive" | "active" | "time-sensitive";
  /** 0..1 — orders this notification within its summary group. */
  relevanceScore?: number;
  /**
   * APNs coalescing id. A later push with the same collapseId REPLACES an
   * undelivered earlier one instead of stacking — right for "3 new messages"
   * style counters, wrong for distinct events.
   */
  collapseId?: string;
  /** Seconds APNs should keep retrying while the device is unreachable. */
  ttlSeconds?: number;
}

/**
 * Generate a JWT for APNs authentication using the .p8 key
 */
async function generateAPNsJWT(): Promise<string> {
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY"); // .p8 key contents

  if (!teamId || !keyId || !privateKey) {
    throw new Error("APNs configuration missing: APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY");
  }

  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
  };

  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Parse PEM private key
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * Only a trusted server-side caller may drive this function.
 *
 * The platform default `verify_jwt = true` is satisfied by the ANON key, which
 * is published in the client bundle and is itself a signed JWT. So "verified"
 * meant nothing here: anyone with the project URL and that public key could
 * POST a device token, title, body and deep-link `data`, and this function
 * would sign it with the org's own APNS_PRIVATE_KEY and deliver it through
 * Apple's production gateway. That is a phishing channel riding the
 * organisation's trusted push identity, with no rate limit on it either.
 *
 * The only legitimate caller (`sendPushToUser` in src/lib/notifications/push.ts)
 * invokes through an ADMIN client, so its bearer token already carries
 * `role: "service_role"`. Requiring that role costs the real caller nothing and
 * removes the anon key as a way in.
 *
 * The signature was already validated by the platform before this runs; this
 * only reads the role claim out of the verified payload.
 */
function isServiceRoleCaller(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    // base64url -> JSON. Deno's atob needs standard base64 padding.
    const b64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: string };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isServiceRoleCaller(req)) {
    // Deliberately terse: an unauthorised caller learns nothing about whether
    // the token, topic or payload would otherwise have been accepted.
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const {
      deviceToken, platform, title, body, data, badge, subtitle,
      category, threadId, interruptionLevel, relevanceScore, collapseId, ttlSeconds,
    } = await req.json() as PushRequest;

    if (!deviceToken || !title) {
      return new Response(
        JSON.stringify({ error: "deviceToken and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only handle iOS APNs for now
    if (platform !== "ios") {
      return new Response(
        JSON.stringify({ success: true, message: `Platform ${platform} not yet supported` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bundleId = Deno.env.get("APNS_BUNDLE_ID") || "com.helmsportslabs.golfhelm";
    // DEFAULT TO PRODUCTION, and opt IN to sandbox.
    //
    // This used to read `=== "production"`, which defaults to SANDBOX whenever
    // APNS_ENVIRONMENT is unset. That is the wrong way round for a function
    // whose only deployment target is production, and it is a live footgun:
    // the version currently running in production is the pre-#1096 one, which
    // defaults to production. Deploying this file without first setting
    // APNS_ENVIRONMENT would therefore have silently moved every send to the
    // sandbox host, where production device tokens are rejected outright with
    // BadDeviceToken — push would break completely, and the only symptom is a
    // 400 per send.
    //
    // Sandbox is reached explicitly with APNS_ENVIRONMENT=development, which
    // is also what a debug build needs; a token minted by a debug build is not
    // valid against the production host either, so this must match the build.
    const apnsHost = Deno.env.get("APNS_ENVIRONMENT") === "development"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

    const jwt = await generateAPNsJWT();

    const level = interruptionLevel ?? "active";

    const apnsPayload = {
      aps: {
        alert: subtitle ? { title, subtitle, body } : { title, body },
        // A passive notification should land in the list without a sound —
        // sounding it defeats the point of the quieter delivery level.
        ...(level === "passive" ? {} : { sound: "default" }),
        // Only include the badge key when the caller actually specified one.
        // Sending a value unconditionally overwrites the real unread count.
        ...(badge !== undefined ? { badge } : {}),
        ...(category ? { category } : {}),
        ...(threadId ? { "thread-id": threadId } : {}),
        "interruption-level": level,
        ...(relevanceScore !== undefined ? { "relevance-score": relevanceScore } : {}),
        "mutable-content": 1,
      },
      ...data,
    };

    // A passive push doesn't warrant waking the device — Apple explicitly asks
    // for priority 5 there, and throttles senders that mark everything urgent.
    const priority = level === "passive" ? "5" : "10";

    // APNs interprets `apns-expiration: 0` as "deliver once, right now, and
    // discard on failure". That silently dropped EVERY notification sent while
    // a phone was off, asleep past its buffer, or out of signal. An absolute
    // unix deadline makes APNs retry until it succeeds or the window closes.
    const expiration = Math.floor(Date.now() / 1000) + (ttlSeconds ?? 86_400);

    const response = await fetch(`${apnsHost}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": priority,
        "apns-expiration": String(expiration),
        ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apnsPayload),
    });

    if (response.status === 200) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorBody = await response.text();
    const statusCode = response.status;

    // Deactivate ONLY on true dead-token signals. Apple returns 400 for
    // roughly fourteen unrelated reasons (BadTopic, MissingTopic,
    // PayloadEmpty, TopicDisallowed, InvalidPushType, …), and a config fault
    // is by nature identical for every token in a sweep — a bare-400 match
    // here would mass-deactivate every live device the first time someone
    // mistyped a bundle id. 410 is safe on status alone: Apple only returns
    // it for Unregistered, which is per-token by construction. This mirrors
    // DEAD_TOKEN_REASONS in src/lib/notifications/push.ts; keep the two in
    // step. (The previously deployed v5 predates this file — do not redeploy
    // any copy that sets shouldDeactivateToken on a bare 400.)
    let apnsReason = "";
    try {
      apnsReason = (JSON.parse(errorBody) as { reason?: string }).reason ?? "";
    } catch {
      /* non-JSON APNs body — no reason available */
    }
    const DEAD_TOKEN_REASONS = ["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"];
    const isDeadToken = statusCode === 410 || DEAD_TOKEN_REASONS.includes(apnsReason);

    if (isDeadToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `APNs error ${statusCode}: ${errorBody}`,
          reason: apnsReason || undefined,
          apnsStatus: statusCode,
          shouldDeactivateToken: true,
        }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `APNs error ${statusCode}: ${errorBody}`,
        reason: apnsReason || undefined,
        apnsStatus: statusCode,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("APNs push error:", error);
    await captureEdgeException(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
