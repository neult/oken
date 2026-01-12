import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/__tests__/setup";

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
import { handleListAgents } from "@/routes/api/agents";
import { handleDeleteAgent, handleGetAgent } from "@/routes/api/agents.$slug";
import { handleInvokeAgent } from "@/routes/api/agents.$slug.invoke";
import { handleStopAgent } from "@/routes/api/agents.$slug.stop";

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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toEqual([]);
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleListAgents(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.agents).toHaveLength(1);
      expect(body.agents[0].slug).toBe("test-agent");
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleGetAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleGetAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.slug).toBe("test-agent");
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleDeleteAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleDeleteAgent(request, "test-agent");

      expect(response.status).toBe(200);
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

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleDeleteAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.message).toBe("Agent deleted successfully");
      expect(db.delete).toHaveBeenCalled();
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

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
        body: { input: { query: "test" } },
      });

      const response = await handleInvokeAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
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

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
        body: { input: { query: "test" } },
      });

      const response = await handleInvokeAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(runner.invoke).toHaveBeenCalledWith("test-agent", {
        query: "test",
      });
      expect(body.output).toEqual({ result: "success" });
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

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleStopAgent(request, "nonexistent");
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
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

      const updatedAgent = {
        ...mockAgent,
        status: "stopped",
        name: "Test Agent",
        endpoint: "/invoke/test-agent",
        pythonVersion: "3.12",
        entrypoint: "main.py",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedAgent]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleStopAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(runner.stop).toHaveBeenCalledWith("test-agent");
      expect(body.message).toBe("Agent stopped successfully");
    });
  });
});
