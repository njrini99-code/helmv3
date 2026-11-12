'use client';

import type { AskTable } from '../../../../data/coachhelm-chat-thread';
import { Badge, type BadgeTone } from '../../../../ui/Badge';
import { ScrollRegion } from '../../../../ui/ScrollRegion';

/** A figure cell: "58%", "−0.4", "+3.1", "E", "—", "6 of 9", "126 attempts", "27 ft". */
const FIGURE = /^(?:[−+-]?[\d.,]+(?:%| ?(?:ft|yds|of \d+|[a-z]+))?(?: \([^)]*\))?|E|—)$/;
const NONE = '—';

/** The columns a record's line reads as a sentence: a state is its chip, a start and end are one range, a kind or a title is its value alone. */
const STATE = /^(status|state)$/i;
const START = /^(starts?|start (date|time)|from|begins?)$/i;
const END = /^(ends?|end (date|time)|to|until)$/i;
const BARE = /^(type|kind|category|title|name|format)$/i;
/** A word that reads after its value: "High priority", not "Priority High". */
const AFTER = /^(priority|level)$/i;

/** A state's chip tone: done reads positive, under way accent, waiting or late a warning; anything else is neutral. */
export function stateTone(state: string): BadgeTone {
  if (/^(done|complete(d)?|confirmed|met|achieved|final|posted|going)$/i.test(state)) return 'positive';
  if (/^(in progress|active|live|open|upcoming|scheduled|on track)$/i.test(state)) return 'accent';
  if (/^(pending|overdue|late|missed|behind|at risk|waiting|not going|declined)$/i.test(state)) return 'warning';
  return 'neutral';
}

/** "Oct 30, 3 PM" to "Oct 30, 5 PM" is "Oct 30, 3 PM – 5 PM": the end drops the day it shares with the start. */
export function rangeOf(start: string, end: string): string {
  if (start === NONE || !start) return end === NONE ? '' : `Until ${end}`;
  if (end === NONE || !end || end === start) return start;
  const [sDay, ...sTime] = start.split(', ');
  const [eDay, ...eTime] = end.split(', ');
  return sTime.length > 0 && eTime.length > 0 && sDay === eDay ? `${start} – ${eTime.join(', ')}` : `${start} – ${end}`;
}

export interface TableItem {
  title: string;
  state: string | null;
  line: string;
}

/**
 * A table of records (tasks, events, tournaments, goals) as items: the first column is the title, a status column its chip,
 * and the rest one quiet line that reads as a sentence ("Practice · Oct 30, 3 PM – 5 PM · Due Nov 5"). Owner, 2026-11-12,
 * on the ruled grids of words in Ask's answers: "I don't like those tables".
 */
export function itemsOf(table: AskTable): TableItem[] {
  const heads = table.columns;
  const state = heads.findIndex((h, i) => i > 0 && STATE.test(h.trim()));
  const start = heads.findIndex((h, i) => i > 0 && START.test(h.trim()));
  const end = heads.findIndex((h, i) => i > 0 && END.test(h.trim()));
  return table.rows.map((row) => {
    const parts: string[] = [];
    heads.forEach((head, c) => {
      if (c === 0 || c === state || c === end) return;
      const value = (row[c] ?? '').trim();
      if (c === start) {
        const when = rangeOf(value, end >= 0 ? (row[end] ?? '').trim() : NONE);
        if (when) parts.push(when);
        return;
      }
      if (!value || value === NONE) return;
      const h = head.trim();
      parts.push(BARE.test(h) ? value : AFTER.test(h) ? `${value} ${h.toLowerCase()}` : `${h} ${value}`);
    });
    if (start < 0 && end >= 0) {
      const until = (row[end] ?? '').trim();
      if (until && until !== NONE) parts.push(`Until ${until}`);
    }
    const chip = state >= 0 ? (row[state] ?? '').trim() : '';
    return { title: (row[0] ?? '').trim() || NONE, state: chip && chip !== NONE ? chip : null, line: parts.join(' · ') };
  });
}

/**
 * Stays a table: a grid of figures to compare (most of its columns after the first are figures), or two columns, a label and
 * its value, which already read as a list. Anything else is a table of records, drawn as items.
 */
export function staysTable(table: AskTable, numeric: boolean[]): boolean {
  const after = table.columns.length - 1;
  return after <= 1 || numeric.slice(1).filter(Boolean).length * 2 >= after;
}

/**
 * A table of the figures. `labelledBy`: the id of a visible title that already says what the caption would; the table takes
 * its name from that title instead of repeating it in a hidden caption (a screen reader and a copied transcript read it twice).
 * A table of records is drawn as items instead (`itemsOf`); a grid of figures stays a table, where comparing is the point.
 */
export function DataTable({ table, labelledBy }: { table: AskTable; labelledBy?: string }) {
  // A column of figures is set right on tabular numbers; a column of words (a title, a status, a day) reads left, at body weight.
  const numeric = table.columns.map((_, c) => c > 0 && table.rows.length > 0 && table.rows.every((r) => FIGURE.test((r[c] ?? '').trim())));
  if (!staysTable(table, numeric)) {
    return (
      <ul className="ch-th-tablewrap ch-th-items" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : table.caption}>
        {itemsOf(table).map((item, i) => (
          <li key={i}>
            <span className="ch-th-item__top">
              <b>{item.title}</b>
              {item.state && <Badge tone={stateTone(item.state)}>{item.state}</Badge>}
            </span>
            {item.line && <span className="ch-th-item__line">{item.line}</span>}
          </li>
        ))}
      </ul>
    );
  }
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
