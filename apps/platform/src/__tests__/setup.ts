import { vi } from "vitest";

/**
 * Mock database query builder for testing.
 * Provides chainable methods that return promises.
 */
export function createMockDb() {
  const mockResult: unknown[] = [];

  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockImplementation(() => Promise.resolve()),
    // Allow setting mock results
    _setResult: (result: unknown[]) => {
      mockResult.length = 0;
      mockResult.push(...result);
    },
  };

  return queryBuilder;
}

/**
 * Mock runner client for testing.
 */
export function createMockRunner() {
  return {
    deploy: vi.fn().mockResolvedValue({
      status: "running",
      endpoint: "/invoke/test-agent",
    }),
    invoke: vi.fn().mockResolvedValue({
      output: { result: "success" },
    }),
    stop: vi.fn().mockResolvedValue({
      status: "stopped",
    }),
  };
}

/**
 * Create a mock Request object for testing API routes.
 */
export function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  url?: string;
}): Request {
  const { method = "GET", headers = {}, body, url = "http://test" } = options;

  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };

  if (body) {
    init.body = JSON.stringify(body);
    (init.headers as Headers).set("Content-Type", "application/json");
  }

  return new Request(url, init);
}

/**
 * Create a mock authenticated request with API key.
 */
export function createAuthenticatedRequest(
  apiKey: string,
  options: Omit<Parameters<typeof createMockRequest>[0], "headers"> & {
    headers?: Record<string, string>;
  } = {}
): Request {
  return createMockRequest({
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  });
}
