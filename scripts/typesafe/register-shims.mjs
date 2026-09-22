// Node `--import` hook for running server-only modules under tsx.
//
// `server-only` is a Next.js build-time marker resolved by webpack; plain Node
// cannot resolve the bare specifier at all. This maps it to an empty module so
// scripts/typesafe/eval.ts can import src/lib/typesafe/** unchanged, leaving
// the guard intact for the app build. Same idea as vitest.config.ts's stub.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,', shortCircuit: true };
  }
  return next(specifier, context);
}
`),
);
