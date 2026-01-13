import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/api/auth";
import { errorResponse, NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { runner } from "@/lib/runner";

export async function handleGetLogs(
  request: Request,
  slug: string
): Promise<Response> {
  try {
    const user = await requireAuth(request);

    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.slug, slug), eq(agents.userId, user.id)))
      .limit(1);

    if (!agent) {
      throw new NotFoundError("Agent");
    }

    // Parse query params
    const url = new URL(request.url);
    const follow = url.searchParams.get("follow") === "true";
    const tail = Math.min(
      Math.max(Number.parseInt(url.searchParams.get("tail") ?? "100", 10), 1),
      10000
    );

    if (follow) {
      // Proxy SSE stream from runner
      const streamUrl = runner.logsStreamUrl(agent.slug, tail);
      const runnerRes = await fetch(streamUrl);

      if (!runnerRes.ok) {
        const error = await runnerRes.json().catch(() => ({}));
        return Response.json(
          { error: error.error ?? "Failed to stream logs" },
          { status: runnerRes.status }
        );
      }

      // Proxy the stream
      return new Response(runnerRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming: fetch logs and return
    const logsResponse = await runner.logs(agent.slug, tail);
    return Response.json({ logs: logsResponse.logs });
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/agents/$slug/logs")({
  server: {
    handlers: {
      GET: ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => handleGetLogs(request, params.slug),
    },
  },
});
