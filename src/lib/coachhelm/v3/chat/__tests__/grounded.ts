import { checkGrounding } from '../grounding';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '../provenance';

/**
 * For the read tests that ask "is an answer built on this read grounded, and is a made-up figure flagged?". They were written against the
 * old prose audit's call shape (`auditNumericClaims(text, measurements, series, details)`); the question is now put to the grounding check
 * (`grounding.ts`), which is what runs after a turn. An empty result means every number in the text came from the read.
 */
export function auditNumericClaims(text: string, measurements: readonly Measurement[] = [], series: readonly MeasurementSeries[] = [], details: unknown = undefined, ..._rest: unknown[]): Array<{ raw: string; text: string; value: number }> {
  return checkGrounding(text, [{ summary: '', measurements: [...measurements], series: [...series], coverage_note: null, detail: details }]).unmatched.map((raw) => ({ raw, text: raw, value: Number(raw.replace('%', '')) }));
}

/** What a read supports besides its measurements: everything it says. The check reads numbers out of it at any depth. */
export const collectEnvelopeNumbers = (envelope: Pick<ToolEnvelope, 'summary'> & { detail?: unknown }): unknown[] => [envelope.summary, envelope.detail];
/** Dates are not figures to the grounding check, so there is nothing to collect. */
export const collectEnvelopeDates = (..._args: unknown[]): string[] => [];
export const collectDates = (..._args: unknown[]): string[] => [];
