import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/api/auth";
import { errorResponse, NotFoundError } from "@/lib/api/errors";
import type { AgentResponse, DeleteResponse } from "@/lib/api/types";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { runner } from "@/lib/runner";

export const Route = createFileRoute("/api/agents/$slug")({
  server: {
    handlers: {
      // Get single agent
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => {
        try {
          const user = await requireAuth(request);
          const { slug } = params;

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
      },

      // Delete agent
      DELETE: async ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => {
        try {
          const user = await requireAuth(request);
          const { slug } = params;

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
              console.error(
                `Failed to stop agent ${agent.slug} on runner during delete:`,
                err
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
      },
    },
  },
});
