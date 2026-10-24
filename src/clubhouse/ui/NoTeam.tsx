'use client';

import { Users } from 'lucide-react';
import { rebuiltHref } from '../shell/nav';
import { Button } from './Button';
import { EmptyState } from './States';

/**
 * The one "not on a team" state (CONS-10), a restricted page state: one icon, one title, what the page will hold once
 * there is a team (`body`, in the page's words for this role), and one way on: a coach sets the team up in Team
 * settings, a player joins one from Golf profile (CH-8302). `action={false}` where the page is that setting itself. It
 * fills the page; `inline` sits in a section. The page keeps its own code.
 */
export function NoTeam({ code, coach, body, action = true, inline = false }: { code: string; coach: boolean; body: string; action?: boolean; inline?: boolean }) {
  const settings = action ? rebuiltHref(`/golf/dashboard/settings?section=${coach ? 'team' : 'golf'}`, coach ? 'coach' : 'player') : null;
  return (
    <EmptyState
      size={inline ? undefined : 'page'}
      code={code}
      kind="restricted"
      icon={Users}
      title="You aren’t on a team yet"
      body={body}
      action={
        settings ? (
          <Button variant="primary" href={settings}>
            Open team settings
          </Button>
        ) : undefined
      }
    />
  );
}
