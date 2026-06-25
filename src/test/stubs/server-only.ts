// Test stub for the `server-only` package.
//
// `server-only` is a build-time guard with no runtime behavior — its sole job is
// to make Next.js error if a server module is imported into a client bundle. The
// package is not installed as a standalone module in this repo (Next provides
// it), so Vitest cannot resolve the bare `import 'server-only'`. This empty
// module is aliased to `server-only` in vitest.config.ts so server-scoped
// modules (e.g. with-baseball-action.ts, player-access.ts) can be exercised in
// integration tests without pulling Next's bundler resolution.
export {};
