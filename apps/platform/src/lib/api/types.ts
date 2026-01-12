import { z } from "zod";

// Agent schemas
export const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen"
    ),
});

export const invokeAgentSchema = z.object({
  input: z.record(z.string(), z.unknown()),
});

// Response types
export interface AgentResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  endpoint: string | null;
  pythonVersion: string | null;
  entrypoint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentListResponse {
  agents: AgentResponse[];
}

export interface DeployResponse {
  agent: AgentResponse;
  deployment: {
    id: string;
    status: string;
  };
}

export interface InvokeResponse {
  output: Record<string, unknown> | null;
  error?: string;
}

export interface StopResponse {
  agent: AgentResponse;
  message: string;
}

export interface DeleteResponse {
  message: string;
}
