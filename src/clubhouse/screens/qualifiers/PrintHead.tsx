'use client';

import { useEffect, useState } from 'react';
import type { ChQDetailCore } from '../../data/qualifiers';
import { rangeLabel } from './model';

/**
 * The sheet's head when the page is printed (qualifiers.css, @media print): the qualifier, its dates and the team on the left, GolfHelm
 * and the day it was printed on the right. Hidden on screen. The team is the top bar's own (the qualifier's data does not carry it),
 * read when the page mounts and again as the print starts, so a team switched since is the one on the paper.
 */
export function PrintHead({ data }: { data: ChQDetailCore }) {
  const [team, setTeam] = useState<string | null>(null);
  const [printed, setPrinted] = useState('');
  useEffect(() => {
    const read = () => {
      const t = document.querySelector('.ch-topbar__team')?.getAttribute('title');
      setTeam(t && t !== 'GolfHelm' ? t : null);
      const n = new Date();
      const two = (v: number) => String(v).padStart(2, '0');
      setPrinted(rangeLabel(`${n.getFullYear()}-${two(n.getMonth() + 1)}-${two(n.getDate())}`, null));
    };
    read();
    window.addEventListener('beforeprint', read);
    return () => window.removeEventListener('beforeprint', read);
  }, []);
  return (
    <div className="ch-qf-printhead" aria-hidden="true">
      <div>
        <b>{data.name}</b>
        <span>{[team, rangeLabel(data.startDate, data.endDate)].filter(Boolean).join(' · ')}</span>
      </div>
      <div>
        <b>GolfHelm</b>
        <span>{printed && `Printed ${printed}`}</span>
      </div>
    </div>
  );
}
