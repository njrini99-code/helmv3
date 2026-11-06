'use client';
import { plural } from '../../../lib/plural';

import { formatSigned, changeTone } from '../../../lib/format';
import { STATIONS, type ChStation, type ChTeamBoardData } from '../../../data/coachhelm-team-shape';
import { STATION_NAME, STATION_SHORT } from './hole-geometry';

/** Five equal chips: four spots, then Course after a hairline; its value is the read count (AC-HOLE-07, 14). */
export function StationControl({
  value,
  onChange,
  stations,
  courseReads,
  courseTab,
}: {
  value: ChStation | 'course';
  onChange: (s: ChStation | 'course') => void;
  stations: ChTeamBoardData['stations'];
  courseReads: number;
  courseTab: boolean;
}) {
  const words = courseReads === 0 ? 'No reads' : plural(courseReads, 'read');
  return (
    <div className="stchips" role="group" aria-label="Spots on the hole, and Course" style={courseTab ? undefined : { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      {STATIONS.map((s) => {
        const v = stations[s].team;
        return (
          <button key={s} type="button" aria-pressed={value === s} aria-label={`${STATION_NAME[s]}, ${v == null ? 'not measured' : `${formatSigned(v)} a round`}`} onClick={() => onChange(s)}>
            {STATION_SHORT[s]}
            <b className={!changeTone(v, false) ? 'is-even' : changeTone(v, false) === 'is-gain' ? 'is-gain' : undefined}>{v == null ? '—' : formatSigned(v)}</b>
          </button>
        );
      })}
      {courseTab && (
        <button type="button" className="cm" data-ch-team-station="course" aria-pressed={value === 'course'} aria-label={`Course and scoring, ${courseReads} open reads`} onClick={() => onChange('course')}>
          Course
          <b>{words}</b>
        </button>
      )}
    </div>
  );
}
