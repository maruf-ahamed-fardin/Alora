import Anthropic from "@anthropic-ai/sdk";
import {
  AiNotConfiguredError,
  EmptyReplyError,
  ModelRefusedError,
  ToolLoopError,
  type ChatModel,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
  type ToolCall,
} from "./model";
import { ToolInputError, type ToolDefinition } from "./tools/types";
import { runTool } from "./tools/runner";

export const DEFAULT_MODEL = "claude-opus-5-5";

// How many times the model may ask for tools before we give up. A normal reply
// needs one or two rounds (look up, then answer).
const MAX_TOOL_ROUNDS = 5;
// Keeps one huge tool result from filling the model's context.
const MAX_TOOL_OUTPUT = 8000;

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

  async reply({ system, context, messages, tools = [] }: ModelRequest): Promise<ModelResponse> {
    const useFallback = FALLBACK_MODELS.has(this.model);
    // Tools are sent before the system prompt and are the same on every turn
    // of a conversation, so they stay inside the cached prefix.
    const toolParams = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    // Grows by two entries per tool round: the model's request, our results.
    const thread: Anthropic.Beta.Messages.BetaMessageParam[] = [...messages];
    const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const toolCalls: ToolCall[] = [];

    for (let round = 0; ; round++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        // The stable prompt is cached across turns. The per-message context sits
        // after the cache breakpoint, so changing it does not invalidate the cache.
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ...(context ? [{ type: "text" as const, text: context }] : []),
        ],
        messages: thread,
        ...(toolParams.length > 0 ? { tools: toolParams } : {}),
        ...(this.effort ? { output_config: { effort: this.effort } } : {}),
        // If a safety classifier declines, the API retries on a fallback model
        // inside the same call instead of failing the customer's message.
        ...(useFallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });

      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      if (response.stop_reason === "refusal") {
        throw new ModelRefusedError(response.stop_details?.category ?? null);
      }

      if (response.stop_reason === "tool_use") {
        if (round >= MAX_TOOL_ROUNDS) throw new ToolLoopError(MAX_TOOL_ROUNDS);
        const requests = response.content.flatMap((b) => (b.type === "tool_use" ? [b] : []));
        const results = await Promise.all(requests.map((r) => runTool(tools, r.name, r.input)));
        results.forEach((result, i) => {
          toolCalls.push({
            name: requests[i].name,
            input: requests[i].input,
            output: result.output,
            isError: result.isError,
          });
        });
        // The model's own turn goes back exactly as received (thinking blocks
        // included), followed by one result per tool it asked for.
        thread.push({ role: "assistant", content: response.content });
        thread.push({
          role: "user",
          content: requests.map((r, i) => ({
            type: "tool_result" as const,
            tool_use_id: r.id,
            content: results[i].output,
            ...(results[i].isError ? { is_error: true } : {}),
          })),
        });
        continue;
      }

      // Text written next to a tool request ("let me check...") is dropped; only
      // the final turn is the customer's reply.
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      if (!text) throw new EmptyReplyError(response.stop_reason);

      return { text, model: response.model, usage, toolCalls };
    }
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
