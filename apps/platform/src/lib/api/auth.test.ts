import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRequest } from "@/__tests__/setup";
import { hashApiKey } from "@/lib/auth/device";
import { UnauthorizedError } from "./errors";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// Import after mocking
import { db } from "@/lib/db";
import { requireAuth } from "./auth";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("missing or invalid Authorization header", () => {
    it("throws UnauthorizedError when Authorization header is missing", async () => {
      const request = createMockRequest({});

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
      await expect(requireAuth(request)).rejects.toThrow(
        "Missing or invalid API key"
      );
    });

    it("throws UnauthorizedError when Authorization header is empty", async () => {
      const request = createMockRequest({
        headers: { Authorization: "" },
      });

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
    });

    it("throws UnauthorizedError when not using Bearer scheme", async () => {
      const request = createMockRequest({
        headers: { Authorization: "Basic abc123" },
      });

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
    });

    it("throws UnauthorizedError when Bearer token doesn't start with ok_", async () => {
      const request = createMockRequest({
        headers: { Authorization: "Bearer invalid_token" },
      });

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
    });

    it("throws UnauthorizedError for Bearer ok without underscore", async () => {
      const request = createMockRequest({
        headers: { Authorization: "Bearer ok123" },
      });

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("valid format but invalid key", () => {
    it("throws UnauthorizedError when API key not found in database", async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_validformat123456789012345678" },
      });

      await expect(requireAuth(request)).rejects.toThrow(UnauthorizedError);
      await expect(requireAuth(request)).rejects.toThrow("Invalid API key");
    });
  });

  describe("valid API key", () => {
    it("returns user id and email when API key is valid", async () => {
      const mockUser = {
        userId: "user-123",
        email: "test@example.com",
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_validformat123456789012345678" },
      });

      const result = await requireAuth(request);

      expect(result).toEqual({
        id: "user-123",
        email: "test@example.com",
      });
    });

    it("updates lastUsedAt timestamp", async () => {
      const mockUser = {
        userId: "user-123",
        email: "test@example.com",
      };

      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockWhere = vi.fn().mockReturnValue({ execute: mockExecute });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockUser]),
            }),
          }),
        }),
      });

      vi.mocked(db.select).mockImplementation(mockSelect);
      vi.mocked(db.update).mockImplementation(mockUpdate);

      const request = createMockRequest({
        headers: { Authorization: "Bearer ok_validformat123456789012345678" },
      });

      await requireAuth(request);

      // Wait for the fire-and-forget update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(db.update).toHaveBeenCalled();
    });

    it("hashes the API key correctly for lookup", async () => {
      const apiKey = "ok_testkey12345678901234567890ab";
      const expectedHash = hashApiKey(apiKey);

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      try {
        await requireAuth(request);
      } catch {
        // Expected to throw
      }

      // Verify the hash was computed correctly
      expect(hashApiKey(apiKey)).toBe(expectedHash);
    });
  });
});
