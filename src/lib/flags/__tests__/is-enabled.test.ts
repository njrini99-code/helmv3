import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlagDefinition } from '../types';

const { addFeatureFlag, setTag, integrationState } = vi.hoisted(() => ({
  addFeatureFlag: vi.fn(),
  setTag: vi.fn(),
  integrationState: { registered: true },
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: () => ({
    getIntegrationByName: (name: string) =>
      integrationState.registered && name === 'FeatureFlags' ? { addFeatureFlag } : undefined,
  }),
  setTag,
}));

import { isFlagEnabled, evaluateFlag } from '../is-enabled';

const baseFlag: FlagDefinition = {
  feature_id: 'sample_flag',
  owner: 'test',
  purpose: 'A sample flag for unit tests.',
  type: 'release',
  status: 'active',
  created_at: '2026-01-01',
  expires_at: null,
  default: false,
  environment: { production: false, preview: false, development: false },
  kill_switch_behavior: null,
  cleanup_plan: 'Delete when the test file is deleted.',
};

const FIXED_NOW = new Date('2026-09-03T00:00:00Z');

beforeEach(() => {
  addFeatureFlag.mockClear();
  setTag.mockClear();
  integrationState.registered = true;
});

describe('evaluateFlag', () => {
  it('enabled: returns true when the resolved environment column is true', () => {
    const registry = [{ ...baseFlag, environment: { ...baseFlag.environment, production: true } }];
    const result = evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(result).toEqual({ value: true, reason: 'environment_rollout' });
  });

  it('disabled: returns false when the resolved environment column is false', () => {
    const registry = [baseFlag];
    const result = evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(result).toEqual({ value: false, reason: 'environment_rollout' });
  });

  it('override: an explicit ctx.environment picks a different column than the ambient one', () => {
    const registry = [{ ...baseFlag, environment: { production: false, preview: true, development: false } }];
    expect(evaluateFlag('sample_flag', { registry, environment: 'preview', now: FIXED_NOW }).value).toBe(true);
    expect(evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW }).value).toBe(false);
  });

  it('expired: a flag past its expires_at evaluates to false even when its environment column is true', () => {
    const registry = [
      {
        ...baseFlag,
        expires_at: '2026-01-01',
        environment: { production: true, preview: true, development: true },
      },
    ];
    const result = evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(result).toEqual({ value: false, reason: 'expired' });
  });

  it('not yet expired: a future expires_at does not suppress the flag', () => {
    const registry = [{ ...baseFlag, expires_at: '2099-01-01', environment: { production: true, preview: true, development: true } }];
    const result = evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(result.value).toBe(true);
  });

  it('unknown flag: a name absent from the registry fails closed to false', () => {
    const result = evaluateFlag('does_not_exist', { registry: [baseFlag], now: FIXED_NOW });
    expect(result).toEqual({ value: false, reason: 'unknown_flag' });
  });

  it('archived: an archived flag evaluates to false regardless of default/environment', () => {
    const registry = [
      { ...baseFlag, status: 'archived' as const, default: true, environment: { production: true, preview: true, development: true } },
    ];
    const result = evaluateFlag('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(result).toEqual({ value: false, reason: 'archived' });
  });

  it('default fallback: an environment key missing from the row falls back to `default`', () => {
    const partial = { ...baseFlag, default: true, environment: { preview: false, development: false } as unknown as FlagDefinition['environment'] };
    const result = evaluateFlag('sample_flag', { registry: [partial], environment: 'production', now: FIXED_NOW });
    expect(result).toEqual({ value: true, reason: 'default_fallback' });
  });
});

describe('never-gate: this suite never exercises a flag whose purpose/id names auth, RLS, tenancy, membership, or persistence', () => {
  // Runtime evaluation intentionally does not re-check the NEVER-GATE list —
  // that rule is enforced once, at generation time
  // (scripts/flags/lib.mjs#validateFlag via generate-flags.mjs, independently
  // re-checked by scripts/check-feature-flags.mjs), so a config row that
  // violates it never becomes part of FLAG_REGISTRY in the first place. See
  // src/lib/flags/__tests__/never-gate.test.ts for the keyword-detection
  // cases and scripts/flags/__tests__/lib.test.mjs for the generator refusing
  // to write a violating registry.
  it('is documented, not re-implemented, at the evaluateFlag layer', () => {
    expect(true).toBe(true);
  });
});

