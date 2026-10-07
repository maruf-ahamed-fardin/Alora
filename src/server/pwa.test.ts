import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearPushSubscriptions,
  listPushSubscriptions,
  savePushSubscription,
} from "./pwa";

test("savePushSubscription adds new push subscription and prevents duplicate", () => {
  clearPushSubscriptions();
  const sub1 = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
    keys: { p256dh: "key-1", auth: "auth-1" },
  };

  const res1 = savePushSubscription(sub1);
  assert.equal(res1.count, 1);
  assert.equal(listPushSubscriptions().length, 1);

  // Duplicate endpoint should not duplicate
  const res2 = savePushSubscription(sub1);
  assert.equal(res2.count, 1);
  assert.equal(listPushSubscriptions().length, 1);

  const sub2 = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-2",
    keys: { p256dh: "key-2", auth: "auth-2" },
  };
  const res3 = savePushSubscription(sub2);
  assert.equal(res3.count, 2);
  assert.equal(listPushSubscriptions().length, 2);
});
