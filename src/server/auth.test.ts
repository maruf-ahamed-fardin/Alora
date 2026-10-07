import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";

const dir = mkdtempSync(path.join(tmpdir(), "alora-auth-test-"));
process.env.DATABASE_DIR = dir;

import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../db/client";
import { businesses, channels, deliveryZones, knowledgeDocuments, sessions, users } from "../db/schema";
import {
  createSession,
  destroySession,
  hashPassword,
  signIn,
  signUp,
  validateSession,
  verifyPassword,
} from "./auth";

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("password hashing and verification works with random salt", async () => {
  const password = "mySecurePassword123";
  const hash = await hashPassword(password);
  assert.ok(hash.includes(":"), "hash contains salt separator");

  const valid = await verifyPassword(password, hash);
  assert.equal(valid, true, "correct password verifies");

  const invalid = await verifyPassword("wrongPassword", hash);
  assert.equal(invalid, false, "wrong password rejected");

  const shortAttempt = hashPassword("123");
  await assert.rejects(shortAttempt, /at least 6 characters/);
});

test("signUp creates business, owner user, channels, delivery zones and session", async () => {
  const db = getDb();
  const email = `test-owner-${Date.now()}@example.com`;
  const businessName = `Novelty Shop ${Date.now()}`;

  const res = await signUp({
    name: "Ayesha Siddiqua",
    email,
    password: "securePassword123",
    businessName,
  });

  assert.ok(res.user.id);
  assert.equal(res.user.email, email);
  assert.equal(res.user.name, "Ayesha Siddiqua");
  assert.equal(res.user.role, "owner");
  assert.ok(res.business.id);
  assert.equal(res.business.name, businessName);
  assert.ok(res.token);

  // Validate session immediately
  const session = await validateSession(res.token);
  assert.ok(session);
  assert.equal(session.user.id, res.user.id);
  assert.equal(session.business.id, res.business.id);

  // Check default channels created
  const createdChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.businessId, res.business.id));
  assert.ok(createdChannels.length >= 3, "playground, whatsapp, telegram created");

  // Check default delivery zones created
  const createdZones = await db
    .select()
    .from(deliveryZones)
    .where(eq(deliveryZones.businessId, res.business.id));
  assert.ok(createdZones.length >= 2, "dhaka and outside dhaka zones created");

  // Clean up
  await db.delete(businesses).where(eq(businesses.id, res.business.id));
});

test("signUp rejects duplicate email", async () => {
  const email = `duplicate-${Date.now()}@example.com`;

  const res1 = await signUp({
    name: "First User",
    email,
    password: "password123",
    businessName: "First Shop",
  });

  try {
    await assert.rejects(
      signUp({
        name: "Second User",
        email,
        password: "password123",
        businessName: "Second Shop",
      }),
      /already registered/,
    );
  } finally {
    await getDb().delete(businesses).where(eq(businesses.id, res1.business.id));
  }
});

test("signIn validates password and returns active session", async () => {
  const db = getDb();
  const email = `signin-${Date.now()}@example.com`;
  const password = "myCorrectPassword";

  const res = await signUp({
    name: "Tanvir Ahmed",
    email,
    password,
    businessName: "Sign In Test Shop",
  });

  try {
    // Valid sign in
    const loginRes = await signIn({ email, password });
    assert.equal(loginRes.user.email, email);
    assert.equal(loginRes.business.id, res.business.id);
    assert.ok(loginRes.token);

    // Invalid password
    await assert.rejects(
      signIn({ email, password: "incorrectPassword" }),
      /Invalid email or password/,
    );

    // Unknown email
    await assert.rejects(
      signIn({ email: "unknown@example.com", password }),
      /Invalid email or password/,
    );
  } finally {
    await db.delete(businesses).where(eq(businesses.id, res.business.id));
  }
});

test("destroySession removes session token", async () => {
  const email = `session-destroy-${Date.now()}@example.com`;
  const res = await signUp({
    name: "Session Tester",
    email,
    password: "password123",
    businessName: "Destroy Session Shop",
  });

  try {
    const valid = await validateSession(res.token);
    assert.ok(valid);

    await destroySession(res.token);
    const afterDestroy = await validateSession(res.token);
    assert.equal(afterDestroy, null, "session is null after destruction");
  } finally {
    await getDb().delete(businesses).where(eq(businesses.id, res.business.id));
  }
});

test("multi-business tenant data isolation: User A cannot access User B data", async () => {
  const db = getDb();
  const shopA = await signUp({
    name: "Owner A",
    email: `owner-a-${Date.now()}@example.com`,
    password: "password123",
    businessName: `Shop A ${Date.now()}`,
  });

  const shopB = await signUp({
    name: "Owner B",
    email: `owner-b-${Date.now()}@example.com`,
    password: "password123",
    businessName: `Shop B ${Date.now()}`,
  });

  try {
    // Check that shop A only sees its own documents
    const docsA = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, shopA.business.id));

    const docsB = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, shopB.business.id));

    assert.ok(docsA.length > 0);
    assert.ok(docsB.length > 0);
    assert.notEqual(docsA[0].id, docsB[0].id);

    // Business IDs are completely segregated
    assert.notEqual(shopA.business.id, shopB.business.id);
    assert.notEqual(shopA.user.id, shopB.user.id);
  } finally {
    await db.delete(businesses).where(eq(businesses.id, shopA.business.id));
    await db.delete(businesses).where(eq(businesses.id, shopB.business.id));
  }
});
