import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deviceAuthSessions } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/device/$sessionId/approve")({
  server: {
    handlers: {
      // Approve device auth session (called by logged-in user)
      POST: async ({
        request,
        params,
      }: {
        request: Request;
        params: { sessionId: string };
      }) => {
        const { sessionId } = params;

        // Get current user from Better Auth session
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Find and validate device session
        const [deviceSession] = await db
          .select()
          .from(deviceAuthSessions)
          .where(
            and(
              eq(deviceAuthSessions.id, sessionId),
              eq(deviceAuthSessions.status, "pending")
            )
          )
          .limit(1);

        if (!deviceSession) {
          return Response.json(
            { error: "Session not found or already used" },
            { status: 404 }
          );
        }

        if (new Date() > deviceSession.expiresAt) {
          return Response.json({ error: "Session expired" }, { status: 410 });
        }

        // Approve the session
        await db
          .update(deviceAuthSessions)
          .set({
            status: "approved",
            userId: session.user.id,
          })
          .where(eq(deviceAuthSessions.id, sessionId));

        return Response.json({ success: true });
      },
    },
  },
});
