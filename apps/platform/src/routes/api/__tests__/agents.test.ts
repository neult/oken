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
import { handleCreateAgent, handleListAgents } from "@/routes/api/agents";
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

    it("creates agent and deploys to runner", async () => {
      const mockAgent = {
        id: "agent-1",
        name: "Test Agent",
        slug: "test-agent",
        status: "deploying",
        userId: mockUser.id,
        pythonVersion: "3.12",
        entrypoint: "main.py",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDeployment = {
        id: "deploy-1",
        agentId: "agent-1",
        status: "pending",
      };

      // Mock db.select for slug check (not found) and secrets fetch (empty)
      // The where() result needs to be both thenable AND have .limit()
      const createWhereResult = () => {
        const result = Promise.resolve([]);
        (
          result as Promise<unknown[]> & { limit: () => Promise<unknown[]> }
        ).limit = vi.fn().mockResolvedValue([]);
        return result;
      };
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => createWhereResult()),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      // Mock db.insert for agent and deployment
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockAgent]),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockDeployment]),
          }),
        });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      // Mock runner.deploy
      vi.mocked(runner.deploy).mockResolvedValue({
        status: "running",
        endpoint: "/invoke/test-agent",
      });

      // Mock db.update for agent and deployment status
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      // Create mock request with mocked formData
      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(12)),
      };
      const mockFormData = {
        get: vi.fn((key: string) => {
          if (key === "name") return "Test Agent";
          if (key === "slug") return "test-agent";
          if (key === "tarball") return mockFile;
          return null;
        }),
      };

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });
      vi.spyOn(request, "formData").mockResolvedValue(
        mockFormData as unknown as FormData
      );

      const response = await handleCreateAgent(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.agent.slug).toBe("test-agent");
      expect(body.agent.status).toBe("running");
      expect(runner.deploy).toHaveBeenCalled();
    });

    it("returns 409 when slug already exists", async () => {
      // Mock db.select to return existing agent
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-agent" }]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockFormData = {
        get: vi.fn((key: string) => {
          if (key === "name") return "Test Agent";
          if (key === "slug") return "existing-slug";
          if (key === "tarball")
            return new File(["test content"], "agent.tar.gz");
          return null;
        }),
      };

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });
      vi.spyOn(request, "formData").mockResolvedValue(
        mockFormData as unknown as FormData
      );

      const response = await handleCreateAgent(request);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });

    it("returns 400 when tarball is missing", async () => {
      const mockFormData = {
        get: vi.fn((key: string) => {
          if (key === "name") return "Test Agent";
          if (key === "slug") return "test-agent";
          return null;
        }),
      };

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });
      vi.spyOn(request, "formData").mockResolvedValue(
        mockFormData as unknown as FormData
      );

      const response = await handleCreateAgent(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid name/slug", async () => {
      const mockFormData = {
        get: vi.fn((key: string) => {
          if (key === "name") return "";
          if (key === "slug") return "INVALID-UPPERCASE";
          if (key === "tarball")
            return new File(["test content"], "agent.tar.gz");
          return null;
        }),
      };

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });
      vi.spyOn(request, "formData").mockResolvedValue(
        mockFormData as unknown as FormData
      );

      const response = await handleCreateAgent(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 502 when runner.deploy throws RunnerError", async () => {
      const { RunnerError } = await import("@/lib/runner");

      const mockAgent = {
        id: "agent-1",
        name: "Test Agent",
        slug: "test-agent",
        status: "deploying",
        userId: mockUser.id,
        pythonVersion: "3.12",
        entrypoint: "main.py",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDeployment = {
        id: "deploy-1",
        agentId: "agent-1",
        status: "pending",
      };

      // Mock db.select for slug check (not found) and secrets fetch (empty)
      // The where() result needs to be both thenable AND have .limit()
      const createWhereResult = () => {
        const result = Promise.resolve([]);
        (
          result as Promise<unknown[]> & { limit: () => Promise<unknown[]> }
        ).limit = vi.fn().mockResolvedValue([]);
        return result;
      };
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => createWhereResult()),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockAgent]),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockDeployment]),
          }),
        });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      vi.mocked(runner.deploy).mockRejectedValue(
        new RunnerError("Runner unavailable", 502)
      );

      const mockFile = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(12)),
      };
      const mockFormData = {
        get: vi.fn((key: string) => {
          if (key === "name") return "Test Agent";
          if (key === "slug") return "test-agent";
          if (key === "tarball") return mockFile;
          return null;
        }),
      };

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });
      vi.spyOn(request, "formData").mockResolvedValue(
        mockFormData as unknown as FormData
      );

      const response = await handleCreateAgent(request);
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.code).toBe("RUNNER_ERROR");
      expect(body.error).toBe("Runner unavailable");
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

    it("returns 400 when agent is not running", async () => {
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

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
        body: { input: { query: "test" } },
      });

      const response = await handleInvokeAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.error).toContain("not running");
    });

    it("returns 502 when runner.invoke throws RunnerError", async () => {
      const { RunnerError } = await import("@/lib/runner");

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

      vi.mocked(runner.invoke).mockRejectedValue(
        new RunnerError("Agent execution failed", 502)
      );

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
        body: { input: { query: "test" } },
      });

      const response = await handleInvokeAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.code).toBe("RUNNER_ERROR");
      expect(body.error).toBe("Agent execution failed");
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

    it("returns 400 when agent is not running", async () => {
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

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleStopAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.error).toContain("not running");
    });

    it("returns 502 when runner.stop throws RunnerError", async () => {
      const { RunnerError } = await import("@/lib/runner");

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

      vi.mocked(runner.stop).mockRejectedValue(
        new RunnerError("Failed to stop agent", 502)
      );

      const request = createMockRequest({
        method: "POST",
        headers: { Authorization: "Bearer ok_testkey123456789012345678" },
      });

      const response = await handleStopAgent(request, "test-agent");
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.code).toBe("RUNNER_ERROR");
      expect(body.error).toBe("Failed to stop agent");
    });
  });
});
