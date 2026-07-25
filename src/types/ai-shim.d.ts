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
  //
  // `inputSchema` is typed as a zod-like parser so TInput is INFERRED from the
  // schema. Without that, every `execute(input)` lands as `unknown` and each
  // tool needs a hand-written cast — which is exactly where a wrong shape slips
  // through unnoticed.
  // -------------------------------------------------------------------------
  export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    description?: string;
    inputSchema?: unknown;
    execute?: (input: TInput, options?: unknown) => Promise<TOutput> | TOutput;
    /**
     * Fires once the model has finished writing the tool input, BEFORE the
     * approval gate and before `execute`. This is where a confirm-required
     * tool computes and streams its preview.
     */
    onInputAvailable?: (options: {
      input: TInput;
      toolCallId?: string;
      [key: string]: unknown;
    }) => void | Promise<void>;
    needsApproval?: boolean;
  }
  export function tool<TInput, TOutput>(def: {
    description?: string;
    inputSchema: { parse(input: unknown): TInput };
    execute?: (input: TInput, options?: unknown) => Promise<TOutput> | TOutput;
    onInputAvailable?: (options: {
      input: TInput;
      toolCallId?: string;
      [key: string]: unknown;
    }) => void | Promise<void>;
    needsApproval?: boolean;
  }): ToolDefinition<TInput, TOutput>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ToolSet = Record<string, ToolDefinition<any, any>>;

  // -------------------------------------------------------------------------
  // UI message streaming (AI SDK 7) — the transport the coach chat runs on
  // -------------------------------------------------------------------------
  export type UIMessagePart =
    | { type: 'text'; text: string; state?: string }
    | { type: 'step-start' }
    | { type: `data-${string}`; id?: string; data: unknown }
    | { type: `tool-${string}`; toolCallId: string; state: string; input?: unknown; output?: unknown; approval?: unknown; errorText?: string }
    | { type: string; [key: string]: unknown };

  export interface UIMessage<METADATA = unknown> {
    id: string;
    role: 'system' | 'user' | 'assistant';
    parts: UIMessagePart[];
    metadata?: METADATA;
  }

  export interface UIMessageStreamWriter {
    write(part: { type: string; id?: string; data?: unknown; [key: string]: unknown }): void;
    merge(stream: unknown): void;
  }

  /**
   * HTTP transport for `useChat`. `prepareSendMessagesRequest` is where the
   * conversation id and the per-turn idempotency key are attached to the body.
   */
  export class DefaultChatTransport<UI_MESSAGE extends UIMessage = UIMessage> {
    constructor(options: {
      api: string;
      headers?: Record<string, string>;
      credentials?: RequestCredentials;
      prepareSendMessagesRequest?: (options: {
        messages: UI_MESSAGE[];
        id?: string;
        trigger?: string;
        [key: string]: unknown;
      }) => { body?: unknown; headers?: Record<string, string>; [key: string]: unknown };
      [key: string]: unknown;
    });
  }

  export function createUIMessageStream(options: {
    execute: (options: { writer: UIMessageStreamWriter }) => void | Promise<void>;
    onFinish?: (options: { messages: UIMessage[]; [key: string]: unknown }) => void | Promise<void>;
    onError?: (error: unknown) => string;
    [key: string]: unknown;
  }): unknown;

  export function createUIMessageStreamResponse(options: {
    stream: unknown;
    headers?: Record<string, string>;
    [key: string]: unknown;
  }): Response;

  /**
   * ASYNC in AI SDK 7 — returns a Promise. Declaring it synchronous here
   * type-checked fine and then handed `streamText` a Promise, which failed at
   * runtime with "messages.some is not a function". Keep this in step with
   * `node_modules/ai/dist/index.d.ts`.
   */
  export function convertToModelMessages(
    messages: UIMessage[],
    options?: { tools?: ToolSet; ignoreIncompleteToolCalls?: boolean },
  ): Promise<ModelMessage[]>;

  export function stepCountIs(count: number): unknown;

  export interface StreamTextResult {
    toUIMessageStream(options?: Record<string, unknown>): unknown;
    text: Promise<string>;
    usage: Promise<{ inputTokens?: number; outputTokens?: number }>;
    [key: string]: unknown;
  }

  export function streamText(options: {
    model: unknown;
    instructions?: string;
    system?: string;
    prompt?: string;
    messages?: ModelMessage[];
    tools?: ToolSet;
    /**
     * Per-call approval policy. Returning `'user-approval'` suspends the call
     * and emits an approval request instead of executing it — the structural
     * gate every mutating tool sits behind.
     */
    toolApproval?: (options: {
      toolCall: { toolName: string; toolCallId: string; input?: unknown };
      [key: string]: unknown;
    }) => 'user-approval' | 'not-applicable' | 'approved' | 'denied' | undefined;
    stopWhen?: unknown;
    onChunk?: (event: { [key: string]: unknown }) => void;
    onError?: (event: { error: unknown }) => void;
    onFinish?: (event: { [key: string]: unknown }) => void | Promise<void>;
    [key: string]: unknown;
  }): StreamTextResult;

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
