/**
 * One-click unsubscribe endpoint for cold-outreach List-Unsubscribe headers (RFC 8058).
 *
 * The cold sender adds two headers to every email:
 *   List-Unsubscribe: <https://helmsportslabs.com/api/crm/unsubscribe?c=<coachId>&t=<token>>, <mailto:...>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * Gmail/Yahoo render their NATIVE "Unsubscribe" affordance from these headers (no salesy body line),
 * and one-click clients POST here. Honoring it instantly is the #1 free Gmail-Primary signal and the
 * cheapest way to keep the complaint rate near zero.
 *
 * The token is an HMAC of the coach id with CRM_UNSUB_SECRET (must match scripts/process-sequence-batch.mjs),
 * so a stranger can't suppress arbitrary coaches by guessing ids.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubToken } from '@/lib/crm/unsubscribe-token';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns true only once the suppression row exists (or already existed) —
// that row is the source of truth senders consult before sending. A failed
// crm_coaches status update is logged but doesn't flip the result to false,
// since the suppression itself already landed.
async function suppress(coachId: string): Promise<boolean> {
  const supa = createAdminClient();
  const { data: coach, error: coachError } = await supa
    .from('crm_coaches')
    .select('email')
    .eq('id', coachId)
    .maybeSingle();
  if (coachError) {
    await logServerError(`unsubscribe.suppress coach lookup failed: ${coachError.message}`, {
      action: 'crm.unsubscribe.suppress',
      errorCode: coachError.code,
      extra: { coachId },
    });
    return false;
  }
  const email = coach?.email?.toLowerCase().trim();
  if (!email) return false;

  // check-then-insert (no reliance on a unique constraint existing)
  const { data: existing, error: existingError } = await supa
    .from('crm_email_suppressions')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingError) {
    await logServerError(`unsubscribe.suppress suppression lookup failed: ${existingError.message}`, {
      action: 'crm.unsubscribe.suppress',
      errorCode: existingError.code,
      extra: { coachId },
    });
    return false;
  }
  if (!existing) {
    const { error: insertError } = await supa.from('crm_email_suppressions').insert({
      email,
      reason: 'unsubscribed',
      source: 'system',
      metadata: { via: 'list-unsubscribe', coach_id: coachId },
    });
    if (insertError) {
      await logServerError(`unsubscribe.suppress insert failed: ${insertError.message}`, {
        action: 'crm.unsubscribe.suppress',
        errorCode: insertError.code,
        extra: { coachId },
      });
      return false;
    }
  }
  const { error: updateError } = await supa
    .from('crm_coaches')
    .update({ email_status: 'unsubscribed', updated_at: new Date().toISOString() })
    .eq('id', coachId);
  if (updateError) {
    await logServerError(`unsubscribe.suppress crm_coaches update failed: ${updateError.message}`, {
      action: 'crm.unsubscribe.suppress',
      errorCode: updateError.code,
      extra: { coachId },
    });
  }
  return true;
}

function page(msg: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui,-apple-system,sans-serif;background:#FFFEFA;color:#1c1917;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center;padding:2rem;max-width:30rem"><h1 style="font-size:1.25rem;margin:0 0 .5rem;font-weight:600">${msg}</h1><p style="color:#78716c;margin:0;font-size:.9rem">GolfHelm · helmsportslabs.com</p></div></body></html>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A plain GET (a scanner prefetching the visible link, or a human clicking it)
// must NOT auto-suppress — only a real confirming click, or the RFC 8058
// one-click POST above, should. Renders a form that POSTs back to this same
// URL with the same c/t pair.
function confirmPage(c: string, t: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui,-apple-system,sans-serif;background:#FFFEFA;color:#1c1917;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center;padding:2rem;max-width:30rem"><h1 style="font-size:1.25rem;margin:0 0 .5rem;font-weight:600">Unsubscribe from GolfHelm emails?</h1><p style="color:#78716c;margin:0 0 1.5rem;font-size:.9rem">You won't receive any more emails from us.</p><form method="POST" action="/api/crm/unsubscribe"><input type="hidden" name="c" value="${escapeAttr(c)}"><input type="hidden" name="t" value="${escapeAttr(t)}"><button type="submit" style="font:inherit;font-weight:600;background:#1c1917;color:#FFFEFA;border:none;border-radius:.5rem;padding:.75rem 1.5rem;cursor:pointer">Confirm unsubscribe</button></form></div></body></html>`;
}

// RFC 8058 one-click (Gmail/Yahoo POST the List-Unsubscribe URL directly) AND
// the confirmation form rendered by GET below (a human confirming the click).
// The one-click sender POSTs the URL as-is (c/t in the query string); the
// confirm form POSTs the same pair as a form body — accept either shape.
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  let c = searchParams.get('c');
  let t = searchParams.get('t');
  if (!c || !t) {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('form')) {
      const form = await request.formData();
      c = c ?? (form.get('c') as string | null);
      t = t ?? (form.get('t') as string | null);
    }
  }
  if (!verifyUnsubToken(c, t)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const ok = await suppress(c);
  // Non-2xx tells RFC 8058 senders to retry the one-click POST — silently
  // 200-ing a failed suppress() would leave the coach un-suppressed forever.
  if (!ok) return NextResponse.json({ error: 'failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Browser click (or an email-security scanner's prefetch of the visible
// link). MUST NOT suppress — a scanner following every link in an email
// would otherwise force-unsubscribe recipients who never clicked anything.
// Renders a confirmation form; only the form's POST (or the RFC 8058
// one-click POST above) actually suppresses. See CLASS K in the security
// remediation spec.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const c = searchParams.get('c');
  const t = searchParams.get('t');
  if (!verifyUnsubToken(c, t)) {
    return new NextResponse(page('This unsubscribe link is invalid or expired.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  // `t` is guaranteed non-null here — verifyUnsubToken returns false on a
  // missing token, and its type guard already narrowed `c`.
  return new NextResponse(confirmPage(c, t as string), { headers: { 'Content-Type': 'text/html' } });
}
