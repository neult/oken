import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import {
  errorResponse,
  UnauthorizedError,
  ValidationError,
} from "@/lib/api/errors";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deviceAuthSessions } from "@/lib/db/schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        try {
          const { sessionId } = params;

          if (!UUID_REGEX.test(sessionId)) {
            throw new ValidationError("Invalid session ID");
          }

          // Get current user from Better Auth session
          const session = await auth.api.getSession({
            headers: request.headers,
          });
          if (!session?.user) {
            throw new UnauthorizedError();
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
              { error: "Session not found or already used", code: "NOT_FOUND" },
              { status: 404 }
            );
          }

          if (new Date() > deviceSession.expiresAt) {
            return Response.json(
              { error: "Session expired", code: "EXPIRED" },
              { status: 410 }
            );
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
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
