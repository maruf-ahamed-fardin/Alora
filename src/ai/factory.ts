import { AnthropicChatModel, DEFAULT_MODEL as DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { OllamaChatModel } from "./ollama";
import { AiNotConfiguredError, type ChatModel } from "./model";

export function isAiConfigured(): boolean {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  if (provider === "ollama") return true;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  if (process.env.OLLAMA_BASE_URL) return true;
  return false;
}

export function createChatModel(): ChatModel {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();

  if (provider === "ollama" || (!process.env.ANTHROPIC_API_KEY && process.env.OLLAMA_BASE_URL)) {
    return new OllamaChatModel();
  }

  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    const effort = process.env.AI_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined;
    const maxTokens = process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : undefined;
    return new AnthropicChatModel({
      model: process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
      effort,
      maxTokens,
    });
  }

  throw new AiNotConfiguredError();
}
