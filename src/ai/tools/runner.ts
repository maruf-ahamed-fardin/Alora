import type { ToolDefinition } from "./types";
import { ToolInputError } from "./types";

// Keeps one huge tool result from filling the model's context.
export const MAX_TOOL_OUTPUT = 8000;

export async function runTool(
  tools: ToolDefinition[],
  name: string,
  input: unknown,
): Promise<{ output: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { output: `Unknown tool "${name}".`, isError: true };
  try {
    const output = JSON.stringify(await tool.run(input)) ?? "null";
    return {
      output:
        output.length > MAX_TOOL_OUTPUT
          ? `${output.slice(0, MAX_TOOL_OUTPUT)}…(cut)`
          : output,
      isError: false,
    };
  } catch (err) {
    if (err instanceof ToolInputError) return { output: err.message, isError: true };
    // The model only learns that the lookup failed; details stay in our log.
    console.error(`Tool ${name} failed.`, err);
    return {
      output: "The lookup failed. Tell the customer a team member will check.",
      isError: true,
    };
  }
}
