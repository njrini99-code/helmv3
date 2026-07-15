'use client';

// =============================================================================
// src/components/baseball/passport/ScoutPacketCsvButton.tsx
//
// V5 Scout Packet — "Export forms: CSV summary". A one-tap CSV download of the
// packet a scout is looking at. The CSV is built from the SAME model the page
// rendered (scoutPacketToCsv), so the export can never contain a field the
// packet didn't already expose — there is one source of truth for what a scout
// sees and downloads.
//
// Pure client island (download only). When `token` is provided we point the
// browser at the tokenized CSV route so anon scouts get a clean file download
// with proper headers; otherwise (staff preview / no token) we build + download
// the CSV in-browser from the model.
// =============================================================================

import { IconDownload } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  scoutPacketToCsv,
  type ScoutPacketModel,
} from '@/lib/baseball/scout-packet-shared';

interface Props {
  /** When set, download via the tokenized CSV route; else build client-side. */
  token: string | null;
  model: ScoutPacketModel;
}

function safeFileName(model: ScoutPacketModel): string {
  const base = (model.playerName ?? 'player')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `scout-packet-${base || 'player'}.csv`;
}

export function ScoutPacketCsvButton({ token, model }: Props) {
  if (!model.ok) return null;

  const onDownload = () => {
    if (token) {
      // Let the route handler stream the file with Content-Disposition.
      window.location.href = `/baseball/packet/${encodeURIComponent(token)}/csv`;
      return;
    }
    const csv = scoutPacketToCsv(model);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFileName(model);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onDownload}
      haptic="none"
      className="gap-1.5 rounded-lg border-warm-200 bg-cream-50 px-3 py-1.5 text-sm font-medium text-warm-700 hover:border-primary-200 hover:text-primary-700"
    >
      <IconDownload size={14} />
      CSV summary
    </Button>
  );
}
