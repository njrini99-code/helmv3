/**
 * Input validation and the result shape for `recordCoachHelmCorrection`
 * (src/app/golf/actions/coachhelm-corrections.ts). Kept out of the
 * `'use server'` module so the schema can be unit-tested directly and no type
 * is re-exported across the server-action boundary.
 *
 * The author, the role and the player are never taken from the client: the
 * action derives them from the session and the insight row.
 */
import { z } from 'zod';
import {
  ALTERNATIVE_CAUSE_MAX,
  CORRECTION_KINDS,
  CORRECTION_REASONS,
  FREE_TEXT_MAX,
} from './types';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const correctionInputSchema = z
  .object({
    insightId: z.string().uuid(),
    kind: z.enum(CORRECTION_KINDS),
    reason: z.enum(CORRECTION_REASONS).nullish().transform((v) => v ?? null),
    alternativeCauseLabel: optionalText(ALTERNATIVE_CAUSE_MAX),
    freeText: optionalText(FREE_TEXT_MAX),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason !== null && value.kind !== 'not_this') {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason only goes with "Not this".',
      });
    }
    if (value.alternativeCauseLabel !== null && value.kind !== 'wrong_cause') {
      ctx.addIssue({
        code: 'custom',
        path: ['alternativeCauseLabel'],
        message: 'An alternative cause only goes with "Wrong cause".',
      });
    }
  });

export type CorrectionInput = z.input<typeof correctionInputSchema>;
export type ParsedCorrectionInput = z.output<typeof correctionInputSchema>;

export type CorrectionResult =
  | { status: 'recorded'; id: string }
  /** Flag off, or the held table is not there yet. Nothing was written. */
  | { status: 'not_available'; reason: 'flag_off' | 'table_missing' }
  | { status: 'invalid'; error: string }
  | { status: 'forbidden'; error: string }
  | { status: 'failed'; error: string };

/** Parse, returning the first problem as a sentence instead of throwing. */
export function parseCorrectionInput(
  input: unknown,
): { ok: true; value: ParsedCorrectionInput } | { ok: false; error: string } {
  const parsed = correctionInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, error: `${where}${issue?.message ?? 'Invalid correction.'}` };
}
