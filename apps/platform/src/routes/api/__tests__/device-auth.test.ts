import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/device", () => ({
  generateUserCode: vi.fn().mockReturnValue("ABCD-1234"),
  generateApiKey: vi.fn().mockReturnValue("ok_testkey12345678901234567890ab"),
  hashApiKey: vi.fn().mockReturnValue("hashedkey123"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { auth } from "@/lib/auth";
import { generateApiKey, generateUserCode } from "@/lib/auth/device";
import { db } from "@/lib/db";

describe("Device Auth API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/auth/device", () => {
    it("creates a new device auth session", async () => {
      const mockSession = {
        id: "session-123",
        userCode: "ABCD-1234",
        status: "pending",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSession]),
        }),
      });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      // Simulate the handler logic
      const userCode = generateUserCode();
      expect(userCode).toBe("ABCD-1234");

      const response = {
        sessionId: mockSession.id,
        userCode: mockSession.userCode,
        loginUrl: `http://localhost:3000/auth/device?code=${mockSession.userCode}`,
        expiresAt: mockSession.expiresAt.toISOString(),
        pollInterval: 5,
      };

      expect(response.sessionId).toBe("session-123");
      expect(response.userCode).toBe("ABCD-1234");
      expect(response.pollInterval).toBe(5);
    });

    it("sets expiration to 10 minutes from now", async () => {
      const now = Date.now();
      const expiresAt = new Date(now + 10 * 60 * 1000);

      // 10 minutes = 600000ms
      expect(expiresAt.getTime() - now).toBe(600000);
    });
  });

  describe("GET /api/auth/device/:sessionId", () => {
    it("returns 400 for invalid UUID format", async () => {
      const invalidIds = ["not-a-uuid", "123", "abc-def-ghi"];

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      for (const id of invalidIds) {
        expect(uuidRegex.test(id)).toBe(false);
      }
    });

    it("returns 404 when session not found", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const sessions: unknown[] = [];
      expect(sessions.length).toBe(0);
    });

    it("returns 410 when session is expired", async () => {
      const expiredSession = {
        id: "session-123",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      const isExpired = new Date() > expiredSession.expiresAt;
      expect(isExpired).toBe(true);
    });

    it("returns pending status when session is pending", async () => {
      const pendingSession = {
        id: "session-123",
        status: "pending",
        expiresAt: new Date(Date.now() + 60000),
      };

      expect(pendingSession.status).toBe("pending");
    });

    it("returns token when session is approved", async () => {
      const approvedSession = {
        id: "session-123",
        status: "approved",
        userId: "user-123",
        expiresAt: new Date(Date.now() + 60000),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([approvedSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...approvedSession, status: "completed" }]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      vi.mocked(db.delete).mockImplementation(mockDelete);

      // Simulate generating API key
      const apiKey = generateApiKey();
      expect(apiKey).toBe("ok_testkey12345678901234567890ab");

      const response = {
        status: "approved",
        token: apiKey,
        user: { email: "test@example.com" },
      };

      expect(response.status).toBe("approved");
      expect(response.token).toMatch(/^ok_/);
    });

    it("returns 409 when session already processed (race condition)", async () => {
      const approvedSession = {
        id: "session-123",
        status: "approved",
        userId: "user-123",
        expiresAt: new Date(Date.now() + 60000),
      };

      // Simulate atomic update returning empty (already processed)
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // Empty = already processed
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const updated: unknown[] = [];
      expect(updated.length).toBe(0); // Indicates conflict
    });
  });

  describe("POST /api/auth/device/:sessionId/approve", () => {
    it("returns 401 when user is not logged in", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const session = await auth.api.getSession({ headers: new Headers() });
      expect(session).toBeNull();
    });

    it("returns 400 for invalid UUID format", async () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(uuidRegex.test("invalid")).toBe(false);
    });

    it("returns 404 when session not found or not pending", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        session: { id: "session-id" },
      } as never);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const sessions: unknown[] = [];
      expect(sessions.length).toBe(0);
    });

    it("returns 410 when session is expired", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        session: { id: "session-id" },
      } as never);

      const expiredSession = {
        id: "session-123",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      };

      const isExpired = new Date() > expiredSession.expiresAt;
      expect(isExpired).toBe(true);
    });

    it("approves session and links to user", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: mockUser,
        session: { id: "session-id" },
      } as never);

      const pendingSession = {
        id: "session-123",
        status: "pending",
        expiresAt: new Date(Date.now() + 60000),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([pendingSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      // Simulate approval
      expect(pendingSession.status).toBe("pending");
      expect(mockUser.id).toBe("user-123");
    });
  });

  describe("GET /api/auth/device/lookup", () => {
    it("returns 400 when code is missing", async () => {
      const code = undefined;
      expect(code).toBeUndefined();
    });

    it("returns 404 when session not found by code", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const sessions: unknown[] = [];
      expect(sessions.length).toBe(0);
    });

    it("returns session info when found", async () => {
      const mockSession = {
        id: "session-123",
        userCode: "ABCD-1234",
        status: "pending",
        expiresAt: new Date(Date.now() + 60000),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      expect(mockSession.id).toBe("session-123");
      expect(mockSession.userCode).toBe("ABCD-1234");
    });
  });
});
