import { ChevronDown, Users } from 'lucide-react';
import type { ChTeamPatterns } from '../../data/coachhelm-team-pattern';
import { Icon } from '../../ui/Icon';
import '../../styles/coachhelm-patterns.css';

/**
 * Team pattern (CoachHelm supercharge Slice 7b, `04` Layout 4 and Example 8;
 * flag `coachhelm_team_pattern_v1`, off): up to four cause families shared by
 * enough of the roster, each with how many players, the team strokes at stake
 * and the one practice block, opening to the members and their numbers. A
 * counted line names the families under the threshold, never who. Coach only.
 */
export function TeamPatterns({ data }: { data: ChTeamPatterns }) {
  return (
    <section className="ch-hl-tp" aria-labelledby="ch-hl-tp-h" data-ch-code="CH-13995">
      <h2 id="ch-hl-tp-h">Team patterns</h2>
      <p className="ch-hl-tp__reach">{data.reach}</p>
      {data.rows.length === 0 ? (
        <p className="ch-hl-tp__none">No read is shared by enough players to call a team pattern.</p>
      ) : (
        <ol>
          {data.rows.map((r) => (
            <li key={r.id}>
              <details className="ch-hl-tp__row">
                <summary>
                  <span className="ch-hl-tp__ic" aria-hidden>
                    <Icon icon={Users} size={15} />
                  </span>
                  <span className="ch-hl-tp__t">
                    <b>{r.title}</b>
                    <span>
                      {r.members}
                      {r.strokes ? ` · ${r.strokes}` : ''}
                    </span>
                  </span>
                  <Icon icon={ChevronDown} size={16} />
                </summary>
                {r.next && (
                  <p className="ch-hl-tp__next">
                    <b>Practice block.</b> {r.next}
                  </p>
                )}
                <ul aria-label={`Players in ${r.title}`}>
                  {r.who.map((m, i) => (
                    <li key={`${m.name}-${i}`}>
                      <span>{m.name}</span>
                      <span className="ch-num">{m.value ?? '–'}</span>
                      <em>{m.ladder}</em>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
      {data.below && <p className="ch-hl-tp__below">{data.below}</p>}
    </section>
  );
}