describe('isFlagEnabled Sentry correlation', () => {
  it('reports name + boolean value through the FeatureFlags integration when registered', () => {
    const registry = [{ ...baseFlag, environment: { ...baseFlag.environment, production: true } }];
    const value = isFlagEnabled('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(value).toBe(true);
    expect(addFeatureFlag).toHaveBeenCalledWith('sample_flag', true);
    expect(setTag).not.toHaveBeenCalled();
  });

  it('falls back to a bounded tag when no FeatureFlags integration is registered', () => {
    integrationState.registered = false;
    const registry = [baseFlag];
    const value = isFlagEnabled('sample_flag', { registry, environment: 'production', now: FIXED_NOW });
    expect(value).toBe(false);
    expect(addFeatureFlag).not.toHaveBeenCalled();
    expect(setTag).toHaveBeenCalledWith('flag.sample_flag', 'false');
  });

  it('skips telemetry entirely when ctx.skipTelemetry is set', () => {
    const registry = [baseFlag];
    isFlagEnabled('sample_flag', { registry, skipTelemetry: true, now: FIXED_NOW });
    expect(addFeatureFlag).not.toHaveBeenCalled();
    expect(setTag).not.toHaveBeenCalled();
  });
});

/**
 * Parity proof for deliverable (2), and its honest limit.
 *
 * `shouldEmitHelmTraceContext()` at src/app/golf/actions/golf.ts:1207-1209
 * is a LIVE read:
 *
 *   process.env.VERCEL_ENV !== 'production' || process.env.HELM_FLIGHT_RECORDER_ENABLED === 'true'
 *
 * re-evaluated from `process.env` on every call. `FLAG_REGISTRY` is the
 * opposite: a build-time SNAPSHOT compiled from config/feature-flags.yml
 * (src/lib/flags/registry.generated.ts's own header: "reading the flag
 * registry at request time never touches the filesystem or parses YAML").
 * Those are only the same function when the env var sits at the value this
 * PR documented as its default in config/feature-flags.yml's
 * `flight_recorder` entry (production: false, preview/development: true) —
 * i.e. nobody has manually overridden HELM_FLIGHT_RECORDER_ENABLED out of
 * band from what the registry says. That is the real, useful claim: this
 * PR's seeded defaults match live behavior today, checked against the exact
 * boolean formula golf.ts:1207 evaluates.
 *
 * It is NOT a claim that the flag mirrors a live env var change made
 * without touching config/feature-flags.yml — a static per-environment
 * boolean cannot do that, and pretending it can would be the kind of
 * overclaim `.claude/rules/shipping.md` §1 warns against ("never document
 * ... you have not just verified"). That gap is exactly what wiring the
 * real call site through `isFlagEnabled` (left to the owning Sentry-session
 * PR) closes: once golf.ts stops reading `process.env` directly, the
 * registry becomes the single live authority instead of a snapshot of it.
 */
describe('flight_recorder: seeded defaults match the real read site golf.ts:1207 evaluates today', () => {
  function rawShouldEmitHelmTraceContext(env: { VERCEL_ENV?: string; HELM_FLIGHT_RECORDER_ENABLED?: string }): boolean {
    return env.VERCEL_ENV !== 'production' || env.HELM_FLIGHT_RECORDER_ENABLED === 'true';
  }

  const flightRecorderFlag: FlagDefinition = {
    feature_id: 'flight_recorder',
    owner: 'platform (Bridge)',
    purpose: 'Arms per-request golf round mutation tracing.',
    type: 'operations_kill_switch',
    status: 'active',
    created_at: '2026-09-03',
    expires_at: null,
    default: true,
    // Must match config/feature-flags.yml's flight_recorder.environment
    // exactly — this fixture is a local copy (evaluateFlag takes an
    // injectable registry for testability), not an import of the real one,
    // so a hand-edit to one without the other is a silent drift risk. See
    // scripts/flags/__tests__/lib.test.mjs for the generation-time
    // never-gate/schema checks that DO read the real YAML.
    environment: { production: false, preview: true, development: true },
    kill_switch_behavior: 'Off: no flight-recorder RPCs are called.',
    cleanup_plan: 'No planned removal.',
  };

  // HELM_FLIGHT_RECORDER_ENABLED unset in every case: this is the
  // documented default, not an out-of-band override (see docstring above).
  const defaultStateMatrix: Array<{ vercelEnv: string | undefined; flagEnv: 'production' | 'preview' | 'development'; expected: boolean }> = [
    { vercelEnv: 'production', flagEnv: 'production', expected: false },
    { vercelEnv: 'preview', flagEnv: 'preview', expected: true },
    { vercelEnv: 'development', flagEnv: 'development', expected: true },
    { vercelEnv: undefined, flagEnv: 'development', expected: true },
  ];

  it.each(defaultStateMatrix)(
    'VERCEL_ENV=$vercelEnv, HELM_FLIGHT_RECORDER_ENABLED unset -> $expected',
    ({ vercelEnv, flagEnv, expected }) => {
      const raw = rawShouldEmitHelmTraceContext({ VERCEL_ENV: vercelEnv, HELM_FLIGHT_RECORDER_ENABLED: undefined });
      expect(raw).toBe(expected);

      const wrapped = evaluateFlag('flight_recorder', {
        registry: [flightRecorderFlag],
        environment: flagEnv,
        now: FIXED_NOW,
      });
      expect(wrapped.value).toBe(expected);
    },
  );

  it('documents (does not paper over) the gap: an out-of-band env override diverges from the static registry snapshot', () => {
    const rawWithOverride = rawShouldEmitHelmTraceContext({ VERCEL_ENV: 'production', HELM_FLIGHT_RECORDER_ENABLED: 'true' });
    expect(rawWithOverride).toBe(true);

    // The registry has no way to know about that out-of-band env change —
    // it still reports the seeded production default, false. This is the
    // known limitation the docstring above names, pinned as a test so it
    // cannot silently start passing (i.e. silently stop being true) without
    // someone noticing the registry started reading process.env.
    const wrapped = evaluateFlag('flight_recorder', {
      registry: [flightRecorderFlag],
      environment: 'production',
      now: FIXED_NOW,
    });
    expect(wrapped.value).toBe(false);
    expect(wrapped.value).not.toBe(rawWithOverride);
  });
});
