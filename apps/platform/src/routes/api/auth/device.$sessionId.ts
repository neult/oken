import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { generateApiKey, hashApiKey } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { apiKeys, deviceAuthSessions, users } from "@/lib/db/schema";

export const Route = createFileRoute("/api/auth/device/$sessionId")({
  server: {
    handlers: {
      // Poll for token
      GET: async ({ params }: { params: { sessionId: string } }) => {
        const { sessionId } = params;

        const [session] = await db
          .select()
          .from(deviceAuthSessions)
          .where(eq(deviceAuthSessions.id, sessionId))
          .limit(1);

        if (!session) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }

        // Check expiration
        if (new Date() > session.expiresAt) {
          return Response.json({ error: "Session expired" }, { status: 410 });
        }

        // Still pending
        if (session.status === "pending") {
          return Response.json({ status: "pending" });
        }

        // Approved - generate API key and return it
        if (session.status === "approved" && session.userId) {
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
          { error: "Invalid session state" },
          { status: 400 }
        );
      },
    },
  },
});
