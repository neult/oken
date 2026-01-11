import { eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { UnauthorizedError } from "./errors";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Validate API key from Authorization header.
 * Expects: Authorization: Bearer ok_xxxxx
 */
export async function requireAuth(
  request: Request
): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ok_")) {
    throw new UnauthorizedError("Missing or invalid API key");
  }

  const token = authHeader.substring(7); // Remove "Bearer "
  const keyHash = hashApiKey(token);

  const [key] = await db
    .select({
      userId: apiKeys.userId,
      email: users.email,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Update last used timestamp (fire and forget, but log failures)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, keyHash))
    .execute()
    .catch((err) => {
      logger.error({ err }, "Failed to update API key lastUsedAt");
    });

  return { id: key.userId, email: key.email };
}
