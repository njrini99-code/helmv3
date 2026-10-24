/**
 * A chart's figures as a table for a screen reader (AX-17, row 120): the chart's name is its summary, read first; this table
 * follows it in the reading order, visually hidden, for whoever asks for the numbers by moving into it. Every chart that
 * draws a set of figures renders one, so no figure is reachable only by sight or by a pointer.
 */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return null;
  return (
    <table className="ch-sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
