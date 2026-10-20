import {
  CREDENTIALS_MESSAGE,
  NETWORK_MESSAGE,
  RATE_LIMIT_MESSAGE,
  STALE_BUNDLE_MESSAGE,
  UNEXPECTED_MESSAGE,
  UNVERIFIED_MESSAGE,
  invalidFieldFor,
  type InvalidField,
} from '@/lib/auth/golf-sign-in-logic';

/**
 * How a failed sign-in is drawn and felt. The words come from the shared
 * `getErrorMessage` (unchanged); this adds only what the design gives each kind:
 * a tone for the notice, the haptic, which fields are marked, and the catalog
 * number (docs/clubhouse/catalog/auth.md).
 */
export type FailureTone = 'danger' | 'warning' | 'info';

export interface SignInFailure {
  message: string;
  /** A second line the server added, kept as it was said ("2 attempts remaining"). */
  detail?: string;
  tone: FailureTone;
  haptic: 'warning' | 'error';
  field: InvalidField;
  code: string;
}

/**
 * The sign-in action's own wrong-password text ("Invalid email or password",
 * sometimes with "(2 attempts remaining)") is not one the shared
 * getErrorMessage rewrites, so today's form shows it raw and marks no field.
 * Here it is the design's words with both fields marked, and the attempts
 * line kept under it (Q-98). Clubhouse only: today's form is unchanged.
 */
const SERVER_CREDENTIALS = /^invalid email or password\s*(?:\((\d+) attempts? remaining\))?/i;

export function failureForServer(raw: string, mapped: string): SignInFailure {
  const m = raw.trim().match(SERVER_CREDENTIALS);
  if (!m) return failureFor(mapped);
  const n = m[1] ? Number(m[1]) : null;
  const detail = n === null ? undefined : n === 1 ? '1 attempt remaining before the account is locked for a while.' : `${n} attempts remaining before the account is locked for a while.`;
  return { ...failureFor(CREDENTIALS_MESSAGE), ...(detail ? { detail } : {}) };
}

export function failureFor(message: string): SignInFailure {
  const field = invalidFieldFor(message);
  switch (message) {
    case CREDENTIALS_MESSAGE:
      return { message, tone: 'danger', haptic: 'error', field, code: 'CH-15001' };
    case UNVERIFIED_MESSAGE:
      return { message, tone: 'warning', haptic: 'warning', field, code: 'CH-15002' };
    case RATE_LIMIT_MESSAGE:
      return { message, tone: 'warning', haptic: 'warning', field, code: 'CH-15003' };
    case NETWORK_MESSAGE:
      return { message, tone: 'danger', haptic: 'error', field, code: 'CH-15004' };
    case STALE_BUNDLE_MESSAGE:
      return { message, tone: 'info', haptic: 'error', field, code: 'CH-15005' };
    case UNEXPECTED_MESSAGE:
      return { message, tone: 'danger', haptic: 'error', field, code: 'CH-15006' };
    default:
      // The server's own words (an account lockout, "Invalid email or password (2 attempts remaining)") pass through.
      return { message, tone: 'danger', haptic: 'error', field, code: 'CH-15007' };
  }
}
