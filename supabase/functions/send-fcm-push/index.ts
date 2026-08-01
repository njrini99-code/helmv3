import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Android push transport — the FCM counterpart to `send-apns-push`.
 *
 * WHY THIS EXISTS: `sendPushNotification` (src/lib/notifications/push.ts) used
 * to invoke `send-apns-push` for every device token regardless of platform.
 * Apple rejects an FCM token, and a rejection only bumps `failed_count`, so
 * Android push failed silently and permanently. That function now routes
 * `platform === 'android'` here.
 *
 * REQUIRED CONFIG (this function is INERT until these are set — it returns a
 * clear 503 rather than throwing, so a missing Firebase project degrades to
 * "no Android push" instead of erroring every send):
 *
 *   FCM_PROJECT_ID     Firebase project id (NOT the project number)
 *   FCM_CLIENT_EMAIL   service-account email from the Firebase JSON key
 *   FCM_PRIVATE_KEY    that key's private_key, PEM, "\n" escapes tolerated
 *
 * Create the service account in Firebase Console → Project settings → Service
 * accounts → Generate new private key. The legacy `FCM server key` / the
 * `fcm/send` endpoint are RETIRED — HTTP v1 with a scoped OAuth token, which
 * is what this does, is the only supported path.
 *
 * Deploy: supabase functions deploy send-fcm-push
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

interface PushRequest {
  deviceToken: string;
  platform: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification-tray collapse key — a later push replaces an undelivered earlier one. */
  collapseId?: string;
  /** Seconds FCM should keep retrying while the device is unreachable. */
  ttlSeconds?: number;
  /** Android channel id. Must already exist on the client or the post is dropped silently on API 26+. */
  channelId?: string;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  // Supabase secrets round-trip newlines as literal \n; tolerate both forms.
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Mint a short-lived OAuth access token for the FCM scope via the JWT-bearer
 * grant. Cached in module scope: edge instances are reused across invocations,
 * so a fan-out to a whole roster mints one token, not one per device.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(
  clientEmail: string,
  privateKeyPem: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // 60s skew guard so we never present a token that expires mid-flight.
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FCM_PRIVATE_KEY");

    if (!projectId || !clientEmail || !privateKey) {
      // 503, not 500: this is "not configured yet", a deployment state, not a
      // bug. shouldDeactivateToken is deliberately absent — the token is fine,
      // we just can't send. Deactivating here would destroy good tokens the
      // moment Firebase config lapsed.
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "FCM not configured: set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      deviceToken,
      title,
      body,
      data,
      collapseId,
      ttlSeconds,
      channelId,
    } = await req.json() as PushRequest;

    if (!deviceToken || !title) {
      return new Response(
        JSON.stringify({ success: false, error: "deviceToken and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);

    // FCM data values MUST be strings — numbers/objects are rejected outright,
    // so stringify anything non-primitive rather than letting the send 400.
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data ?? {})) {
      stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
    }

    const message = {
      message: {
        token: deviceToken,
        notification: { title, body },
        data: stringData,
        android: {
          priority: "HIGH",
          ttl: `${ttlSeconds ?? 86_400}s`,
          ...(collapseId ? { collapse_key: collapseId.slice(0, 64) } : {}),
          notification: {
            // Must match a channel the client already created; on API 26+ a
            // post to an unknown channel is dropped without an error — FCM
            // still reports success, so the failure is invisible from both
            // ends. "helm_default" is created in MainActivity.onCreate and
            // declared as the FCM default in AndroidManifest.xml; keep all
            // three in sync.
            channel_id: channelId ?? "helm_default",
            default_sound: true,
          },
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      },
    );

    if (response.ok) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errorBody = await response.text();
    const statusCode = response.status;

    // Only UNREGISTERED and INVALID_ARGUMENT-on-the-token mean "this token is
    // dead". Match on the reason string, never on a bare 400 — FCM returns 400
    // for many CONFIG faults (bad channel, malformed data), and a config fault
    // is identical for every token in a sweep, so treating 400 as a dead token
    // would mass-deactivate an entire roster's devices. Same trap the APNs
    // path documents at length.
    const isDeadToken =
      statusCode === 404 ||
      /UNREGISTERED|NOT_FOUND/i.test(errorBody) ||
      (statusCode === 400 && /invalid.{0,20}(registration|token)/i.test(errorBody));

    if (isDeadToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `FCM error ${statusCode}: ${errorBody}`,
          shouldDeactivateToken: true,
        }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `FCM error ${statusCode}: ${errorBody}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("FCM push error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
