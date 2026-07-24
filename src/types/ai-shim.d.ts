// Ambient module declaration for the `ai` package (Vercel AI SDK v6).
//
// The package ships its own types via `node_modules/ai/dist/index.d.ts` and
// exposes them via the `exports` map. In practice, TypeScript's bundler
// resolver prefers this ambient declaration over the real package types
// (despite the docs claiming it would merge), so this file MUST declare
// every surface the codebase actually uses. When you add a new ai-package
// import elsewhere in src/, declare it here too.
//
// Original motivation: Vercel's `next build --webpack` TypeScript step
// intermittently fails to resolve `ai` even after `npm ci` succeeds.
// This shim is the backstop that keeps Vercel builds green.
declare module 'ai' {
  // -------------------------------------------------------------------------
  // generateText (used by v3/llm/compose.ts + legacy round-recap.ts)
  // -------------------------------------------------------------------------
  export interface GenerateTextOptions {
    model: unknown;
    prompt?: string;
    messages?: unknown;
    temperature?: number;
    maxRetries?: number;
    maxTokens?: number;
    maxOutputTokens?: number;
    experimental_telemetry?: unknown;
    [key: string]: unknown;
  }
  export interface GenerateTextResult {
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    toolCalls?: Array<{ toolCallId: string; toolName: string; input?: unknown }>;
    toolResults?: Array<{ toolCallId: string; toolName: string; output?: unknown }>;
    [key: string]: unknown;
  }
  export function generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;

  // -------------------------------------------------------------------------
  // generateObject (used by lib/golf/schedule-vision.ts)
  // The schema generic infers the output type from any zod-like schema via
  // its parse() signature, so callers get a typed `object` back.
  // -------------------------------------------------------------------------
  export interface GenerateObjectResult<T> {
    object: T;
    usage?: { inputTokens?: number; outputTokens?: number };
    [key: string]: unknown;
  }
  export function generateObject<T>(options: {
    model: unknown;
    schema: { parse(input: unknown): T };
    prompt?: string;
    messages?: unknown;
    temperature?: number;
    maxRetries?: number;
    maxOutputTokens?: number;
    [key: string]: unknown;
  }): Promise<GenerateObjectResult<T>>;

  // -------------------------------------------------------------------------
  // ModelMessage — used to type chat history fed into the agent
  // -------------------------------------------------------------------------
  export type ModelMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };

  // -------------------------------------------------------------------------
  // tool() helper — wraps a tool definition for the agent
  // -------------------------------------------------------------------------
  export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    description?: string;
    inputSchema?: unknown;
    execute?: (input: TInput) => Promise<TOutput> | TOutput;
  }
  export function tool<TInput, TOutput>(
    def: ToolDefinition<TInput, TOutput>,
  ): ToolDefinition<TInput, TOutput>;

  // -------------------------------------------------------------------------
  // ToolLoopAgent — the agent class our W32 coach chat uses
  // -------------------------------------------------------------------------
  export interface ToolLoopAgentSettings {
    model: unknown;
    instructions?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools?: Record<string, ToolDefinition<any, any>>;
    [key: string]: unknown;
  }
  export interface AgentGenerateParameters {
    prompt?: string | ModelMessage[];
    messages?: ModelMessage[];
    [key: string]: unknown;
  }
  export class ToolLoopAgent {
    constructor(settings: ToolLoopAgentSettings);
    generate(params: AgentGenerateParameters): Promise<GenerateTextResult>;
  }
}
