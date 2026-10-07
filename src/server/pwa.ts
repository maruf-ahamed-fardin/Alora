// Server-side PWA subscription and notification dispatcher

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const subscriptions: PushSubscriptionPayload[] = [];

export function savePushSubscription(sub: PushSubscriptionPayload) {
  const existing = subscriptions.find((s) => s.endpoint === sub.endpoint);
  if (!existing) {
    subscriptions.push(sub);
  }
  return { success: true, count: subscriptions.length };
}

export function listPushSubscriptions() {
  return [...subscriptions];
}

export function clearPushSubscriptions() {
  subscriptions.length = 0;
}
