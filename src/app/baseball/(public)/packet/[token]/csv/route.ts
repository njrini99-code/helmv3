// =============================================================================
// src/app/baseball/(public)/packet/[token]/csv/route.ts
//
// V5 Scout Packet — "Export forms: CSV summary" for the PUBLIC tokenized packet.
//
// Streams a text/csv download of the SAME scout-packet model the web packet
// renders. The token is resolved server-side (server role; anon has no RLS
// grant) and the scout-packet read model is the gate — an unexposed/expired/
// revoked token yields a minimal "unavailable" CSV, never a leaked packet.
//
// One source of truth: the CSV is produced by scoutPacketToCsv from the assembled
// model, so it can never include a field the packet itself didn't expose.
// =============================================================================

import { resolveScoutPacketByToken } from '@/app/baseball/actions/scout-packet';
import { scoutPacketToCsv } from '@/lib/baseball/read-models/scout-packet';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

function fileName(name: string | null): string {
  const base = (name ?? 'player')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `scout-packet-${base || 'player'}.csv`;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params;
  // A CSV download isn't a packet "view" — don't bump view_count/last_viewed_at.
  const model = await resolveScoutPacketByToken(token ?? '', { trackView: false });
  const csv = scoutPacketToCsv(model);
  const status = model.ok ? 200 : model.reason === 'not_found' ? 404 : 403;
  return new Response(csv, {
    status,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName(model.ok ? model.playerName : null)}"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
