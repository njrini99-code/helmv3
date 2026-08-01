import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    // Handle common APNs errors
    if (statusCode === 410 || statusCode === 400) {
      // Token is invalid or expired — caller should deactivate it
      return new Response(
        JSON.stringify({
          success: false,
          error: `APNs error ${statusCode}: ${errorBody}`,
          shouldDeactivateToken: true,
        }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `APNs error ${statusCode}: ${errorBody}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("APNs push error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
