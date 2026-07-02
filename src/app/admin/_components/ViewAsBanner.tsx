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
      className="sticky top-0 z-50"
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
