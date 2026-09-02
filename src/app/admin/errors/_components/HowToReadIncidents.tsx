import { ChevronRight } from 'lucide-react';

/**
 * "How to read this page" — the legend an operator should never have to
 * reconstruct from source files.
 *
 * A native `<details>`, closed by default: a first-time reader opens it once,
 * a daily one never sees it. It explains the four things people have asked
 * about this page, in this order: what one row IS, why the default view holds
 * things back, what the chips and dots on a row mean, and where the numbers
 * come from. Nothing here restates a heading; every paragraph answers a
 * question the page itself cannot answer inline without becoming a wall.
 */

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)] gap-x-3">
      <dt className="font-fw-mono text-caption font-semibold uppercase leading-5 text-warm-700">{term}</dt>
      <dd className="text-caption leading-5 text-warm-700">{children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-eyebrow uppercase tracking-widest text-warm-500">{title}</h3>
      <div className="mt-1.5 space-y-1.5 text-caption leading-5 text-warm-700">{children}</div>
    </div>
  );
}

export function HowToReadIncidents() {
  return (
    <details className="group rounded-fw-md bg-surface-sunken px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-body-sm font-medium text-warm-800 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        How to read this page
      </summary>

      <div className="mt-3 grid gap-5 border-t border-warm-200 pt-3 md:grid-cols-2">
        <Block title="What one row is">
          <p>
            One production cause. The Bridge groups app error rows by fingerprint (the same code, route and
            message), then merges that group with the Sentry issue and the reliability signal that describe the
            same fault. Twelve events of one bug are one incident with twelve events, not twelve incidents.
          </p>
          <p>
            The title is the fault. The number on the right is how many events it has produced in this window.
            Click the title for the full record: every event, the analysis, the repair and its proof.
          </p>
        </Block>

        <Block title="What the default view holds back">
          <p>
            A classifier reads every incident and decides whether anyone needs to act. Routine telemetry, empty
            states that surfaced through the error path, expected access denials and passing integrity checks are
            held back from the default view. Nothing is deleted: the Kind filter shows everything, and the notice
            above the list says how many are hidden.
          </p>
        </Block>

        <Block title="The chips on a row">
          <dl className="space-y-1">
            <Term term="NEW · REPAIRABLE …">
              Where the incident sits on the road from seen to proven fixed. Green is reserved for a fix production
              has verified; a merged or deployed fix stays amber until it has.
            </Term>
            <Term term="STALLED · REPAIR">
              A self-heal stage has had two of its own cycles to act on this incident and has not. The loop is
              running; it is not moving this.
            </Term>
            <Term term="RCA">An analysis exists. Click it to read the probable cause and suggested fix.</Term>
            <Term term="PR #123">The repair pull request, linked.</Term>
            <Term term="3 SOURCES">Independent systems that witnessed the fault. A count, not a confidence.</Term>
            <Term term="SOURCE BLIND">A source could not be read this refresh, so this row may be incomplete.</Term>
          </dl>
        </Block>

        <Block title="The six dots">
          <p>
            Proof milestones, left to right: observed, analysed, reproduced, CI proven, deployed, production
            verified. Each dot has its own evidence on hover. Six of six is a proven fix. It is a checklist, never a
            percentage.
          </p>
        </Block>

        <Block title="Where the numbers come from">
          <p>
            App rows come from the admin_events table this application writes about itself. Sentry issues come
            from a live pull. Reliability signals come from the collector that runs every three hours. Every count on
            this page says which of those it read, and a source that could not be read is reported as blind, never as
            zero.
          </p>
        </Block>

        <Block title="Resolving and regressions">
          <p>
            Resolve hides an incident&rsquo;s app rows and its Sentry issue together. A fingerprint that fires again
            after being resolved comes back as a REGRESSION, which outranks everything else on the page. The nightly
            close records automatic resolutions with the deploy that fixed them, so a return is recognised as one.
          </p>
        </Block>
      </div>
    </details>
  );
}
