import Anthropic from "@anthropic-ai/sdk";
import {
  AiNotConfiguredError,
  EmptyReplyError,
  ModelRefusedError,
  type ChatModel,
  type ModelRequest,
  type ModelResponse,
} from "./model";

export const DEFAULT_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// Models that accept the server-side refusal fallback ("default" mode).
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
]);

export type AnthropicChatModelOptions = {
  model?: string;
  /** Thinking depth. Chat replies are short, so "low" keeps them fast and cheap. */
  effort?: Effort;
  maxTokens?: number;
  client?: Anthropic;
};

export class AnthropicChatModel implements ChatModel {
  private client: Anthropic;
  private model: string;
  private effort: Effort | null;
  private maxTokens: number;

  constructor(options: AnthropicChatModelOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? DEFAULT_MODEL;
    // Haiku 4.5 does not support the effort setting.
    this.effort = this.model.startsWith("claude-haiku")
      ? null
      : (options.effort ?? "low");
    // Thinking tokens count against max_tokens, so leave room beyond the reply.
    this.maxTokens = options.maxTokens ?? 4000;
  }

  async reply({ system, context, messages }: ModelRequest): Promise<ModelResponse> {
    const useFallback = FALLBACK_MODELS.has(this.model);

    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      // The stable prompt is cached across turns. The per-message context sits
      // after the cache breakpoint, so changing it does not invalidate the cache.
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ...(context ? [{ type: "text" as const, text: context }] : []),
      ],
      messages,
      ...(this.effort ? { output_config: { effort: this.effort } } : {}),
      // If a safety classifier declines, the API retries on a fallback model
      // inside the same call instead of failing the customer's message.
      ...(useFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new ModelRefusedError(response.stop_details?.category ?? null);
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new EmptyReplyError(response.stop_reason);

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

/** Build the hosted model from environment variables (see .env.example). */
export function createChatModel(): ChatModel {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiNotConfiguredError();
  }
  const effort = process.env.AI_EFFORT as Effort | undefined;
  return new AnthropicChatModel({
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    effort,
  });
}
