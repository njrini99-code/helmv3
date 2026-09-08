import Link from 'next/link';
import { Surface } from '@/components/fairway';
import { MAX_AFFECTED_PEOPLE } from '@/lib/admin/data/triage';
import type { ResolvedAffectedPerson } from '@/lib/admin/data/affected-people';

/**
 * WHO this fault happened to.
 *
 * The Bridge has counted affected users since the Errors tab existed and has
 * never been able to name one: `mergeTriage` built a Set of `user_id` /
 * `user_email` per fingerprint and kept only `.size`, so every surface could
 * render "2 users" and none could say which two. `/admin/thread/user/<id>`
 * shipped the whole time with nothing linking to it from an incident. This
 * panel is that link.
 *
 * THREE STATES, NOT TWO. "We could not read who" (`known: false`) must never
 * render as "nobody" — that is the `unknown → healthy` inversion the
 * engineering OS forbids, and it is the same distinction `affectedUsersKnown`
 * draws on the incident model. An empty list on a successful read is its own
 * message: for a server-render fault nothing captured an identity, which is a
 * capture gap worth naming on the page rather than an absence of victims.
 */
export function AffectedPeoplePanel({
  people,
  total,
  known,
}: {
  people: readonly ResolvedAffectedPerson[];
  total: number;
  known: boolean;
}) {
  const hidden = Math.max(0, total - people.length);

  return (
    <Surface padding="sm" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">People affected</h2>
        {known ? (
          <span className="text-caption text-warm-500">
            {total} {total === 1 ? 'person' : 'people'}
            {hidden > 0 ? ` · showing ${people.length}` : ''}
          </span>
        ) : null}
      </div>

      {!known ? (
        <p className="mt-3 text-body-sm text-warm-600">
          Could not read who was affected. This is not a claim that nobody was — the identity
          columns for this fingerprint could not be queried.
        </p>
      ) : people.length === 0 ? (
        <p className="mt-3 text-body-sm text-warm-600">
          No identity was captured on any occurrence. Server-render faults are logged from
          Next&apos;s <span className="font-fw-mono text-caption">onRequestError</span> hook, which
          sees the request but not the signed-in user — so this reads as a capture gap, never as
          &ldquo;nobody was affected&rdquo;.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-warm-200">
          {people.map((person) => {
            const key = person.userId ?? person.email ?? person.name;
            const meta = [person.role, person.sport].filter(Boolean).join(' · ');
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  {/* Only a real user id can address the thread page, so a row
                      that carried an email alone renders as plain text rather
                      than a link that cannot land. */}
                  {person.href ? (
                    <Link href={person.href} className="text-body-sm text-warm-900 underline">
                      {person.name}
                    </Link>
                  ) : (
                    <span className="text-body-sm text-warm-900">{person.name}</span>
                  )}
                  {person.email && person.email !== person.name ? (
                    <span className="ml-2 font-fw-mono text-caption text-warm-500">
                      {person.email}
                    </span>
                  ) : null}
                </div>
                {meta ? (
                  <span className="text-caption uppercase tracking-widest text-warm-500">{meta}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 ? (
        <p className="mt-2 text-caption text-warm-500">
          +{hidden} more — capped at {MAX_AFFECTED_PEOPLE} so this panel names people rather than
          exporting a list.
        </p>
      ) : null}
    </Surface>
  );
}
