import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { agents } from "@/lib/db/schema";
import {
  createAuthenticatedRequest,
  createTestAgent,
  createTestApiKey,
  createTestUser,
} from "./helpers";
import {
  cleanDatabase,
  setupTestDatabase,
  type TestDatabase,
  teardownTestDatabase,
} from "./setup";

// We need to mock the db module to use our test database
let testDb: TestDatabase;

vi.mock("@/lib/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import handlers after mocking
const { handleListAgents } = await import("@/routes/api/agents");
const { handleGetAgent, handleDeleteAgent } = await import(
  "@/routes/api/agents.$slug"
);

describe("Agent API Integration Tests", () => {
  let testUser: { id: string; email: string };
  let apiKey: string;

  beforeAll(async () => {
    const setup = await setupTestDatabase();
    testDb = setup.db;
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(testDb);
    testUser = await createTestUser(testDb);
    apiKey = await createTestApiKey(testDb, testUser.id);
  });

  describe("GET /api/agents", () => {
    it("returns empty array when user has no agents", async () => {
      const request = createAuthenticatedRequest(apiKey);

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toEqual([]);
    });

    it("returns user's agents", async () => {
      // Create agents in database
      await createTestAgent(testDb, testUser.id, {
        name: "Agent One",
        slug: "agent-one",
      });
      await createTestAgent(testDb, testUser.id, {
        name: "Agent Two",
        slug: "agent-two",
      });

      const request = createAuthenticatedRequest(apiKey);

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toHaveLength(2);
      expect(body.agents.map((a: { slug: string }) => a.slug)).toContain(
        "agent-one"
      );
      expect(body.agents.map((a: { slug: string }) => a.slug)).toContain(
        "agent-two"
      );
    });

    it("does not return other users' agents", async () => {
      // Create another user with an agent
      const otherUser = await createTestUser(testDb, "other@example.com");
      await createTestAgent(testDb, otherUser.id, {
        name: "Other Agent",
        slug: "other-agent",
      });

      // Create agent for test user
      await createTestAgent(testDb, testUser.id, {
        name: "My Agent",
        slug: "my-agent",
      });

      const request = createAuthenticatedRequest(apiKey);

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toHaveLength(1);
      expect(body.agents[0].slug).toBe("my-agent");
    });
  });

  describe("GET /api/agents/:slug", () => {
    it("returns agent when found", async () => {
      await createTestAgent(testDb, testUser.id, {
        name: "Test Agent",
        slug: "test-agent",
        status: "running",
      });

      const request = createAuthenticatedRequest(apiKey);

      const response = await handleGetAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.name).toBe("Test Agent");
      expect(body.slug).toBe("test-agent");
      expect(body.status).toBe("running");
    });

    it("returns 404 when agent not found", async () => {
      const request = createAuthenticatedRequest(apiKey);

      const response = await handleGetAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 404 when agent belongs to another user", async () => {
      const otherUser = await createTestUser(testDb, "other@example.com");
      await createTestAgent(testDb, otherUser.id, {
        name: "Other Agent",
        slug: "other-agent",
      });

      const request = createAuthenticatedRequest(apiKey);

      const response = await handleGetAgent(request, "other-agent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /api/agents/:slug", () => {
    it("deletes agent and removes from database", async () => {
      await createTestAgent(testDb, testUser.id, {
        name: "To Delete",
        slug: "to-delete",
        status: "stopped",
      });

      const request = createAuthenticatedRequest(apiKey, { method: "DELETE" });

      const response = await handleDeleteAgent(request, "to-delete");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.message).toBe("Agent deleted successfully");

      // Verify agent is gone from database
      const [agent] = await testDb
        .select()
        .from(agents)
        .where(eq(agents.slug, "to-delete"));
      expect(agent).toBeUndefined();
    });

    it("returns 404 when agent not found", async () => {
      const request = createAuthenticatedRequest(apiKey, { method: "DELETE" });

      const response = await handleDeleteAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 404 when trying to delete another user's agent", async () => {
      const otherUser = await createTestUser(testDb, "other@example.com");
      await createTestAgent(testDb, otherUser.id, {
        name: "Other Agent",
        slug: "other-agent",
      });

      const request = createAuthenticatedRequest(apiKey, { method: "DELETE" });

      const response = await handleDeleteAgent(request, "other-agent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");

      // Verify agent still exists
      const [agent] = await testDb
        .select()
        .from(agents)
        .where(eq(agents.slug, "other-agent"));
      expect(agent).toBeDefined();
    });
  });

  describe("Authentication", () => {
    it("returns 401 for missing API key", async () => {
      const request = new Request("http://test");

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 for invalid API key", async () => {
      const request = createAuthenticatedRequest(
        "ok_invalidkey123456789012345678"
      );

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
    });
  });
});
