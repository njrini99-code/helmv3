import { Fragment } from 'react';

/**
 * Text for a display-serif heading that comes from data (an insight, an announcement, a trip or qualifier name). The
 * display serif's figures read poorly (its 1 has no flag, so 11 reads as ll), so every run of digits, with the
 * separators inside it, is set in the sans at the serif's optical size (`.ch-serif-num`). Words stay in the serif.
 */
export function SerifText({ text }: { text: string }) {
  const parts = text.split(/(\d[\d.,:/–-]*\d|\d)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="ch-serif-num">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
