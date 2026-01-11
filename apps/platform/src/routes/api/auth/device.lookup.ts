import { createFileRoute } from "@tanstack/react-router";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { deviceAuthSessions } from "@/lib/db/schema";

export const Route = createFileRoute("/api/auth/device/lookup")({
  server: {
    handlers: {
      // Lookup session by user code
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");

        if (!code) {
          return Response.json({ error: "Code required" }, { status: 400 });
        }

        const [session] = await db
          .select({ id: deviceAuthSessions.id })
          .from(deviceAuthSessions)
          .where(
            and(
              eq(deviceAuthSessions.userCode, code.toUpperCase()),
              eq(deviceAuthSessions.status, "pending"),
              gt(deviceAuthSessions.expiresAt, new Date())
            )
          )
          .limit(1);

        if (!session) {
          return Response.json(
            { error: "Invalid or expired code" },
            { status: 404 }
          );
        }

        return Response.json({ sessionId: session.id });
      },
    },
  },
});
