// The engine only knows this interface, so the hosted model can later be
// swapped for a fine-tuned one (D15) and compared on the same test set.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ModelRequest = {
  system: string;
  messages: ChatMessage[];
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
};

export type ModelResponse = {
  text: string;
  model: string;
  usage: ModelUsage;
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

/** The model returned no usable text (for example it ran out of tokens). */
export class EmptyReplyError extends Error {
  constructor(public stopReason: string | null) {
    super(`The model returned an empty reply (stop reason: ${stopReason}).`);
    this.name = "EmptyReplyError";
  }
}
