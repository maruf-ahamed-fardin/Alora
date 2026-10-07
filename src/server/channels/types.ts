export type ChannelType =
  | "playground"
  | "telegram"
  | "messenger"
  | "instagram"
  | "whatsapp"
  | "x"
  | "web";

export type TelegramCredentials = {
  botToken: string;
  secretToken?: string;
  botUsername?: string;
};

export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

export type ParsedTelegramMessage = {
  updateId: number;
  messageId: string;
  chatId: string;
  userId: string;
  senderName: string;
  username?: string;
  text: string;
  date: Date;
  isCommand: boolean;
  command?: string;
};

export type MetaCredentials = {
  pageAccessToken: string;
  verifyToken: string;
  appSecret?: string;
  pageId?: string;
  instagramAccountId?: string;
};

export type MetaMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload: string };
  };
  postback?: {
    title: string;
    payload: string;
  };
};

export type MetaWebhookPayload = {
  object: "page" | "instagram";
  entry: Array<{
    id: string;
    time: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

export type ParsedMetaMessage = {
  platform: "messenger" | "instagram";
  pageId: string;
  senderId: string;
  messageId: string;
  text: string;
  timestamp: Date;
  isEcho: boolean;
};

export type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  businessAccountId?: string;
};

export type WhatsAppContact = {
  profile: { name: string };
  wa_id: string;
};

export type WhatsAppMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  caption?: string;
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
};

export type WhatsAppWebhookValue = {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>;
};

export type WhatsAppWebhookPayload = {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: WhatsAppWebhookValue;
    }>;
  }>;
};

export type ParsedWhatsAppMessage = {
  phoneNumberId: string;
  senderPhone: string;
  senderName: string;
  messageId: string;
  text: string;
  timestamp: Date;
};


