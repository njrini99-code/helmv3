/**
 * Provider-state redaction. Use cases compile compact evidence by
 * construction; this is the safety net that runs on every state anyway.
 *
 * - keys that name a person or a secret are dropped wherever they appear;
 * - strings shaped like emails, phone numbers, JWTs or bearer tokens are
 *   masked;
 * - strings are bounded (a 4 000-char field is a log, not evidence);
 * - depth and array length are bounded so a stray full row cannot ride in.
 */

const DROP_KEY = /(^|_)(email|e_mail|phone|password|passwd|secret|token|cookie|authorization|api_key|apikey|access_key|session|jwt|ssn|address)($|_)|(first|last|full|player|coach|user|display)_?name$/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d[\s().-]*){10,}/g;
const JWT = /\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g;
const BEARER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const SECRET_SHAPE = /\b(sk|apikey|key|tok|pat|ghp|xox[abp])[_-][A-Za-z0-9_-]{16,}\b/g;

export const REDACT_LIMITS = {
  maxStringLength: 600,
  maxDepth: 6,
  maxArrayLength: 64,
  maxKeys: 80,
} as const;

export function redactString(value: string): string {
  let out = value;
  if (out.length > REDACT_LIMITS.maxStringLength) out = `${out.slice(0, REDACT_LIMITS.maxStringLength)}…`;
  out = out.replace(JWT, '[jwt]').replace(BEARER, '$1 [token]').replace(SECRET_SHAPE, '[secret]');
  out = out.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  return out;
}

export function redactState<T>(value: T, depth = 0): T {
  if (depth > REDACT_LIMITS.maxDepth) return '[depth]' as unknown as T;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.slice(0, REDACT_LIMITS.maxArrayLength).map((v) => redactState(v, depth + 1)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEY.test(key)) continue;
      if (++n > REDACT_LIMITS.maxKeys) break;
      out[key] = redactState(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
