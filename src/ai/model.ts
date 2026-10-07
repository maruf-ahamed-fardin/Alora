// The engine only knows this interface, so the hosted model can later be
// swapped for a fine-tuned one (D15) and compared on the same test set.

import type { ToolDefinition } from "./tools/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ModelRequest = {
  /** The stable prompt for this business (cached between turns). */
  system: string;
  /** What changes per message: matching shop records and style examples. */
  context?: string;
  messages: ChatMessage[];
  /**
   * Things the model may look up or do while answering. The model asks, the
   * implementation of ChatModel runs them and feeds the result back.
   */
  tools?: ToolDefinition[];
};

/** One tool the model used while writing a reply. */
export type ToolCall = {
  name: string;
  input: unknown;
  /** What was handed back to the model (JSON text, or an error message). */
  output: string;
  isError: boolean;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
};

export type ModelResponse = {
  text: string;
  model: string;
  /** Summed over every call made for this reply. */
  usage: ModelUsage;
  /** Tools used, in order. Empty when the model answered straight away. */
  toolCalls: ToolCall[];
};

export interface ChatModel {
  reply(request: ModelRequest): Promise<ModelResponse>;
}

/** No API key or login is configured for the hosted model. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI model is not configured. Put ANTHROPIC_API_KEY in .env.local and restart the dev server.",
    );
    this.name = "AiNotConfiguredError";
  }
}

/** The model declined to answer (safety classifier). */
export class ModelRefusedError extends Error {
  constructor(public category: string | null) {
    super(`The model declined to reply${category ? ` (${category})` : ""}.`);
    this.name = "ModelRefusedError";
  }
}

/** The model kept asking for tools and never produced an answer. */
export class ToolLoopError extends Error {
  constructor(public rounds: number) {
    super(`The model was still asking for tools after ${rounds} rounds.`);
    this.name = "ToolLoopError";
  }
}

/** The model returned no usable text (for example it ran out of tokens). */
export class EmptyReplyError extends Error {
  constructor(public stopReason: string | null) {
    super(`The model returned an empty reply (stop reason: ${stopReason}).`);
    this.name = "EmptyReplyError";
  }
}

/** Ollama or local LLM server is not reachable. */
export class OllamaConnectionError extends Error {
  constructor(public baseUrl: string) {
    super(
      `Could not connect to Ollama at ${baseUrl}. Make sure Ollama is running (e.g. run 'ollama serve' or 'ollama run <model>').`,
    );
    this.name = "OllamaConnectionError";
  }
}
