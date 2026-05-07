// Ambient module declaration for the `ai` package (Vercel AI SDK v6).
//
// The package ships its own types via `node_modules/ai/dist/index.d.ts` and
// exposes them via the `exports` map. Local builds resolve them without
// issue. Vercel's `next build --webpack` TypeScript step intermittently fails
// to resolve the module ("TS2307: Cannot find module 'ai'") even after
// `npm ci added 801 packages`, while webpack itself compiles successfully.
//
// This declaration is a backstop: if Vercel's TS resolver can't reach the
// real types, it falls back to this shim, which at minimum declares the
// surface our codebase actually uses (`generateText`). Locally and in any
// environment where module resolution works normally, the real package
// types take precedence — TypeScript merges declarations and prefers the
// resolved-from-disk version.
declare module 'ai' {
  export interface GenerateTextOptions {
    model: unknown;
    prompt?: string;
    messages?: unknown;
    temperature?: number;
    maxRetries?: number;
    maxTokens?: number;
    experimental_telemetry?: unknown;
    [key: string]: unknown;
  }
  export interface GenerateTextResult {
    text: string;
    [key: string]: unknown;
  }
  export function generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
}
