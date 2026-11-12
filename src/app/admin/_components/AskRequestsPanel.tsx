import { Surface } from '@/components/fairway';
import { fetchAskCreditRequests } from '@/lib/admin/data/ask-credit-requests';
import { PanelNoData } from './PanelStates';
import { LocalTime } from './LocalTime';
import { SectionLabel } from './SectionLabel';

/**
 * Players' "Request more" for CoachHelm Ask: who asked, on which team, and what they wrote. The ops e-mail names only the
 * request id and the team (security review 2026-11-11, finding 5), and points here (`#ask-requests`).
 */
export async function AskRequestsPanel() {
  const result = await fetchAskCreditRequests();
  return (
    <Surface padding="sm">
      <div id="ask-requests" className="scroll-mt-24">
        <SectionLabel>Ask: requests for more</SectionLabel>
      </div>
      <div className="mt-3 divide-y divide-warm-200/70">
        {result.status === 'unavailable' ? (
          <PanelNoData label="Not set up yet" description="Requests appear once the Ask allowance migration is applied." />
        ) : result.status === 'error' ? (
          <PanelNoData label="Couldn’t load requests" description={result.message} />
        ) : result.rows.length === 0 ? (
          <PanelNoData label="No requests" description="When a player asks for more Ask, the request and their note appear here." />
        ) : (
          result.rows.map((r) => (
            <div key={r.id} className="py-3" data-request-id={r.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-warm-900">
                  {r.playerName ?? 'Unknown player'} <span className="font-normal text-warm-500">· {r.teamName ?? 'Unknown team'}</span>
                </p>
                <span className="font-fw-mono text-xs tabular-nums text-warm-600">
                  <LocalTime iso={r.createdAt} variant="date" fallback="" />
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-warm-700">{r.note.trim() || 'No note.'}</p>
              <p className="mt-1 font-fw-mono text-xs text-warm-500">
                Request {r.id} · {r.releasedAt == null ? 'still undoable' : r.sentAt ? 'e-mailed' : 'not e-mailed'}
              </p>
            </div>
          ))
        )}
      </div>
    </Surface>
  );
}
