import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/__tests__/setup";

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
import { generateApiKey } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { handleStartDeviceAuth } from "@/routes/api/auth/device";
import { handlePollDeviceAuth } from "@/routes/api/auth/device.$sessionId";
import { handleApproveDeviceAuth } from "@/routes/api/auth/device.$sessionId.approve";
import { handleLookupDeviceAuth } from "@/routes/api/auth/device.lookup";

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

      const response = await handleStartDeviceAuth();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe("session-123");
      expect(body.userCode).toBe("ABCD-1234");
      expect(body.pollInterval).toBe(5);
    });
  });

  describe("GET /api/auth/device/:sessionId", () => {
    it("returns 400 for invalid UUID format", async () => {
      const response = await handlePollDeviceAuth("not-a-uuid");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
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

      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 410 when session is expired", async () => {
      const expiredSession = {
        id: "12345678-1234-1234-1234-123456789012",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([expiredSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body.code).toBe("EXPIRED");
    });

    it("returns pending status when session is pending", async () => {
      const pendingSession = {
        id: "12345678-1234-1234-1234-123456789012",
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

      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("pending");
    });

    it("returns token when session is approved", async () => {
      const approvedSession = {
        id: "12345678-1234-1234-1234-123456789012",
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
            returning: vi
              .fn()
              .mockResolvedValue([{ ...approvedSession, status: "completed" }]),
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

      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("approved");
      expect(body.token).toBe(generateApiKey());
    });

    it("returns 409 when session already processed (race condition)", async () => {
      const approvedSession = {
        id: "12345678-1234-1234-1234-123456789012",
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
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });
  });

  describe("POST /api/auth/device/:sessionId/approve", () => {
    it("returns 401 when user is not logged in", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns 400 for invalid UUID format", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        session: { id: "session-id" },
      } as never);

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(request, "invalid");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
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

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 410 when session is expired", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        session: { id: "session-id" },
      } as never);

      const expiredSession = {
        id: "12345678-1234-1234-1234-123456789012",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([expiredSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body.code).toBe("EXPIRED");
    });

    it("approves session and links to user", async () => {
      const mockUser = { id: "user-123", email: "test@example.com" };

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: mockUser,
        session: { id: "session-id" },
      } as never);

      const pendingSession = {
        id: "12345678-1234-1234-1234-123456789012",
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
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([
                { ...pendingSession, status: "approved", userId: mockUser.id },
              ]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it("returns 409 when session already processed (race condition)", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        session: { id: "session-id" },
      } as never);

      const pendingSession = {
        id: "12345678-1234-1234-1234-123456789012",
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

      // Simulate race condition: update returns empty (another request already processed)
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const request = createMockRequest({
        method: "POST",
      });

      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/auth/device/lookup", () => {
    it("returns 400 when code is missing", async () => {
      const request = createMockRequest({
        url: "http://test/api/auth/device/lookup",
      });

      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
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

      const request = createMockRequest({
        url: "http://test/api/auth/device/lookup?code=ABCD-1234",
      });

      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns session info when found", async () => {
      const mockSession = {
        id: "session-123",
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSession]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const request = createMockRequest({
        url: "http://test/api/auth/device/lookup?code=ABCD-1234",
      });

      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe("session-123");
    });
  });
});
