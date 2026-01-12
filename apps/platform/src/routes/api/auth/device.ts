import { createFileRoute } from "@tanstack/react-router";
import { errorResponse } from "@/lib/api/errors";
import { generateUserCode } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { deviceAuthSessions } from "@/lib/db/schema";

export async function handleStartDeviceAuth(): Promise<Response> {
  try {
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const [session] = await db
      .insert(deviceAuthSessions)
      .values({
        userCode,
        status: "pending",
        expiresAt,
      })
      .returning();

    const baseUrl = process.env.PLATFORM_URL || "http://localhost:3000";

    return Response.json({
      sessionId: session.id,
      userCode: session.userCode,
      loginUrl: `${baseUrl}/auth/device?code=${session.userCode}`,
      expiresAt: session.expiresAt.toISOString(),
      pollInterval: 5,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/auth/device")({
  server: {
    handlers: {
      POST: () => handleStartDeviceAuth(),
    },
  },
});
