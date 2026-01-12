import { createFileRoute } from "@tanstack/react-router";
import { and, eq, gt } from "drizzle-orm";
import { errorResponse, ValidationError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { deviceAuthSessions } from "@/lib/db/schema";

export async function handleLookupDeviceAuth(
  request: Request
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
      throw new ValidationError("Code required");
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
        { error: "Invalid or expired code", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return Response.json({ sessionId: session.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/auth/device/lookup")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        handleLookupDeviceAuth(request),
    },
  },
});
