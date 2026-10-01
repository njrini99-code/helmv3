'use client';

import { Button } from '../../ui/Button';
import { useBackToList } from './list-state';

/** A way back to the qualifiers list for a page that has none of its own (a qualifier that isn't on the team): the list as it was left. */
export function BackToList({ children }: { children: string }) {
  const { href, markReturn } = useBackToList();
  return (
    <span onClickCapture={markReturn}>
      <Button size="sm" href={href}>
        {children}
      </Button>
    </span>
  );
}
