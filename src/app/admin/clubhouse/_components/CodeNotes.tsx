import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/fairway';
import { Textarea } from '@/components/ui/textarea';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { LiveState } from '@/lib/admin/clubhouse/live-model';
import { REASON_MAX, type BridgeNoteRow } from '@/lib/admin/clubhouse/notes';
import { markCodeExpected, setCodeWatch, unmarkCodeExpected } from '@/app/admin/actions/bridge-notes';
import { LocalTime } from '../../_components/LocalTime';
import { Section } from './frame';

const UNREADABLE = 'The Bridge notes (bridge_notes) could not be read, so this cannot be changed right now.';

/** BR-0507 Watch: pins the code to Pulse and the digest, or stops. A plain form, so it works before hydration. */
export function WatchControl({ id, watching, state, why }: { id: number; watching: BridgeNoteRow | null; state: LiveState; why?: string }) {
  if (state !== 'ok') {
    return (
      <Button type="button" variant="secondary" size="sm" disabled data-br={BR.codes.watch} title={why ?? UNREADABLE}>
        Watch
      </Button>
    );
  }
  return (
    <form action={setCodeWatch}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="watch" value={watching ? '0' : '1'} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        data-br={BR.codes.watch}
        aria-pressed={Boolean(watching)}
        title={watching ? 'Stop pinning this code to Pulse and the digest' : 'Pin this code to Pulse and the digest'}
        leftIcon={watching ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
      >
        {watching ? 'Watching · stop' : 'Watch'}
      </Button>
    </form>
  );
}

/**
 * BR-0506 Mark expected…: a note on why this firing is normal, kept with who and when. R-01 and R-02 skip a code
 * marked expected. Marked, it shows the note and an Unmark; not marked, a disclosure holds the reason form.
 */
export function ExpectedNote({ id, note, by, state, why }: { id: number; note: BridgeNoteRow | null; by: string | null; state: LiveState; why?: string }) {
  return (
    <Section
      id="expected"
      title="Expected?"
      description="A firing that is normal, with why. Spikes (R-01) and new-after-release (R-02) skip a code marked expected."
    >
      {state !== 'ok' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" disabled data-br={BR.codes.markExpected} title={why ?? UNREADABLE}>
            Mark expected…
          </Button>
          <p className="min-w-0 text-caption text-text-secondary">{why ?? UNREADABLE}</p>
        </div>
      ) : note ? (
        <div className="space-y-2">
          <p className="break-words text-body-sm text-text-primary">{note.body}</p>
          <p className="text-caption text-text-secondary">
            Marked expected{by ? ` by ${by}` : ''} · <LocalTime iso={note.created_at} variant="datetime" fallback="—" />
          </p>
          <form action={unmarkCodeExpected}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="ghost" size="sm" data-br={BR.codes.markExpected}>
              Unmark expected
            </Button>
          </form>
        </div>
      ) : (
        <details className="min-w-0">
          <summary
            data-br={BR.codes.markExpected}
            className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-fw-sm border border-border-control bg-surface px-3 text-caption font-medium text-text-primary hover:border-border-strong hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 [&::-webkit-details-marker]:hidden"
          >
            Mark expected…
          </summary>
          <form action={markCodeExpected} className="mt-3 flex min-w-0 flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <label htmlFor={`bridge-expected-${id}`} className="text-caption font-medium text-text-secondary">
              Why is this firing normal?
            </label>
            <Textarea
              id={`bridge-expected-${id}`}
              name="reason"
              required
              maxLength={REASON_MAX}
              rows={3}
              placeholder="e.g. Coaches without a roster see this on purpose until they add a player."
              className="w-full rounded-fw-sm border border-border-control bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            />
            <div>
              <Button type="submit" variant="primary" size="sm" data-br={BR.codes.markExpected}>
                Mark expected
              </Button>
            </div>
          </form>
        </details>
      )}
    </Section>
  );
}
