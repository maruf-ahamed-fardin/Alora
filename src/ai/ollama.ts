import {
  EmptyReplyError,
  OllamaConnectionError,
  ToolLoopError,
  type ChatModel,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
  type ToolCall,
} from "./model";
import { runTool } from "./tools/runner";

export const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const MAX_TOOL_ROUNDS = 5;

export type OllamaChatModelOptions = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown> | string;
    };
  }>;
};

type OllamaChatResponse = {
  model?: string;
  message?: OllamaMessage;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

export class OllamaChatModel implements ChatModel {
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(options: OllamaChatModelOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.OLLAMA_BASE_URL ??
      DEFAULT_OLLAMA_BASE_URL
    ).replace(/\/+$/, "");
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async reply({ system, context, messages, tools = [] }: ModelRequest): Promise<ModelResponse> {
    const systemPrompt = context ? `${system}\n\n${context}` : system;

    const formattedTools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const history: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const toolCalls: ToolCall[] = [];

    for (let round = 0; ; round++) {
      let data: OllamaChatResponse;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            messages: history,
            stream: false,
            ...(formattedTools.length > 0 ? { tools: formattedTools } : {}),
            options: {
              temperature: 0.3,
              num_predict: process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : 4096,
            },
          }),
        });
        clearTimeout(timer);

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Ollama returned error (${res.status}): ${errText}`);
        }
        data = (await res.json()) as OllamaChatResponse;
      } catch (err: unknown) {
        const error = err as { code?: string; name?: string; message?: string; cause?: { code?: string } };
        if (
          error?.cause?.code === "ECONNREFUSED" ||
          error?.code === "ECONNREFUSED" ||
          error?.name === "AbortError" ||
          error?.message?.includes("fetch failed")
        ) {
          throw new OllamaConnectionError(this.baseUrl);
        }
        throw err;
      }

      usage.inputTokens += data.prompt_eval_count ?? 0;
      usage.outputTokens += data.eval_count ?? 0;

      const assistantMsg = data.message;
      if (!assistantMsg) {
        throw new EmptyReplyError("no_message");
      }

      const calls = assistantMsg.tool_calls;
      if (Array.isArray(calls) && calls.length > 0) {
        if (round >= MAX_TOOL_ROUNDS) {
          throw new ToolLoopError(MAX_TOOL_ROUNDS);
        }

        history.push(assistantMsg);

        for (const tc of calls) {
          const fnName = tc.function.name;
          let fnArgs = tc.function.arguments;
          if (typeof fnArgs === "string") {
            try {
              fnArgs = JSON.parse(fnArgs);
            } catch {
              // keep as string if parse fails
            }
          }

          const result = await runTool(tools, fnName, fnArgs);
          toolCalls.push({
            name: fnName,
            input: fnArgs,
            output: result.output,
            isError: result.isError,
          });

          history.push({
            role: "tool",
            content: result.output,
          });
        }
        continue;
      }

      const text = (assistantMsg.content ?? "").trim();
      if (!text) {
        throw new EmptyReplyError(data.done_reason ?? "empty");
      }

      return {
        text,
        model: data.model ?? this.model,
        usage,
        toolCalls,
      };
    }
  }
}
