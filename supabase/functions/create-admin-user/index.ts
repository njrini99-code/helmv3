import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * RETIRED — #1271.
 *
 * This was a one-time bootstrap that ran on 2026-02-09 and was never removed.
 * Until 2026-08-03 it was deployed with `verify_jwt: false`, meaning ANY
 * unauthenticated caller on the internet could invoke it, and its body held the
 * SERVICE ROLE key, created a pre-confirmed `admin@helmsportslabs.com` with a
 * hardcoded password literal, and promoted that row to `role: 'admin'`.
 *
 * What made it dangerous was not what it did on any given day — the account it
 * creates already exists, so `auth.admin.createUser` was returning 400 — but
 * that its safety depended entirely on a row continuing to exist. Delete that
 * account for any ordinary reason and the endpoint becomes an admin factory
 * for anyone who knows the URL. An unauthenticated endpoint holding the
 * service-role key is wrong by construction regardless of its current body.
 *
 * The account's password was rotated on 2026-08-03 and is no longer the
 * literal that sat in the previous version of this file.
 *
 * This version deliberately: requires a JWT, constructs no Supabase client,
 * reads no secrets, and refuses every request. It exists only so the route
 * returns something honest until the function is removed in the dashboard —
 * the Management API exposes no delete. Do NOT reintroduce a bootstrap here.
 * If one is ever genuinely needed it requires verify_jwt, a super-admin check
 * on the caller, and a generated password delivered out of band.
 */
Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "gone",
      message:
        "create-admin-user was a one-time bootstrap and has been retired (#1271). It no longer creates accounts.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  ),
);
