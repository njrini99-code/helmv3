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
  badge?: number;
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
    const { deviceToken, platform, title, body, data, badge } = await req.json() as PushRequest;

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
    const isProduction = Deno.env.get("APNS_ENVIRONMENT") === "production";
    const apnsHost = isProduction
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";

    const jwt = await generateAPNsJWT();

    const apnsPayload = {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: badge ?? 1,
        "mutable-content": 1,
      },
      ...data,
    };

    const response = await fetch(`${apnsHost}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
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
