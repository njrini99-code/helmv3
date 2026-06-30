import 'server-only';
import { resolveTxt } from 'node:dns/promises';
import { logServerException } from '@/lib/server-error-logger';

// ============================================================================
// DOMAIN AUTH SELF-CHECK (SPF / DKIM / DMARC)
// ============================================================================
//
// Cold mail sent from a real Workspace mailbox only lands in Primary if the
// sending domain is authenticated. The single most common real-world miss is
// that DKIM is NOT signed by default on a fresh Workspace domain — you have to
// turn it on in Admin → Apps → Gmail → Authenticate email. This check inspects
// DNS so you KNOW the three records are present before sending, instead of
// finding out from the spam folder.
//
// It's a presence/sanity check (DNS TXT lookups), not a cryptographic
// verification of a signed message — that's enough to catch the misconfigs that
// send cold mail to spam.
// ============================================================================

export interface AuthCheck { ok: boolean; detail: string }
export interface DomainAuthResult {
  domain: string;
  spf: AuthCheck;
  dkim: AuthCheck;
  dmarc: AuthCheck;
  ok: boolean; // all three pass
}

async function txt(name: string): Promise<string[]> {
  try {
    // resolveTxt returns string[][] (each record can be split into chunks).
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch (err) {
    await logServerException(err, {
      action: 'resolveTxt',
      featureArea: 'crm-domain-auth',
      source: 'server_action',
      handled: true,
      extra: { name },
    });
    return [];
  }
}

export async function checkDomainAuth(domain: string): Promise<DomainAuthResult> {
  const d = domain.trim().toLowerCase().replace(/^@/, '');

  // SPF — a TXT record on the domain root with v=spf1 that authorizes Google.
  const root = await txt(d);
  const spfRec = root.find((r) => /v=spf1/i.test(r));
  const spfGoogle = spfRec ? /_spf\.google\.com/i.test(spfRec) : false;
  const spf: AuthCheck = spfRec
    ? { ok: spfGoogle, detail: spfGoogle ? 'SPF authorizes Google (_spf.google.com)' : 'SPF present but missing include:_spf.google.com' }
    : { ok: false, detail: 'No SPF record (v=spf1) found on the domain' };

  // DMARC — a TXT record at _dmarc.<domain> with v=DMARC1.
  const dmarcRecs = await txt(`_dmarc.${d}`);
  const dmarcRec = dmarcRecs.find((r) => /v=DMARC1/i.test(r));
  const policy = dmarcRec?.match(/p=(\w+)/i)?.[1] ?? 'unset';
  const dmarc: AuthCheck = dmarcRec
    ? { ok: true, detail: `DMARC present (p=${policy})` }
    : { ok: false, detail: `No DMARC record at _dmarc.${d}` };

  // DKIM — Google Workspace's default selector is google._domainkey.<domain>.
  const dkimRecs = await txt(`google._domainkey.${d}`);
  const dkimRec = dkimRecs.find((r) => /v=DKIM1|k=rsa|p=[A-Za-z0-9+/]/i.test(r));
  const dkim: AuthCheck = dkimRec
    ? { ok: true, detail: 'DKIM present (selector: google)' }
    : { ok: false, detail: 'No DKIM at google._domainkey — enable in Admin → Authenticate email (or a custom selector is in use)' };

  return { domain: d, spf, dkim, dmarc, ok: spf.ok && dkim.ok && dmarc.ok };
}
