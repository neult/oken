import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/api/auth";
import { errorResponse, NotFoundError } from "@/lib/api/errors";
import type { AgentResponse, DeleteResponse } from "@/lib/api/types";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { runner } from "@/lib/runner";

export async function handleGetAgent(
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

    const response: AgentResponse = {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      status: agent.status,
      endpoint: agent.endpoint,
      pythonVersion: agent.pythonVersion,
      entrypoint: agent.entrypoint,
      createdAt: agent.createdAt?.toISOString() ?? "",
      updatedAt: agent.updatedAt?.toISOString() ?? "",
    };

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDeleteAgent(
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

    // Stop on runner if running
    if (agent.status === "running") {
      try {
        await runner.stop(agent.slug);
      } catch (err) {
        logger.error(
          { err, slug: agent.slug },
          "Failed to stop agent on runner during delete"
        );
      }
    }

    // Delete from database
    await db.delete(agents).where(eq(agents.id, agent.id));

    const response: DeleteResponse = {
      message: "Agent deleted successfully",
    };

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

export const Route = createFileRoute("/api/agents/$slug")({
  server: {
    handlers: {
      GET: ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => handleGetAgent(request, params.slug),
      DELETE: ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => handleDeleteAgent(request, params.slug),
    },
  },
});
