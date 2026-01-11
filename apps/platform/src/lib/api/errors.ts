export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, "NOT_FOUND", `${resource} not found`);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, "VALIDATION_ERROR", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class RunnerError extends ApiError {
  constructor(message: string, statusCode = 502) {
    super(statusCode, "RUNNER_ERROR", message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  console.error("Unhandled error:", error);
  return Response.json(
    { error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
