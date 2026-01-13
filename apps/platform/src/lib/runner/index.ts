// Runner client for communicating with the agent runner service

import { logger } from "@/lib/logger";

export interface DeployResponse {
  agent_id: string;
  status: string;
  endpoint?: string;
  error?: string;
}

export interface InvokeResponse {
  output?: Record<string, unknown>;
  error?: string;
}

export interface StopResponse {
  agent_id: string;
  status: string;
}

export interface HealthResponse {
  status: string;
  agents_running: number;
}

export interface AgentInfo {
  agent_id: string;
  name: string;
  status: string;
  created_at: string;
  last_invoked: string | null;
}

export interface AgentListResponse {
  agents: AgentInfo[];
}

export interface LogsResponse {
  logs: string;
}

export class RunnerError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

export class RunnerClient {
  private baseUrl: string;

  constructor(
    baseUrl: string = process.env.RUNNER_URL ?? "http://localhost:8000"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, options);

    if (!res.ok) {
      let body: Record<string, unknown> = {};
      const contentType = res.headers.get("content-type") ?? "";

      try {
        if (contentType.includes("application/json")) {
          body = await res.json();
        } else {
          const text = await res.text();
          logger.error(
            { contentType, body: text.substring(0, 500) },
            "Runner returned non-JSON error response"
          );
        }
      } catch (parseErr) {
        logger.error(
          { err: parseErr },
          "Failed to parse runner error response"
        );
      }

      throw new RunnerError(
        (body.error as string) ?? `Request failed: ${res.status}`,
        res.status,
        body.code as string | undefined
      );
    }

    return res.json();
  }

  async deploy(
    agentId: string,
    tarball: ArrayBuffer,
    secrets?: Record<string, string>
  ): Promise<DeployResponse> {
    const formData = new FormData();
    formData.append("agent_id", agentId);
    formData.append("tarball", new Blob([tarball]), "agent.tar.gz");
    if (secrets && Object.keys(secrets).length > 0) {
      formData.append("secrets", JSON.stringify(secrets));
    }

    return this.request<DeployResponse>("/deploy", {
      method: "POST",
      body: formData,
    });
  }

  async invoke(
    agentId: string,
    input: Record<string, unknown>
  ): Promise<InvokeResponse> {
    return this.request<InvokeResponse>(`/invoke/${agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
  }

  async stop(agentId: string): Promise<StopResponse> {
    return this.request<StopResponse>(`/stop/${agentId}`, {
      method: "POST",
    });
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  async listAgents(): Promise<AgentListResponse> {
    return this.request<AgentListResponse>("/agents");
  }

  async logs(agentId: string, tail = 100): Promise<LogsResponse> {
    return this.request<LogsResponse>(`/logs/${agentId}?tail=${tail}`);
  }

  logsStreamUrl(agentId: string, tail = 100): string {
    return `${this.baseUrl}/logs/${agentId}?follow=true&tail=${tail}`;
  }
}

export const runner = new RunnerClient();
