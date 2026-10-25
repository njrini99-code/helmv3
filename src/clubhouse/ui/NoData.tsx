import { NO_DATA } from '../lib/format';

/**
 * The no-data mark (row 46): the em dash a figure shows when there is nothing to show, in tertiary ink so it reads
 * (4.5:1, not the 1.7-2.1:1 of a faint ink), hidden from a screen reader, which hears `label` instead of "dash". A
 * formatter returns NO_DATA as a string and can't carry this markup, so a figure that can be empty renders this.
 */
export function NoData({ label = 'No data' }: { label?: string }) {
  return (
    <span className="ch-nodata">
      <span aria-hidden="true">{NO_DATA}</span>
      <span className="ch-sr-only">{label}</span>
    </span>
  );
}
