import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  users,
  userCredentials,
  emailTokens,
  type EmailToken,
  type UserCredential,
} from "../../drizzle/schema";
import { getDb } from "./client";

export type EmailTokenType = EmailToken["type"];

/**
 * Number of super-admins that have a password credential — i.e. accounts that
 * could actually sign in if the NO_AUTH auto-admin were switched off. Used to
 * guard against locking the install out of its own admin console.
 */
export async function countCredentialedSuperAdmins(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(eq(users.globalRole, "superadmin"));
  return Number(rows[0]?.n ?? 0);
}

export async function getCredentialByEmail(
  email: string
): Promise<UserCredential | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.email, email))
    .limit(1);
  return rows[0];
}

export async function getCredentialByUserId(
  userId: number
): Promise<UserCredential | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, userId))
    .limit(1);
  return rows[0];
}

export async function createCredential(params: {
  userId: number;
  email: string;
  passwordHash: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(userCredentials).values({
    userId: params.userId,
    email: params.email,
    passwordHash: params.passwordHash,
  });
}

export async function setPasswordHash(
  userId: number,
  passwordHash: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(userCredentials)
    .set({ passwordHash })
    .where(eq(userCredentials.userId, userId));
}

export async function markEmailVerified(userId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(userCredentials)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(userCredentials.userId, userId));
}

/** Clear the verified flag — used when a user changes their email address. */
export async function markEmailUnverified(userId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(userCredentials)
    .set({ emailVerifiedAt: null })
    .where(eq(userCredentials.userId, userId));
}

/** Update the email on a user's local credential (change-email flow). */
export async function setCredentialEmail(
  userId: number,
  email: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(userCredentials)
    .set({ email })
    .where(eq(userCredentials.userId, userId));
}

// ── Email / reset tokens ──────────────────────────────────────────────────────

export async function createEmailToken(params: {
  userId: number;
  type: EmailTokenType;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  const db = await getDb();
  await db.insert(emailTokens).values({
    userId: params.userId,
    type: params.type,
    tokenHash: params.tokenHash,
    expiresAt: params.expiresAt,
  });
}

/**
 * Look up a live token (matching hash + type, not consumed, not expired) and
 * mark it consumed. Returns the owning userId, or null when the token is
 * invalid/expired/already used. Single-use by construction.
 */
export async function consumeEmailToken(
  tokenHash: string,
  type: EmailTokenType
): Promise<number | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, tokenHash),
        eq(emailTokens.type, type),
        isNull(emailTokens.consumedAt),
        gt(emailTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  const token = rows[0];
  if (!token) return null;

  await db
    .update(emailTokens)
    .set({ consumedAt: new Date() })
    .where(eq(emailTokens.id, token.id));
  return token.userId;
}
