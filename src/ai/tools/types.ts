// A tool is something the model can ask us to do while it writes a reply: look
// up a price, check stock, find an order. The model only supplies the input;
// which business and which customer it is about comes from ToolContext, which
// the model cannot change, so it can never read another shop's or customer's data.

export type ToolContext = {
  businessId: string;
  conversationId: string;
  customerId: string;
};

export type ToolInputSchema = {
  type: "object";
  properties: Record<string, { type: "string" | "number"; description: string }>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  /** Tells the model when to use the tool and what comes back. */
  description: string;
  inputSchema: ToolInputSchema;
  /** Input is whatever the model sent; each tool checks it. Output must be JSON. */
  run(input: unknown): Promise<unknown>;
};

/** The model sent input the tool cannot use. The message goes back to the model. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function optionalString(input: unknown, key: string): string | undefined {
  const value = (input as Record<string, unknown> | null)?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ToolInputError(`"${key}" must be text.`);
  return value.trim() || undefined;
}

export function requiredString(input: unknown, key: string): string {
  const value = optionalString(input, key);
  if (!value) throw new ToolInputError(`"${key}" is required.`);
  return value;
}

export function optionalNumber(input: unknown, key: string): number | undefined {
  const value = (input as Record<string, unknown> | null)?.[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ToolInputError(`"${key}" must be a number, zero or more.`);
  }
  return value;
}
