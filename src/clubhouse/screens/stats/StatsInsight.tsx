import { playerInsight, teamInsight, type ChInsight } from '../../data/stats-insight';
import { previousWords } from '../../data/stats-filter';
import { Surface } from '../../ui/Surface';

/**
 * Row 70: the insight-first card at the top of Stats, team and player, phone and desktop. It states the one or two changes that clear
 * their standard error, each with its signed figure in the page's gain or loss ink and the words that say which way, or "No clear
 * change" when nothing does. Nothing to compare draws nothing (`statsInsight`).
 */
export function StatsInsight({ insight }: { insight: ChInsight }) {
  if (!insight) return null;
  return (
    // It is the first section under the page's h1 on all four Stats screens, so its title is an h2 (F-0063).
    <Surface id="ch-st-insight" level={2} title={insight.state === 'none' ? 'No clear change' : 'What changed'}>
      {insight.state === 'none' ? (
        <p>Nothing has moved past its usual round-to-round spread {insight.against}.</p>
      ) : (
        insight.lines.map((l) => (
          <p key={l.subject}>
            <b className={`ch-num ${l.tone === 'is-gain' ? 'ch-gain' : 'ch-loss'}`}>{l.figure}</b> {l.words}
          </p>
        ))
      )}
    </Surface>
  );
}

/**
 * Team stats' card, read inside its own boundary. A figures list that isn't one draws no card: the figures' own section says it
 * failed (CH-4204), once.
 */
export function TeamInsight({ figures, last }: { figures: Parameters<typeof teamInsight>[0]; last: number }) {
  return <StatsInsight insight={Array.isArray(figures) ? teamInsight(figures, previousWords(last)) : null} />;
}

/** A player's card, read inside its own boundary (CH-5204). */
export function PlayerInsight({ data }: { data: Parameters<typeof playerInsight>[0] }) {
  return <StatsInsight insight={playerInsight(data)} />;
}
