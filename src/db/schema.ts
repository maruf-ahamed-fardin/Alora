import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Every tenant-owned table carries business_id. Child tables reference their
// parents with a composite (business_id, id) foreign key, so the database
// itself rejects a row that points at another business's data.

export const channelType = pgEnum("channel_type", [
  "playground",
  "telegram",
  "messenger",
  "instagram",
  "whatsapp",
  "x",
  "web",
]);

export const conversationStatus = pgEnum("conversation_status", [
  "open",
  "handoff",
  "closed",
]);

export const senderType = pgEnum("sender_type", [
  "customer",
  "ai",
  "agent",
  "system",
]);

export const knowledgeKind = pgEnum("knowledge_kind", [
  "about",
  "faq",
  "policy",
  "delivery",
  "payment",
  "other",
]);

export const userRole = pgEnum("user_role", [
  "owner",
  "admin",
  "agent",
]);

// Size of the embedding model's output (multilingual-e5-small). Changing the
// model to one with a different size means a new migration and re-indexing.
export const EMBEDDING_DIMENSIONS = 384;

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Free-text guidance for the AI's voice, e.g. "friendly, uses ভাই/আপু".
  toneNotes: text("tone_notes"),
  currency: text("currency").notNull().default("BDT"),
  timezone: text("timezone").notNull().default("Asia/Dhaka"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("owner"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("users_business_id_id_key").on(t.businessId, t.id),
    unique("users_email_key").on(t.email),
    index("users_business_idx").on(t.businessId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_business_idx").on(t.businessId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    type: channelType("type").notNull(),
    name: text("name").notNull(),
    // Platform-side id (Facebook page id, bot id, WhatsApp phone number id).
    externalId: text("external_id"),
    // Tokens live here from D10 on; they must be encrypted before real use.
    credentials: jsonb("credentials"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("channels_business_id_id_key").on(t.businessId, t.id),
    // A webhook finds its business by (type, external_id).
    unique("channels_type_external_id_key").on(t.type, t.externalId),
    index("channels_business_idx").on(t.businessId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull(),
    // The customer's id on that platform (Telegram chat id, PSID, wa_id).
    externalId: text("external_id").notNull(),
    name: text("name"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("customers_business_id_id_key").on(t.businessId, t.id),
    unique("customers_channel_external_key").on(t.channelId, t.externalId),
    foreignKey({
      name: "customers_channel_fk",
      columns: [t.businessId, t.channelId],
      foreignColumns: [channels.businessId, channels.id],
    }).onDelete("cascade"),
    index("customers_business_idx").on(t.businessId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    status: conversationStatus("status").notNull().default("open"),
    // false once a human takes over; the AI stays silent until switched back.
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("conversations_business_id_id_key").on(t.businessId, t.id),
    foreignKey({
      name: "conversations_customer_fk",
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversations_channel_fk",
      columns: [t.businessId, t.channelId],
      foreignColumns: [channels.businessId, channels.id],
    }).onDelete("cascade"),
    index("conversations_inbox_idx").on(t.businessId, t.lastMessageAt),
    index("conversations_customer_idx").on(t.customerId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    sender: senderType("sender").notNull(),
    content: text("content").notNull(),
    // Platform message id; the unique index makes webhook retries harmless.
    externalId: text("external_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "messages_conversation_fk",
      columns: [t.businessId, t.conversationId],
      foreignColumns: [conversations.businessId, conversations.id],
    }).onDelete("cascade"),
    unique("messages_conversation_external_key").on(
      t.conversationId,
      t.externalId,
    ),
    index("messages_thread_idx").on(t.conversationId, t.createdAt),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("BDT"),
    // Total stock. Per-size stock sits in attributes.sizes until D4 decides
    // whether variants need their own table.
    stockQuantity: integer("stock_quantity").notNull().default(0),
    attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("products_business_sku_key").on(t.businessId, t.sku),
    index("products_business_idx").on(t.businessId),
  ],
);

// Source text for RAG. Each document is cut into knowledge_chunks, and the
// chunks are what gets embedded and searched.
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: knowledgeKind("kind").notNull().default("other"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("knowledge_documents_business_id_id_key").on(t.businessId, t.id),
    index("knowledge_business_idx").on(t.businessId),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    // Which model produced the vector; vectors from different models are not
    // comparable, so re-index when this changes.
    embeddingModel: text("embedding_model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("knowledge_chunks_document_index_key").on(t.documentId, t.chunkIndex),
    foreignKey({
      name: "knowledge_chunks_document_fk",
      columns: [t.businessId, t.documentId],
      foreignColumns: [knowledgeDocuments.businessId, knowledgeDocuments.id],
    }).onDelete("cascade"),
    index("knowledge_chunks_business_idx").on(t.businessId),
  ],
);

// Real past replies from the shop's team. The most similar ones are shown to
// the model as style examples, so it answers the way this shop does.
export const toneExamples = pgTable(
  "tone_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerMessage: text("customer_message").notNull(),
    reply: text("reply").notNull(),
    // Filled in by indexing; null means not yet searchable.
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingModel: text("embedding_model"),
    createdAt: createdAt(),
  },
  (t) => [index("tone_examples_business_idx").on(t.businessId)],
);

// Where the shop delivers and what it charges. The AI quotes these through the
// get_delivery_charge tool, so a changed charge reaches customers at once.
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Lower-case words that put an address in this zone, e.g. ["dhaka", "ঢাকা"].
    keywords: jsonb("keywords").notNull().default(sql`'[]'::jsonb`),
    // The zone used when no keyword matches ("outside Dhaka"). One per business.
    isDefault: boolean("is_default").notNull().default(false),
    charge: numeric("charge", { precision: 12, scale: 2 }).notNull(),
    minDays: integer("min_days").notNull(),
    maxDays: integer("max_days").notNull(),
    // Orders above this amount ship free in this zone; null means never free.
    freeAbove: numeric("free_above", { precision: 12, scale: 2 }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("delivery_zones_business_name_key").on(t.businessId, t.name),
    index("delivery_zones_business_idx").on(t.businessId),
    // At most one default zone per business.
    uniqueIndex("delivery_zones_one_default_idx")
      .on(t.businessId)
      .where(sql`${t.isDefault}`),
  ],
);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    // The number the customer quotes, e.g. "ORD-1001". Unique per business.
    orderNumber: text("order_number").notNull(),
    // Whose order it is. The AI only shows an order to the customer it belongs to.
    customerId: uuid("customer_id").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    // [{ name, sku, size, quantity, unitPrice }]
    items: jsonb("items").notNull().default(sql`'[]'::jsonb`),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    deliveryCharge: numeric("delivery_charge", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    shippingAddress: text("shipping_address"),
    courier: text("courier"),
    trackingCode: text("tracking_code"),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("orders_business_number_key").on(t.businessId, t.orderNumber),
    foreignKey({
      name: "orders_customer_fk",
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    index("orders_customer_idx").on(t.customerId, t.placedAt),
  ],
);
