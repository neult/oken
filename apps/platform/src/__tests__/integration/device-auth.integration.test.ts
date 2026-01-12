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
import { deviceAuthSessions } from "@/lib/db/schema";
import { createTestUser } from "./helpers";
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

// Mock Better Auth for approve endpoint
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Import handlers and auth after mocking
const { handleStartDeviceAuth } = await import("@/routes/api/auth/device");
const { handlePollDeviceAuth } = await import(
  "@/routes/api/auth/device.$sessionId"
);
const { handleApproveDeviceAuth } = await import(
  "@/routes/api/auth/device.$sessionId.approve"
);
const { handleLookupDeviceAuth } = await import(
  "@/routes/api/auth/device.lookup"
);
const { auth } = await import("@/lib/auth");

describe("Device Auth API Integration Tests", () => {
  beforeAll(async () => {
    const setup = await setupTestDatabase();
    testDb = setup.db;
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(testDb);
    vi.clearAllMocks();
  });

  describe("POST /api/auth/device", () => {
    it("creates a new device auth session in database", async () => {
      const response = await handleStartDeviceAuth();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBeDefined();
      expect(body.userCode).toMatch(/^[A-Z]{4}-[0-9]{4}$/);
      expect(body.pollInterval).toBe(5);

      // Verify session exists in database
      const [session] = await testDb
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.id, body.sessionId));

      expect(session).toBeDefined();
      expect(session.status).toBe("pending");
      expect(session.userCode).toBe(body.userCode);
    });

    it("creates unique user codes", async () => {
      const response1 = await handleStartDeviceAuth();
      const response2 = await handleStartDeviceAuth();

      const body1 = await response1.json();
      const body2 = await response2.json();

      expect(body1.userCode).not.toBe(body2.userCode);
    });
  });

  describe("GET /api/auth/device/:sessionId", () => {
    it("returns pending status for new session", async () => {
      // Create session
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      // Poll
      const response = await handlePollDeviceAuth(sessionId);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("pending");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await handlePollDeviceAuth(
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 400 for invalid UUID format", async () => {
      const response = await handlePollDeviceAuth("not-a-uuid");
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 410 for expired session", async () => {
      // Create session and manually expire it
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      // Update session to be expired
      await testDb
        .update(deviceAuthSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(deviceAuthSessions.id, sessionId));

      const response = await handlePollDeviceAuth(sessionId);
      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body.code).toBe("EXPIRED");
    });

    it("returns token when session is approved", async () => {
      // Create session
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      // Create user and approve session manually
      const user = await createTestUser(testDb);
      await testDb
        .update(deviceAuthSessions)
        .set({ status: "approved", userId: user.id })
        .where(eq(deviceAuthSessions.id, sessionId));

      // Poll - should get token
      const response = await handlePollDeviceAuth(sessionId);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("approved");
      expect(body.token).toMatch(/^ok_/);
      expect(body.user.email).toBe(user.email);

      // Session should be deleted after token retrieval
      const [session] = await testDb
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.id, sessionId));
      expect(session).toBeUndefined();
    });
  });

  describe("POST /api/auth/device/:sessionId/approve", () => {
    it("approves session when user is logged in", async () => {
      // Create session
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      // Create user and mock auth session
      const user = await createTestUser(testDb);
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: user.id, email: user.email },
        session: { id: "session-id" },
      } as never);

      const request = new Request("http://test", { method: "POST" });
      const response = await handleApproveDeviceAuth(request, sessionId);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify session is approved in database
      const [session] = await testDb
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.id, sessionId));

      expect(session.status).toBe("approved");
      expect(session.userId).toBe(user.id);
    });

    it("returns 401 when user is not logged in", async () => {
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const request = new Request("http://test", { method: "POST" });
      const response = await handleApproveDeviceAuth(request, sessionId);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns 404 for non-existent session", async () => {
      const user = await createTestUser(testDb);
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: user.id, email: user.email },
        session: { id: "session-id" },
      } as never);

      const request = new Request("http://test", { method: "POST" });
      const response = await handleApproveDeviceAuth(
        request,
        "12345678-1234-1234-1234-123456789012"
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 410 for expired session", async () => {
      const createResponse = await handleStartDeviceAuth();
      const { sessionId } = await createResponse.json();

      // Expire the session
      await testDb
        .update(deviceAuthSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(deviceAuthSessions.id, sessionId));

      const user = await createTestUser(testDb);
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: user.id, email: user.email },
        session: { id: "session-id" },
      } as never);

      const request = new Request("http://test", { method: "POST" });
      const response = await handleApproveDeviceAuth(request, sessionId);
      const body = await response.json();

      expect(response.status).toBe(410);
      expect(body.code).toBe("EXPIRED");
    });
  });

  describe("GET /api/auth/device/lookup", () => {
    it("returns session ID for valid code", async () => {
      const createResponse = await handleStartDeviceAuth();
      const { sessionId, userCode } = await createResponse.json();

      const request = new Request(
        `http://test/api/auth/device/lookup?code=${userCode}`
      );
      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe(sessionId);
    });

    it("returns 400 when code is missing", async () => {
      const request = new Request("http://test/api/auth/device/lookup");
      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for invalid code", async () => {
      const request = new Request(
        "http://test/api/auth/device/lookup?code=XXXX-0000"
      );
      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("returns 404 for expired session code", async () => {
      const createResponse = await handleStartDeviceAuth();
      const { sessionId, userCode } = await createResponse.json();

      // Expire the session
      await testDb
        .update(deviceAuthSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(deviceAuthSessions.id, sessionId));

      const request = new Request(
        `http://test/api/auth/device/lookup?code=${userCode}`
      );
      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    });

    it("handles case-insensitive code lookup", async () => {
      const createResponse = await handleStartDeviceAuth();
      const { sessionId, userCode } = await createResponse.json();

      // Use lowercase code
      const request = new Request(
        `http://test/api/auth/device/lookup?code=${userCode.toLowerCase()}`
      );
      const response = await handleLookupDeviceAuth(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe(sessionId);
    });
  });

  describe("Full Device Auth Flow", () => {
    it("completes full login flow: start -> lookup -> approve -> poll", async () => {
      // 1. CLI starts device auth
      const startResponse = await handleStartDeviceAuth();
      const { sessionId, userCode } = await startResponse.json();

      // 2. User looks up session by code (browser)
      const lookupRequest = new Request(
        `http://test/api/auth/device/lookup?code=${userCode}`
      );
      const lookupResponse = await handleLookupDeviceAuth(lookupRequest);
      const lookupBody = await lookupResponse.json();
      expect(lookupBody.sessionId).toBe(sessionId);

      // 3. User approves (browser, logged in)
      const user = await createTestUser(testDb);
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: user.id, email: user.email },
        session: { id: "session-id" },
      } as never);

      const approveRequest = new Request("http://test", { method: "POST" });
      const approveResponse = await handleApproveDeviceAuth(
        approveRequest,
        sessionId
      );
      expect(approveResponse.status).toBe(200);

      // 4. CLI polls and gets token
      const pollResponse = await handlePollDeviceAuth(sessionId);
      const pollBody = await pollResponse.json();

      expect(pollBody.status).toBe("approved");
      expect(pollBody.token).toMatch(/^ok_/);
      expect(pollBody.user.email).toBe(user.email);
    });
  });
});
