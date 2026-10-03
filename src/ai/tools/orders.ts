import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { orders } from "../../db/schema";
import { optionalString, type ToolContext, type ToolDefinition } from "./types";

const RECENT = 3;
const LOOKBACK = 25;

type Order = typeof orders.$inferSelect;

const squash = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]+/g, "");

function view(order: Order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt.toISOString(),
    items: order.items,
    subtotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    total: Number(order.total),
    shippingAddress: order.shippingAddress ?? undefined,
    courier: order.courier ?? undefined,
    trackingCode: order.trackingCode ?? undefined,
  };
}

export function getOrderTool({ businessId, customerId }: ToolContext): ToolDefinition {
  return {
    name: "get_order",
    description:
      "Look up this customer's own orders: status, items, total, courier and tracking code. Pass the order number when they gave one (e.g. ORD-1001 or just 1001). Without a number it returns their most recent orders. It only ever finds orders that belong to the customer you are chatting with. Use it for any question about an order or a delivery that has not arrived.",
    inputSchema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number the customer gave, if any." },
      },
    },
    async run(input) {
      const wanted = optionalString(input, "order_number");

      // Only this customer's orders are ever loaded, so an order number that
      // belongs to someone else is indistinguishable from one that does not exist.
      const mine = await getDb()
        .select()
        .from(orders)
        .where(and(eq(orders.businessId, businessId), eq(orders.customerId, customerId)))
        .orderBy(desc(orders.placedAt))
        .limit(LOOKBACK);

      if (!wanted) {
        return mine.length === 0
          ? { orders: [], note: "This customer has no orders on record." }
          : { orders: mine.slice(0, RECENT).map(view) };
      }

      const key = squash(wanted);
      const found = mine.find((o) => {
        const number = squash(o.orderNumber);
        // "1001" should find "ORD-1001".
        return number === key || (/^\d+$/.test(key) && number === `ORD${key}`);
      });
      return found
        ? { orders: [view(found)] }
        : {
            orders: [],
            note: "No order with that number was found on this customer's account. Ask them to check the number; do not guess.",
          };
    },
  };
}
