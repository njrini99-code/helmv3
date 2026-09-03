import { describe, expect, it } from 'vitest';
import { detectLiveProofVerified } from '../checks/db-observability.mjs';

/**
 * Regression coverage for the false-positive found and fixed while building
 * this check: an earlier, unanchored regex matched the trace-propagation
 * doc's OWN instructional prose (which necessarily quotes the target string
 * to explain how to set it) as if the marker had actually been set.
 */
describe('detectLiveProofVerified', () => {
  it('is false when the marker says NOT VERIFIED', () => {
    expect(detectLiveProofVerified('**live-proof: NOT VERIFIED**\n')).toBe(false);
  });

  it('is true when the marker says VERIFIED, at line start', () => {
    expect(detectLiveProofVerified('**live-proof: VERIFIED**\n')).toBe(true);
  });

  it('is case-insensitive on the VERIFIED token', () => {
    expect(detectLiveProofVerified('**live-proof: verified**\n')).toBe(true);
  });

  it('REGRESSION: is false when prose merely discusses/quotes the marker mid-sentence', () => {
    const proseAboutTheMarker = [
      '**live-proof: NOT VERIFIED**',
      '',
      'When the owner completes the procedure, update the line to read',
      '`live-proof: VERIFIED` and re-run the doctor.',
      '',
      'Update the `live-proof:` line above to `VERIFIED` and re-run',
      '`npm run repo:doctor` to confirm the live-proof sub-check picks it up.',
    ].join('\n');
    expect(detectLiveProofVerified(proseAboutTheMarker)).toBe(false);
  });

  it('is false for an empty or unrelated document', () => {
    expect(detectLiveProofVerified('')).toBe(false);
    expect(detectLiveProofVerified('# Some other doc\n\nNothing to see here.\n')).toBe(false);
  });

  it('does not require the marker to be the first line of the file', () => {
    const doc = '# Heading\n\nSome preamble text.\n\n**live-proof: VERIFIED**\n\nMore text.\n';
    expect(detectLiveProofVerified(doc)).toBe(true);
  });

  it('requires the bold wrapper — a bare "live-proof: VERIFIED" without ** does not count', () => {
    expect(detectLiveProofVerified('live-proof: VERIFIED\n')).toBe(false);
  });
});
