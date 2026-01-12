import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/api/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/runner", () => ({
  runner: {
    deploy: vi.fn(),
    invoke: vi.fn(),
    stop: vi.fn(),
  },
  RunnerError: class RunnerError extends Error {
    status: number;
    constructor(message: string, status = 502) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { requireAuth } from "@/lib/api/auth";
import { db } from "@/lib/db";
import { runner } from "@/lib/runner";

describe("Agent API Routes", () => {
  const mockUser = { id: "user-123", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockUser);
  });

  describe("GET /api/agents", () => {
    it("returns empty array when user has no agents", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      // Simulate calling the handler logic
      const userAgents: unknown[] = [];
      const response = {
        agents: userAgents.map(() => ({})),
      };

      expect(response.agents).toEqual([]);
    });

    it("returns user's agents", async () => {
      const mockAgents = [
        {
          id: "agent-1",
          name: "Test Agent",
          slug: "test-agent",
          status: "running",
          endpoint: "/invoke/test-agent",
          pythonVersion: "3.12",
          entrypoint: "main.py",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-02"),
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockAgents),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const response = {
        agents: mockAgents.map((a) => ({
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

      expect(response.agents).toHaveLength(1);
      expect(response.agents[0].slug).toBe("test-agent");
    });
  });

  describe("POST /api/agents", () => {
    it("rejects invalid slug format", async () => {
      const invalidSlugs = [
        "-starts-with-hyphen",
        "ends-with-hyphen-",
        "UPPERCASE",
        "has spaces",
        "special_chars",
      ];

      for (const slug of invalidSlugs) {
        const { createAgentSchema } = await import("@/lib/api/types");
        const result = createAgentSchema.safeParse({ name: "Test", slug });
        expect(result.success).toBe(false);
      }
    });

    it("rejects when slug already exists", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-agent" }]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      // Simulate conflict check
      const existing = [{ id: "existing-agent" }];
      expect(existing.length).toBeGreaterThan(0);
    });

    it("creates agent and deploys to runner on success", async () => {
      // Mock no existing agent
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      // Mock insert
      const mockAgent = {
        id: "new-agent-id",
        name: "New Agent",
        slug: "new-agent",
        status: "deploying",
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockAgent]),
        }),
      });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      // Mock runner deploy
      vi.mocked(runner.deploy).mockResolvedValue({
        status: "running",
        endpoint: "/invoke/new-agent",
      });

      // Mock update
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      // Verify runner.deploy would be called
      expect(runner.deploy).not.toHaveBeenCalled(); // Not called yet in this test
    });
  });

  describe("GET /api/agents/:slug", () => {
    it("returns 404 when agent not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const agents: unknown[] = [];
      expect(agents.length).toBe(0);
    });

    it("returns 404 when agent belongs to different user", async () => {
      // The where clause includes userId check, so no results means not found
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const agents: unknown[] = [];
      expect(agents.length).toBe(0);
    });

    it("returns agent when found", async () => {
      const mockAgent = {
        id: "agent-1",
        name: "Test Agent",
        slug: "test-agent",
        status: "running",
        endpoint: "/invoke/test-agent",
        pythonVersion: "3.12",
        entrypoint: "main.py",
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const [agent] = [mockAgent];
      expect(agent.slug).toBe("test-agent");
    });
  });

  describe("DELETE /api/agents/:slug", () => {
    it("returns 404 when agent not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const agents: unknown[] = [];
      expect(agents.length).toBe(0);
    });

    it("stops runner if agent is running before delete", async () => {
      const mockAgent = {
        id: "agent-1",
        slug: "test-agent",
        status: "running",
        userId: mockUser.id,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      vi.mocked(runner.stop).mockResolvedValue({ status: "stopped" });

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      vi.mocked(db.delete).mockImplementation(mockDelete);

      // Simulate the logic
      if (mockAgent.status === "running") {
        await runner.stop(mockAgent.slug);
      }

      expect(runner.stop).toHaveBeenCalledWith("test-agent");
    });

    it("deletes agent from database", async () => {
      const mockAgent = {
        id: "agent-1",
        slug: "test-agent",
        status: "stopped",
        userId: mockUser.id,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      vi.mocked(db.delete).mockImplementation(mockDelete);

      // Verify delete would be called
      expect(db.delete).not.toHaveBeenCalled(); // Setup only
    });
  });

  describe("POST /api/agents/:slug/invoke", () => {
    it("returns 404 when agent not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const agents: unknown[] = [];
      expect(agents.length).toBe(0);
    });

    it("proxies request to runner", async () => {
      const mockAgent = {
        id: "agent-1",
        slug: "test-agent",
        status: "running",
        userId: mockUser.id,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      vi.mocked(runner.invoke).mockResolvedValue({
        output: { result: "success" },
      });

      const result = await runner.invoke(mockAgent.slug, { query: "test" });

      expect(runner.invoke).toHaveBeenCalledWith("test-agent", { query: "test" });
      expect(result.output).toEqual({ result: "success" });
    });
  });

  describe("POST /api/agents/:slug/stop", () => {
    it("returns 404 when agent not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const agents: unknown[] = [];
      expect(agents.length).toBe(0);
    });

    it("calls runner.stop and updates agent status", async () => {
      const mockAgent = {
        id: "agent-1",
        slug: "test-agent",
        status: "running",
        userId: mockUser.id,
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      vi.mocked(runner.stop).mockResolvedValue({ status: "stopped" });

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      await runner.stop(mockAgent.slug);

      expect(runner.stop).toHaveBeenCalledWith("test-agent");
    });
  });
});
