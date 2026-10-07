import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db/client";
import {
  businesses,
  channels,
  deliveryZones,
  knowledgeDocuments,
  sessions,
  users,
  type userRole,
} from "../db/schema";

export const SESSION_COOKIE_NAME = "alora_session";
export const SESSION_MAX_AGE_DAYS = 30;

export type UserRole = (typeof userRole.enumValues)[number];

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string = "auth_error",
    public status: number = 400,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessId: string;
};

export type SafeBusiness = {
  id: string;
  slug: string;
  name: string;
  currency?: string;
  timezone?: string;
};

export type SessionContext = {
  user: SafeUser;
  business: SafeBusiness;
};

// Password hashing using Node.js crypto.scrypt with random 16-byte salt
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 6) {
    throw new AuthError("Password must be at least 6 characters long", "weak_password", 400);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  const parts = combinedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  if (!salt || !key) return false;

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(key, "hex");
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

export async function createSession(
  userId: string,
  businessId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await getDb().insert(sessions).values({
    id: token,
    userId,
    businessId,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string): Promise<SessionContext | null> {
  if (!token || typeof token !== "string") return null;
  const db = getDb();

  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
      userRole: users.role,
      businessId: businesses.id,
      businessSlug: businesses.slug,
      businessName: businesses.name,
      businessCurrency: businesses.currency,
      businessTimezone: businesses.timezone,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(businesses, eq(sessions.businessId, businesses.id))
    .where(eq(sessions.id, token));

  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    // expired session cleanup
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  return {
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      role: row.userRole,
      businessId: row.businessId,
    },
    business: {
      id: row.businessId,
      slug: row.businessSlug,
      name: row.businessName,
      currency: row.businessCurrency,
      timezone: row.businessTimezone,
    },
  };
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.id, token));
}

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  businessName: string;
  businessSlug?: string;
  toneNotes?: string;
};

export async function signUp(input: SignUpInput): Promise<SessionContext & { token: string }> {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password;
  const businessName = input.businessName?.trim();

  if (!name) throw new AuthError("Name is required", "invalid_name");
  if (!email || !email.includes("@")) throw new AuthError("Valid email is required", "invalid_email");
  if (!businessName) throw new AuthError("Business name is required", "invalid_business_name");
  if (!password || password.length < 6) {
    throw new AuthError("Password must be at least 6 characters", "weak_password");
  }

  const db = getDb();

  // Check if email already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  if (existingUser) {
    throw new AuthError("Email is already registered", "email_in_use", 409);
  }

  // Generate unique slug
  let baseSlug = slugify(input.businessSlug || businessName);
  if (!baseSlug) baseSlug = "shop";

  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const [existingShop] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, slug));
    if (!existingShop) break;
    slug = `${baseSlug}-${counter++}`;
  }

  const passwordHash = await hashPassword(password);

  return await db.transaction(async (tx) => {
    // 1. Create Business
    const [business] = await tx
      .insert(businesses)
      .values({
        slug,
        name: businessName,
        toneNotes: input.toneNotes || "Friendly and polite. Answers in the customer's language and script.",
      })
      .returning();

    // 2. Create User as Owner
    const [user] = await tx
      .insert(users)
      .values({
        businessId: business.id,
        email,
        passwordHash,
        name,
        role: "owner",
      })
      .returning();

    // 3. Create Default Playground & Omnichannel Channels
    await tx.insert(channels).values([
      {
        businessId: business.id,
        type: "playground",
        name: "AI Playground",
        externalId: `${slug}-playground`,
      },
      {
        businessId: business.id,
        type: "whatsapp",
        name: "WhatsApp Official",
        externalId: `${slug}-wa`,
      },
      {
        businessId: business.id,
        type: "telegram",
        name: "Telegram Bot",
        externalId: `${slug}-tg`,
      },
    ]);

    // 4. Create Default Delivery Zones
    await tx.insert(deliveryZones).values([
      {
        businessId: business.id,
        name: "Inside Dhaka",
        keywords: ["dhaka", "ঢাকা", "dhanmondi", "gulshan", "mirpur", "uttara"],
        isDefault: false,
        charge: "60.00",
        minDays: 2,
        maxDays: 3,
        freeAbove: "2000.00",
      },
      {
        businessId: business.id,
        name: "Outside Dhaka",
        keywords: [],
        isDefault: true,
        charge: "120.00",
        minDays: 3,
        maxDays: 5,
        freeAbove: null,
      },
    ]);

    // 5. Create Welcome Knowledge Document
    await tx.insert(knowledgeDocuments).values({
      businessId: business.id,
      kind: "about",
      title: "About Our Shop",
      content: `Welcome to ${businessName}. We are an online store dedicated to providing high quality products and prompt customer service.`,
    });

    // 6. Create Session
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    await tx.insert(sessions).values({
      id: token,
      userId: user.id,
      businessId: business.id,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        businessId: business.id,
      },
      business: {
        id: business.id,
        slug: business.slug,
        name: business.name,
        currency: business.currency,
        timezone: business.timezone,
      },
      token,
    };
  });
}

export type SignInInput = {
  email: string;
  password: string;
};

export async function signIn(input: SignInInput): Promise<SessionContext & { token: string }> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    throw new AuthError("Email and password are required", "missing_credentials", 400);
  }

  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    throw new AuthError("Invalid email or password", "invalid_credentials", 401);
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError("Invalid email or password", "invalid_credentials", 401);
  }

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, user.businessId));

  if (!business) {
    throw new AuthError("Associated business not found", "business_not_found", 404);
  }

  const { token } = await createSession(user.id, business.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      businessId: user.businessId,
    },
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      currency: business.currency,
      timezone: business.timezone,
    },
    token,
  };
}

// Next.js server cookie helpers
export async function getSessionFromCookies(): Promise<SessionContext | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await validateSession(token);
  } catch {
    return null;
  }
}

// Fallback to demo-shop when unauthenticated in local development if no session exists
export async function getActiveBusinessOrDemo(): Promise<SafeBusiness> {
  const session = await getSessionFromCookies();
  if (session) return session.business;

  const [demo] = await getDb()
    .select()
    .from(businesses)
    .where(eq(businesses.slug, "demo-shop"));

  if (demo) {
    return {
      id: demo.id,
      slug: demo.slug,
      name: demo.name,
      currency: demo.currency,
      timezone: demo.timezone,
    };
  }

  throw new AuthError("No active business found. Please log in.", "unauthorized", 401);
}
