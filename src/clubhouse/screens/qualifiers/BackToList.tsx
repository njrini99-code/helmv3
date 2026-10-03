'use client';

import { Button } from '../../ui/Button';
import { LIST_HREF, useStepBack } from './return-state';

/**
 * A way back to the qualifiers list for a page that has none of its own (a qualifier that isn't on the team). With the qualifier's id it
 * steps back when the list is the entry before it; otherwise it is the list's address.
 */
export function BackToList({ id, children }: { id?: string; children: string }) {
  const back = useStepBack('list', id ?? '', LIST_HREF);
  return (
    <span onClickCapture={back.onClickCapture}>
      <Button size="sm" href={LIST_HREF}>
        {children}
      </Button>
    </span>
  );
}
