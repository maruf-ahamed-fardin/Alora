import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { deliveryZones } from "../../db/schema";
import {
  optionalNumber,
  requiredString,
  type ToolContext,
  type ToolDefinition,
} from "./types";

type Zone = typeof deliveryZones.$inferSelect;

const keywordsOf = (zone: Zone): string[] =>
  (Array.isArray(zone.keywords) ? zone.keywords : []).filter(
    (k): k is string => typeof k === "string" && k.trim() !== "",
  );

export function getDeliveryChargeTool({ businessId }: ToolContext): ToolDefinition {
  return {
    name: "get_delivery_charge",
    description:
      "Get the delivery charge and delivery time for an address or area. Pass the customer's area or city as they wrote it (e.g. Dhanmondi, ঢাকা, Sylhet). Pass order_total when the customer has told you what they are buying, so free delivery over a threshold is applied. Use it for every question about delivery cost or time.",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", description: "The customer's area, city or address." },
        order_total: {
          type: "number",
          description: "Order amount in the shop's currency, if known. Needed to apply free delivery.",
        },
      },
      required: ["area"],
    },
    async run(input) {
      const area = requiredString(input, "area").toLowerCase();
      const orderTotal = optionalNumber(input, "order_total");

      const zones = await getDb()
        .select()
        .from(deliveryZones)
        .where(eq(deliveryZones.businessId, businessId));
      if (zones.length === 0) {
        return {
          found: false,
          note: "The shop has not set delivery charges. A team member will confirm.",
        };
      }

      const byKeyword = zones.find(
        (z) => !z.isDefault && keywordsOf(z).some((k) => area.includes(k.toLowerCase())),
      );
      const zone = byKeyword ?? zones.find((z) => z.isDefault);
      if (!zone) {
        return {
          found: false,
          note: "No delivery zone covers that area. A team member will confirm.",
        };
      }

      const standard = Number(zone.charge);
      const freeAbove = zone.freeAbove === null ? null : Number(zone.freeAbove);
      const free = freeAbove !== null && orderTotal !== undefined && orderTotal > freeAbove;
      return {
        found: true,
        zone: zone.name,
        charge: free ? 0 : standard,
        standardCharge: standard,
        freeDelivery: free,
        freeDeliveryAbove: freeAbove ?? undefined,
        minDays: zone.minDays,
        maxDays: zone.maxDays,
        ...(byKeyword
          ? {}
          : {
              note: "The area did not match a named zone; this is the standard rate for everywhere else.",
            }),
      };
    },
  };
}
