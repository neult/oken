import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { requireAuth } from "@/lib/api/auth";
import {
  errorResponse,
  NotFoundError,
  ValidationError,
  RunnerError as ApiRunnerError,
} from "@/lib/api/errors";
import type { StopResponse } from "@/lib/api/types";
import { runner, RunnerError } from "@/lib/runner";

export const Route = createFileRoute("/api/agents/$slug/stop")({
  server: {
    handlers: {
      POST: async ({
        request,
        params,
      }: {
        request: Request;
        params: { slug: string };
      }) => {
        try {
          const user = await requireAuth(request);
          const { slug } = params;

          // Get agent
          const [agent] = await db
            .select()
            .from(agents)
            .where(and(eq(agents.slug, slug), eq(agents.userId, user.id)))
            .limit(1);

          if (!agent) {
            throw new NotFoundError("Agent");
          }

          if (agent.status !== "running") {
            throw new ValidationError(
              `Agent is not running (status: ${agent.status})`
            );
          }

          // Stop on runner
          try {
            await runner.stop(agent.slug);
          } catch (err) {
            if (err instanceof RunnerError) {
              throw new ApiRunnerError(err.message, err.status);
            }
            throw err;
          }

          // Update database
          const [updated] = await db
            .update(agents)
            .set({ status: "stopped", updatedAt: new Date() })
            .where(eq(agents.id, agent.id))
            .returning();

          const response: StopResponse = {
            agent: {
              id: updated.id,
              name: updated.name,
              slug: updated.slug,
              status: updated.status,
              endpoint: updated.endpoint,
              pythonVersion: updated.pythonVersion,
              entrypoint: updated.entrypoint,
              createdAt: updated.createdAt?.toISOString() ?? "",
              updatedAt: updated.updatedAt?.toISOString() ?? "",
            },
            message: "Agent stopped successfully",
          };

          return Response.json(response);
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
