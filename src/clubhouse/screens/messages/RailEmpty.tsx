import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import type { ChConvFilter } from './model';

/**
 * The conversation list with nothing to list (CH-7302), told by why. A search that matches no name or an unread filter
 * with nothing unread is a filter hiding rows, so it names the filter and offers the one way out. Groups with no group
 * is the list not having begun, so it only says so (wave 5 #12: never "caught up"). With a search it speaks of names
 * only, since message hits may still follow below (wave 5 #11).
 */
export function RailEmpty({ filter, q, onClearSearch, onShowAll }: { filter: ChConvFilter; q: string; onClearSearch: () => void; onShowAll: () => void }) {
  if (q.trim()) {
    return (
      <EmptyState
        compact
        kind="filtered"
        code="CH-7302"
        title="No conversation names match"
        action={
          <Button size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  }
  if (filter === 'groups') return <EmptyState compact code="CH-7302" title="No group conversations yet" />;
  return (
    <EmptyState
      compact
      kind="filtered"
      code="CH-7302"
      title="Nothing unread"
      body="You’re caught up."
      action={
        <Button size="sm" onClick={onShowAll}>
          Show all
        </Button>
      }
    />
  );
}
