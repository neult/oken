import { generateApiKey, hashApiKey } from "@/lib/auth/device";
import { agents, apiKeys, users } from "@/lib/db/schema";
import type { TestDatabase } from "./setup";

export async function createTestUser(
  db: TestDatabase,
  email = "test@example.com"
) {
  const [user] = await db.insert(users).values({ email }).returning();
  return user;
}

export async function createTestApiKey(
  db: TestDatabase,
  userId: string
): Promise<string> {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  await db.insert(apiKeys).values({
    userId,
    name: "Test Key",
    keyHash,
    keyPrefix: apiKey.substring(0, 11),
  });

  return apiKey;
}

export async function createTestAgent(
  db: TestDatabase,
  userId: string,
  data: { name: string; slug: string; status?: string }
) {
  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name: data.name,
      slug: data.slug,
      status: data.status ?? "running",
    })
    .returning();
  return agent;
}

export function createAuthenticatedRequest(
  apiKey: string,
  options: {
    method?: string;
    url?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = "GET", url = "http://test", body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
  }

  return new Request(url, init);
}
