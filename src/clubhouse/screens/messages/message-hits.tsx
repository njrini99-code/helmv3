'use client';

import { useEffect, useState } from 'react';
import type { ChMessagesApi } from './api/types';
import { RailEmpty } from './RailEmpty';
import { Search } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Skeleton } from '../../ui/States';
import { chTrail } from '../../lib/track';
import { railTime, searchSnippet, ChSearchHit } from './model';

export function MessageHits({ api, q, nameMatches, conversationId, onPicked, layout = 'flat' }: { api: ChMessagesApi; q: string; /** One conversation's hits only (Details, Search). */ conversationId?: string; onPicked?: () => void; /** Redesign: how many names matched, so an empty search says it once (S-MSG.search). */ nameMatches: number; /** The inbox's empty "Nothing here": the phone's card or the rail's flat label. */ layout?: 'card' | 'flat' }) {
  const [hits, setHits] = useState<ChSearchHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const search = api.searchMessages;
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let live = true;
    // The last term's results aren't this term's, and its "no results" isn't either.
    setHits(null);
    setFailed(false);
    const t = window.setTimeout(() => {
      search(term)
        .then((r) => live && (r ? setHits(conversationId ? r.filter((h) => h.conversationId === conversationId) : r) : setFailed(true)))
        .catch(() => live && setFailed(true));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [search, term, attempt, conversationId]);
  if (term.length < 2) return null;
  if (hits && !hits.length && !failed) {
    if (nameMatches > 0) return null;
    // A conversation's own search (Details) keeps its card; the inbox's says it as the "Nothing here" card does (MSG-115).
    if (!conversationId) return <div role="status"><RailEmpty filter="all" q={term} layout={layout} /></div>;
    return (
      <section className="ch-msv-card ch-msv-noresults" role="status" data-ch-code="CH-7303">
        <b>No results</b>
        <span>Try another name or word.</span>
      </section>
    );
  }
  return (
    <section
      className="ch-ms-sec"
      aria-label="Messages matching your search"
      // CH-7802: results are announced as they arrive.
      aria-live="polite"
    >
      <div className="ch-ms-sec__l">In messages</div>
      {failed ? (
        <InlineNotice
          code="CH-7203"
          title="Message search didn’t load"
          body="Conversations above still match by name."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      ) : !hits ? (
        <div className="ch-ms-sec__card" aria-busy="true" data-ch-code="CH-7404">
          <div className="ch-ms-row" style={{ cursor: "default" }}>
            <span />
            <Skeleton width="80%" height={13} />
          </div>
        </div>
      ) : (
        <div className="ch-ms-sec__card">
          {hits.slice(0, 20).map((h) => {
            // The row is one line: it opens just before the match, which is marked (wave 5 #11).
            const cut = searchSnippet(h.text, term);
            return (
            <button
              key={h.messageId}
              type="button"
              className="ch-ms-row is-hit"
              onClick={() => {
                // D-70: opening a hit is plain navigation, so it is silent (F-0071; CH-7703 ticks a reaction or a filter).
                chTrail("messages open search hit");
                api.openHit(h);
                onPicked?.();
              }}
            >
              <span className="ch-ms-grp">
                <Icon icon={Search} size={14} />
              </span>
              <span className="ch-ms-row__main">
                <span className="ch-ms-row__top">
                  <b>{h.conversationName}</b>
                  <span className="ch-num">
                    {railTime(h.at, api.now, api.timeZone, api.clock)}
                  </span>
                </span>
                <span className="ch-ms-row__bot">
                  <span>
                    <em>{h.senderName}: </em>
                    {cut.before}
                    {cut.match && <mark className="ch-ms-hit">{cut.match}</mark>}
                    {cut.after}
                  </span>
                </span>
              </span>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
