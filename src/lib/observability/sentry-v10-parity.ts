/**
 * Options that keep `@sentry/nextjs` v11 behaving the way v10 did.
 *
 * v11 changed several defaults that TypeScript cannot catch (sentry-javascript
 * MIGRATION.md, "Upgrading from 10.x to 11.x"). Every `Sentry.init` in this
 * repo (Node + Edge in `src/instrumentation.ts`, browser via
 * `src/lib/sentry-client-options.ts`) spreads this object so the upgrade
 * changes no data, sampling, grouping or tag behavior:
 *
 * - `traceLifecycle: 'static'` — v11 streams spans by default. Streamed spans
 *   carry attributes only, so scope tags (`sport`, `feature`, `action`, set by
 *   the action wrappers and `logServerError`) would stop reaching
 *   transactions, span names become low-cardinality (dashboards and saved
 *   searches key on today's names), and web vitals switch to per-soft-
 *   navigation reporting. 'static' keeps the v10 transaction model. Moving to
 *   streaming is a separate owner decision (span quota and dashboards), not
 *   part of a dependency bump.
 * - `attachStacktrace: false` — v11 defaults it to `true`, which attaches a
 *   synthetic stack to every `captureMessage` and every console-origin event
 *   from `captureConsoleIntegration`. That regroups existing issues and marks
 *   those sessions errored.
 * - `dataCollection` — replaces `sendDefaultPii`, and leaving it unset is MORE
 *   permissive in v11 (user IP, cookies, all HTTP bodies, DB query values, AI
 *   inputs/outputs). This is the exact baseline v10 used when `sendDefaultPii`
 *   was unset — copied from v10.76.0's own
 *   `@sentry/core/build/esm/utils/data-collection/defaultPiiToCollectionOptions.js`
 *   (the `sendDefaultPii !== true` branch), plus `queues: false`, a category
 *   v10 did not collect at all.
 *
 * Pure data with no SDK import at runtime, so the browser bundle and the unit
 * tests can both use it.
 */
import type { NodeOptions } from '@sentry/nextjs';

/** v10's `PII_HEADER_SNIPPETS` (@sentry/core 10.76.0 filtering-snippets.js). */
const V10_PII_HEADER_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

export const SENTRY_V10_DATA_COLLECTION = {
  userInfo: false,
  cookies: { deny: V10_PII_HEADER_SNIPPETS },
  httpHeaders: {
    request: { deny: V10_PII_HEADER_SNIPPETS },
    response: { deny: V10_PII_HEADER_SNIPPETS },
  },
  httpBodies: [],
  urlQueryParams: { deny: V10_PII_HEADER_SNIPPETS },
  // v10 attached the (literal-redacted) GraphQL document regardless of
  // sendDefaultPii; kept identical.
  graphQL: { document: true, variables: true },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: true,
  frameContextLines: 7,
} satisfies NonNullable<NodeOptions['dataCollection']>;

export const SENTRY_V10_PARITY_OPTIONS = {
  traceLifecycle: 'static',
  attachStacktrace: false,
  dataCollection: SENTRY_V10_DATA_COLLECTION,
} as const satisfies Pick<NodeOptions, 'traceLifecycle' | 'attachStacktrace' | 'dataCollection'>;
