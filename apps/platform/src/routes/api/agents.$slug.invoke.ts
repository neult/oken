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
import { invokeAgentSchema, type InvokeResponse } from "@/lib/api/types";
import { runner, RunnerError } from "@/lib/runner";

export const Route = createFileRoute("/api/agents/$slug/invoke")({
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

          // Parse request body
          const body = await request.json();
          const parsed = invokeAgentSchema.safeParse(body);
          if (!parsed.success) {
            throw new ValidationError(parsed.error.issues[0].message);
          }

          // Forward to runner
          try {
            const result = await runner.invoke(agent.slug, parsed.data.input);

            const response: InvokeResponse = {
              output: result.output ?? null,
            };

            return Response.json(response);
          } catch (err) {
            if (err instanceof RunnerError) {
              throw new ApiRunnerError(err.message, err.status);
            }
            throw err;
          }
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
