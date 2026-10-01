'use client';

import { useMemo } from 'react';
import type { ChRecruiting } from '../../data/recruiting-shape';
import { RecruitingView } from './RecruitingView';
import { createLiveRecruitingWrites } from './writes';
import '../../styles/recruiting.css';

/** Recruiting with the current page's own server actions behind it. The preview and the tests use `RecruitingView` with their own writes. */
export function Recruiting({ data }: { data: ChRecruiting }) {
  const writes = useMemo(() => createLiveRecruitingWrites(), []);
  return <RecruitingView data={data} writes={writes} />;
}
