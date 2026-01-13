import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/api/auth";
import {
  errorResponse,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { agents, secrets } from "@/lib/db/schema";

interface SecretResponse {
  id: string;
  name: string;
  agentSlug: string | null;
  createdAt: string;
}

interface SecretsListResponse {
  secrets: SecretResponse[];
}

interface SetSecretRequest {
  name: string;
  value: string;
  agentSlug?: string;
}

export async function handleListSecrets(request: Request): Promise<Response> {
  try {
    const user = await requireAuth(request);

    const url = new URL(request.url);
    const agentSlug = url.searchParams.get("agent");

    let agentId: string | null = null;

    if (agentSlug) {
      // Get agent ID from slug
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.slug, agentSlug), eq(agents.userId, user.id)))
        .limit(1);

      if (!agent) {
        throw new NotFoundError("Agent");
      }
      agentId = agent.id;
    }

    // Build query based on whether we're filtering by agent
    const userSecrets = await db
      .select({
        id: secrets.id,
        name: secrets.name,
        agentId: secrets.agentId,
        createdAt: secrets.createdAt,
      })
      .from(secrets)
      .where(
        agentSlug && agentId
          ? and(eq(secrets.userId, user.id), eq(secrets.agentId, agentId))
          : eq(secrets.userId, user.id)
      );

    // Get agent slugs for secrets that have agentId
    const agentIds = userSecrets
      .map((s) => s.agentId)
      .filter((id): id is string => id !== null);
    const uniqueAgentIds = [...new Set(agentIds)];
    const agentMap = new Map<string, string>();

    if (uniqueAgentIds.length > 0) {
      const agentRows = await db
        .select({ id: agents.id, slug: agents.slug })
        .from(agents)
        .where(
          and(
            eq(agents.userId, user.id),
            // Filter to only the agent IDs we need
            uniqueAgentIds.length === 1
              ? eq(agents.id, uniqueAgentIds[0])
              : undefined // Will get all user's agents, filter in JS
          )
        );

      for (const a of agentRows) {
        if (uniqueAgentIds.includes(a.id)) {
          agentMap.set(a.id, a.slug);
        }
      }
    }

    const response: SecretsListResponse = {
      secrets: userSecrets.map((s) => ({
        id: s.id,
        name: s.name,
        agentSlug: s.agentId ? (agentMap.get(s.agentId) ?? null) : null,
        createdAt: s.createdAt?.toISOString() ?? "",
      })),
    };

    return Response.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSetSecret(request: Request): Promise<Response> {
  try {
    const user = await requireAuth(request);
    const body = (await request.json()) as SetSecretRequest;

    if (!body.name || typeof body.name !== "string") {
      throw new ValidationError("Secret name is required");
    }

    if (!body.value || typeof body.value !== "string") {
      throw new ValidationError("Secret value is required");
    }

    // Validate secret name format (env var style)
    if (!/^[A-Z_][A-Z0-9_]*$/.test(body.name)) {
      throw new ValidationError(
        "Secret name must be uppercase with underscores (e.g., API_KEY)"
      );
    }

    let agentId: string | null = null;

    if (body.agentSlug) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.slug, body.agentSlug), eq(agents.userId, user.id)))
        .limit(1);

      if (!agent) {
        throw new NotFoundError("Agent");
      }
      agentId = agent.id;
    }

    // Encrypt the value
    const encryptedValue = encrypt(body.value);

    // Check if secret already exists (upsert)
    const existingCondition = agentId
      ? and(
          eq(secrets.userId, user.id),
          eq(secrets.name, body.name),
          eq(secrets.agentId, agentId)
        )
      : and(
          eq(secrets.userId, user.id),
          eq(secrets.name, body.name),
          isNull(secrets.agentId)
        );

    const [existing] = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(existingCondition)
      .limit(1);

    if (existing) {
      // Update existing secret
      await db
        .update(secrets)
        .set({ value: encryptedValue })
        .where(eq(secrets.id, existing.id));

      return Response.json({
        message: "Secret updated",
        name: body.name,
        agentSlug: body.agentSlug ?? null,
      });
    }

    // Create new secret
    await db.insert(secrets).values({
      userId: user.id,
      agentId,
      name: body.name,
      value: encryptedValue,
    });

    return Response.json(
      {
        message: "Secret created",
        name: body.name,
        agentSlug: body.agentSlug ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDeleteSecret(request: Request): Promise<Response> {
  try {
    const user = await requireAuth(request);

    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const agentSlug = url.searchParams.get("agent");

    if (!name) {
      throw new ValidationError("Secret name is required");
    }

    let agentId: string | null = null;

    if (agentSlug) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.slug, agentSlug), eq(agents.userId, user.id)))
        .limit(1);

      if (!agent) {
        throw new NotFoundError("Agent");
      }
      agentId = agent.id;
    }

    const deleteCondition = agentId
      ? and(
          eq(secrets.userId, user.id),
          eq(secrets.name, name),
          eq(secrets.agentId, agentId)
        )
      : and(
          eq(secrets.userId, user.id),
          eq(secrets.name, name),
          isNull(secrets.agentId)
        );

    await db.delete(secrets).where(deleteCondition);

    return Response.json({ message: "Secret deleted", name });
  } catch (error) {
    return errorResponse(error);
  }
}

// Internal function to get decrypted secrets for an agent (used during deploy)
export async function getSecretsForAgent(
  userId: string,
  agentId: string
): Promise<Record<string, string>> {
  // Get user-level secrets (agentId = null)
  const userSecrets = await db
    .select({ name: secrets.name, value: secrets.value })
    .from(secrets)
    .where(and(eq(secrets.userId, userId), isNull(secrets.agentId)));

  // Get agent-specific secrets
  const agentSecrets = await db
    .select({ name: secrets.name, value: secrets.value })
    .from(secrets)
    .where(and(eq(secrets.userId, userId), eq(secrets.agentId, agentId)));

  // Merge: agent-specific overrides user-level
  const result: Record<string, string> = {};

  for (const s of userSecrets) {
    result[s.name] = decrypt(s.value);
  }

  for (const s of agentSecrets) {
    result[s.name] = decrypt(s.value);
  }

  return result;
}

export const Route = createFileRoute("/api/secrets")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => handleListSecrets(request),
      POST: ({ request }: { request: Request }) => handleSetSecret(request),
      DELETE: ({ request }: { request: Request }) =>
        handleDeleteSecret(request),
    },
  },
});
