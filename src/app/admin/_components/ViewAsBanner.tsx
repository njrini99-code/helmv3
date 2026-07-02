import { InlineNotice, Button } from '@/components/fairway';
import { exitViewAs } from '@/app/admin/actions/view-as';

/**
 * Persistent, unmissable read-only impersonation banner. Renders on every
 * view-as surface — the ONLY interactive control on the page besides
 * whatever the target's own read-only data renders is this "Exit view-as"
 * button (view-as pages carry zero write affordances by construction).
 */
export function ViewAsBanner({ email, expiresAtMs }: { email: string; expiresAtMs: number }) {
  return (
    <InlineNotice
      tone="warning"
      title={`Viewing as ${email} — read-only`}
      // Offset below FairwayTopBar (sticky top-0, --golf-mobile-header-offset
      // set on the AppShell content column = topbar height + safe-area) so
      // the two sticky surfaces never z-fight for the same y=0 slot.
      className="sticky top-[var(--golf-mobile-header-offset)] z-[var(--fw-z-sticky)]"
      action={
        <form action={exitViewAs}>
          <Button type="submit" variant="danger" size="sm">
            Exit view-as
          </Button>
        </form>
      }
    >
      Expires {new Date(expiresAtMs).toLocaleTimeString()}. No writes are possible while viewing as this user.
    </InlineNotice>
  );
}
