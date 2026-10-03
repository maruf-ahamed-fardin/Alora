import { checkStockTool, getProductTool } from "./catalog";
import { getDeliveryChargeTool } from "./delivery";
import { handoffTool } from "./handoff";
import { getOrderTool } from "./orders";
import type { ToolContext, ToolDefinition } from "./types";

export type { ToolContext, ToolDefinition } from "./types";
export { ToolInputError } from "./types";

/** The tools the model may use for one conversation. */
export function buildTools(context: ToolContext): ToolDefinition[] {
  return [
    getProductTool(context),
    checkStockTool(context),
    getDeliveryChargeTool(context),
    getOrderTool(context),
    handoffTool(context),
  ];
}
