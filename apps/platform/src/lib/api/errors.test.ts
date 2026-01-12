import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ConflictError,
  errorResponse,
  NotFoundError,
  RunnerError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

describe("ApiError", () => {
  it("sets statusCode, code, and message", () => {
    const error = new ApiError(418, "TEAPOT", "I'm a teapot");

    expect(error.statusCode).toBe(418);
    expect(error.code).toBe("TEAPOT");
    expect(error.message).toBe("I'm a teapot");
    expect(error.name).toBe("ApiError");
  });

  it("extends Error", () => {
    const error = new ApiError(500, "TEST", "test");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("UnauthorizedError", () => {
  it("returns 401 with UNAUTHORIZED code", () => {
    const error = new UnauthorizedError();

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Unauthorized");
  });

  it("accepts custom message", () => {
    const error = new UnauthorizedError("Invalid token");

    expect(error.message).toBe("Invalid token");
    expect(error.statusCode).toBe(401);
  });
});

describe("NotFoundError", () => {
  it("returns 404 with NOT_FOUND code", () => {
    const error = new NotFoundError("Agent");

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("includes resource name in message", () => {
    const error = new NotFoundError("User");

    expect(error.message).toBe("User not found");
  });
});

describe("ValidationError", () => {
  it("returns 400 with VALIDATION_ERROR code", () => {
    const error = new ValidationError("Invalid email format");

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid email format");
  });
});

describe("ConflictError", () => {
  it("returns 409 with CONFLICT code", () => {
    const error = new ConflictError("Slug already exists");

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Slug already exists");
  });
});

describe("RunnerError", () => {
  it("returns 502 by default with RUNNER_ERROR code", () => {
    const error = new RunnerError("Runner unavailable");

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe("RUNNER_ERROR");
    expect(error.message).toBe("Runner unavailable");
  });

  it("accepts custom status code", () => {
    const error = new RunnerError("Timeout", 504);

    expect(error.statusCode).toBe(504);
  });
});

describe("errorResponse", () => {
  it("returns proper JSON response for ApiError", async () => {
    const error = new ValidationError("Bad input");
    const response = errorResponse(error);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toEqual({
      error: "Bad input",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 500 for unknown errors", async () => {
    const error = new Error("Something unexpected");
    const response = errorResponse(error);

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  it("handles non-Error objects", async () => {
    const response = errorResponse("string error");

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

describe("error inheritance", () => {
  it("all errors inherit from ApiError", () => {
    const errors = [
      new UnauthorizedError(),
      new NotFoundError("Test"),
      new ValidationError("Test"),
      new ConflictError("Test"),
      new RunnerError("Test"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(Error);
    }
  });
});
