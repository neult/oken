import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, deployments } from "@/lib/db/schema";
import { requireAuth } from "@/lib/api/auth";
import {
  errorResponse,
  ValidationError,
  ConflictError,
  RunnerError as ApiRunnerError,
} from "@/lib/api/errors";
import {
  createAgentSchema,
  type AgentListResponse,
  type DeployResponse,
} from "@/lib/api/types";
import { runner, RunnerError } from "@/lib/runner";

export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      // List user's agents
      GET: async ({ request }: { request: Request }) => {
        try {
          const user = await requireAuth(request);

          const userAgents = await db
            .select()
            .from(agents)
            .where(eq(agents.userId, user.id));

          const response: AgentListResponse = {
            agents: userAgents.map((a) => ({
              id: a.id,
              name: a.name,
              slug: a.slug,
              status: a.status,
              endpoint: a.endpoint,
              pythonVersion: a.pythonVersion,
              entrypoint: a.entrypoint,
              createdAt: a.createdAt?.toISOString() ?? "",
              updatedAt: a.updatedAt?.toISOString() ?? "",
            })),
          };

          return Response.json(response);
        } catch (error) {
          return errorResponse(error);
        }
      },

      // Create agent + deploy (receives tarball as multipart form)
      POST: async ({ request }: { request: Request }) => {
        try {
          const user = await requireAuth(request);

          const formData = await request.formData();
          const name = formData.get("name") as string;
          const slug = formData.get("slug") as string;
          const tarball = formData.get("tarball") as File | null;

          // Validate input
          const parsed = createAgentSchema.safeParse({ name, slug });
          if (!parsed.success) {
            throw new ValidationError(parsed.error.issues[0].message);
          }

          if (!tarball) {
            throw new ValidationError("tarball is required");
          }

          // Check if slug already exists
          const [existing] = await db
            .select({ id: agents.id })
            .from(agents)
            .where(eq(agents.slug, parsed.data.slug))
            .limit(1);

          if (existing) {
            throw new ConflictError(
              `Agent with slug '${parsed.data.slug}' already exists`
            );
          }

          // Create agent record
          const [agent] = await db
            .insert(agents)
            .values({
              userId: user.id,
              name: parsed.data.name,
              slug: parsed.data.slug,
              status: "deploying",
            })
            .returning();

          // Create deployment record
          const [deployment] = await db
            .insert(deployments)
            .values({
              agentId: agent.id,
              status: "pending",
            })
            .returning();

          // Forward to runner (use slug as agent_id)
          try {
            const tarballBuffer = await tarball.arrayBuffer();
            const result = await runner.deploy(agent.slug, tarballBuffer);

            // Update agent with endpoint
            await db
              .update(agents)
              .set({
                status: result.status,
                endpoint: result.endpoint ?? null,
                updatedAt: new Date(),
              })
              .where(eq(agents.id, agent.id));

            // Update deployment
            await db
              .update(deployments)
              .set({
                status: result.status,
                finishedAt: new Date(),
              })
              .where(eq(deployments.id, deployment.id));

            const response: DeployResponse = {
              agent: {
                id: agent.id,
                name: agent.name,
                slug: agent.slug,
                status: result.status,
                endpoint: result.endpoint ?? null,
                pythonVersion: agent.pythonVersion,
                entrypoint: agent.entrypoint,
                createdAt: agent.createdAt?.toISOString() ?? "",
                updatedAt: new Date().toISOString(),
              },
              deployment: {
                id: deployment.id,
                status: result.status,
              },
            };

            return Response.json(response, { status: 201 });
          } catch (err) {
            // Update status to error
            const errorMsg =
              err instanceof Error ? err.message : "Unknown error";

            await db
              .update(agents)
              .set({ status: "error", updatedAt: new Date() })
              .where(eq(agents.id, agent.id));

            await db
              .update(deployments)
              .set({
                status: "error",
                logs: errorMsg,
                finishedAt: new Date(),
              })
              .where(eq(deployments.id, deployment.id));

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
