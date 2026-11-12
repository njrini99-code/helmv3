'use client';

import type { AskTable } from '../../../../data/coachhelm-chat-thread';
import { ScrollRegion } from '../../../../ui/ScrollRegion';

/** A figure cell: "58%", "−0.4", "+3.1", "E", "—", "6 of 9", "126 attempts", "27 ft". */
const FIGURE = /^(?:[−+-]?[\d.,]+(?:%| ?(?:ft|yds|of \d+|[a-z]+))?(?: \([^)]*\))?|E|—)$/;

/**
 * A table of the figures. `labelledBy`: the id of a visible title that already says what the caption would; the table takes
 * its name from that title instead of repeating it in a hidden caption (a screen reader and a copied transcript read it twice).
 */
export function DataTable({ table, labelledBy }: { table: AskTable; labelledBy?: string }) {
  // A column of figures is set right on tabular numbers; a column of words (a title, a status, a day) reads left, at body weight.
  const numeric = table.columns.map((_, c) => c > 0 && table.rows.length > 0 && table.rows.every((r) => FIGURE.test((r[c] ?? '').trim())));
  return (
    // A keyboard reaches the sideways scroll (F-0042); the caption names it, so two tables never share a name.
    <ScrollRegion label={`${table.caption}, scrolls sideways`} className="ch-th-tablewrap" fade={false}>
      <table className="ch-th-table" aria-labelledby={labelledBy}>
        {!labelledBy && <caption className="ch-th-sr">{table.caption}</caption>}
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className={numeric[i] ? 'is-num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j} className={numeric[j] ? 'is-num' : 'is-text'}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
