// =============================================================================
// src/app/baseball/(public)/packet/[token]/page.tsx
//
// V5 Scout Packet — the PUBLIC web packet route ("Export forms: web packet").
// Showcase variant: "college coach viewer access".
//
// An UNAUTHENTICATED college coach opens a share link
// (/baseball/packet/<token>). The route resolves the opaque token with the
// SERVER role (anon has no RLS grant), and the scout-packet read model is the
// gate: it returns an honest unavailable state unless the passport is exposed,
// and never emits a field below scout rank. This is the OUTCOME end of the
// SOURCE -> SIGNAL -> ACTION -> OUTCOME chain.
//
// No session, no redirect-loop, no leak: a bad/expired/revoked/not-exposed token
// renders the unavailable card. Indexing is disabled (noindex) so packets don't
// leak into search.
// =============================================================================

import type { Metadata } from 'next';

import { resolveScoutPacketByToken } from '@/app/baseball/actions/scout-packet';
import { ScoutPacketView } from '@/components/baseball/passport/ScoutPacketView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Scout Packet · BaseballHelm',
  // Tokenized, private-by-link packets must never be indexed.
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ScoutPacketPage({ params }: PageProps) {
  const { token } = await params;
  const clean = (token ?? '').trim();
  const model = await resolveScoutPacketByToken(clean);
  // Pass the token so the CSV button uses the server-side tokenized route
  // (/baseball/packet/<token>/csv) rather than building the file in-browser.
  return <ScoutPacketView model={model} token={clean || null} />;
}
