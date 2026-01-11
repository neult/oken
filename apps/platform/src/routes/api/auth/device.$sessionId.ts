import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { errorResponse, ValidationError } from "@/lib/api/errors";
import { generateApiKey, hashApiKey } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { apiKeys, deviceAuthSessions, users } from "@/lib/db/schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/auth/device/$sessionId")({
  server: {
    handlers: {
      // Poll for token
      GET: async ({ params }: { params: { sessionId: string } }) => {
        try {
          const { sessionId } = params;

          if (!UUID_REGEX.test(sessionId)) {
            throw new ValidationError("Invalid session ID");
          }

          const [session] = await db
            .select()
            .from(deviceAuthSessions)
            .where(eq(deviceAuthSessions.id, sessionId))
            .limit(1);

          if (!session) {
            return Response.json(
              { error: "Session not found", code: "NOT_FOUND" },
              { status: 404 }
            );
          }

          // Check expiration
          if (new Date() > session.expiresAt) {
            return Response.json(
              { error: "Session expired", code: "EXPIRED" },
              { status: 410 }
            );
          }

          // Still pending
          if (session.status === "pending") {
            return Response.json({ status: "pending" });
          }

          // Approved - atomically mark as completed to prevent race condition
          if (session.status === "approved" && session.userId) {
            const [updated] = await db
              .update(deviceAuthSessions)
              .set({ status: "completed" })
              .where(
                and(
                  eq(deviceAuthSessions.id, sessionId),
                  eq(deviceAuthSessions.status, "approved")
                )
              )
              .returning();

            if (!updated) {
              return Response.json(
                { error: "Session already processed", code: "CONFLICT" },
                { status: 409 }
              );
            }

            const apiKey = generateApiKey();
            const keyHash = hashApiKey(apiKey);
            const keyPrefix = apiKey.substring(0, 11); // "ok_xxxxxxxx"

            // Get user email for display
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);

            // Create API key record
            await db.insert(apiKeys).values({
              userId: session.userId,
              name: `CLI (${new Date().toLocaleDateString()})`,
              keyHash,
              keyPrefix,
            });

            // Delete the device session (one-time use)
            await db
              .delete(deviceAuthSessions)
              .where(eq(deviceAuthSessions.id, sessionId));

            return Response.json({
              status: "approved",
              token: apiKey,
              user: { email: user?.email },
            });
          }

          return Response.json(
            { error: "Invalid session state", code: "INVALID_STATE" },
            { status: 400 }
          );
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
