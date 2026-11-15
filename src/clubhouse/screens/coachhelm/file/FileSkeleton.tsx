'use client';

import { useChPhone } from '../../../lib/use-phone';

const Lines = () => (
  <div className="sk">
    <i className="ch-skel" style={{ width: '82%' }} />
    <i className="ch-skel" style={{ width: '64%' }} />
    <i className="ch-skel" style={{ width: '74%' }} />
  </div>
);

const Card = ({ title }: { title: string }) => (
  <section className="card" aria-busy="true">
    <div className="card__h">
      <h4>{title}</h4>
    </div>
    <Lines />
  </section>
);

/** Each card keeps its head; the lens control is drawn but off; no tap opens a sheet (06 §13). */
export function FileSkeleton({ first }: { first: string | null }) {
  const who = first ?? 'This player';
  const phone = useChPhone();
  return (
    <main className={'ch-hf is-loading ' + (phone ? 'is-phone' : 'is-desk')} aria-busy="true">
      <div className="ch-hf-flow">
        <section className="feat" aria-busy="true">
          <div className="sk">
            <i className="ch-skel t" style={{ width: '44%' }} />
            <i className="ch-skel t" style={{ width: '70%' }} />
            <i className="ch-skel" style={{ width: '92%' }} />
            <i className="ch-skel" style={{ width: '70%' }} />
          </div>
        </section>
        <Card title={first ? `${who}’s plan` : 'Plan'} />
        <Card title="Last round in context" />
        <Card title="All reads" />
        <Card title="Where the strokes go" />
      </div>
    </main>
  );
}
