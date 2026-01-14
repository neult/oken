import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { runner } from "@/lib/runner";

interface Agent {
  id: string;
  name: string;
  slug: string;
  status: string;
  endpoint: string | null;
  entrypoint: string | null;
  pythonVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

const getAgent = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<Agent | null> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return null;
    }

    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.slug, slug), eq(agents.userId, session.user.id)))
      .limit(1);

    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      status: agent.status,
      endpoint: agent.endpoint,
      entrypoint: agent.entrypoint,
      pythonVersion: agent.pythonVersion,
      createdAt: agent.createdAt?.toISOString() ?? "",
      updatedAt: agent.updatedAt?.toISOString() ?? "",
    };
  });

const stopAgent = createServerFn({ method: "POST" })
  .inputValidator((slug: string) => slug)
  .handler(
    async ({ data: slug }): Promise<{ success: boolean; error?: string }> => {
      const session = await auth.api.getSession({
        headers: new Headers(),
      });

      if (!session?.user) {
        return { success: false, error: "Unauthorized" };
      }

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.slug, slug), eq(agents.userId, session.user.id)))
        .limit(1);

      if (!agent) {
        return { success: false, error: "Agent not found" };
      }

      try {
        await runner.stop(agent.slug);
        await db
          .update(agents)
          .set({ status: "stopped", updatedAt: new Date() })
          .where(eq(agents.id, agent.id));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to stop agent",
        };
      }
    }
  );

const deleteAgent = createServerFn({ method: "POST" })
  .inputValidator((slug: string) => slug)
  .handler(
    async ({ data: slug }): Promise<{ success: boolean; error?: string }> => {
      const session = await auth.api.getSession({
        headers: new Headers(),
      });

      if (!session?.user) {
        return { success: false, error: "Unauthorized" };
      }

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.slug, slug), eq(agents.userId, session.user.id)))
        .limit(1);

      if (!agent) {
        return { success: false, error: "Agent not found" };
      }

      try {
        if (agent.status === "running") {
          await runner.stop(agent.slug);
        }
        await db.delete(agents).where(eq(agents.id, agent.id));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to delete agent",
        };
      }
    }
  );

const getLogs = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(
    async ({ data: slug }): Promise<{ logs: string[]; error?: string }> => {
      const session = await auth.api.getSession({
        headers: new Headers(),
      });

      if (!session?.user) {
        return { logs: [], error: "Unauthorized" };
      }

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.slug, slug), eq(agents.userId, session.user.id)))
        .limit(1);

      if (!agent) {
        return { logs: [], error: "Agent not found" };
      }

      try {
        const result = await runner.logs(agent.slug, 100);
        return { logs: result.logs };
      } catch (err) {
        return {
          logs: [],
          error: err instanceof Error ? err.message : "Failed to fetch logs",
        };
      }
    }
  );

export const Route = createFileRoute("/_dashboard/agents/$slug")({
  loader: ({ params }) => getAgent({ data: params.slug }),
  component: AgentDetailPage,
});

function getStatusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="bg-green-600 hover:bg-green-700">Running</Badge>;
    case "stopped":
      return <Badge variant="secondary">Stopped</Badge>;
    case "deploying":
      return (
        <Badge className="bg-yellow-600 hover:bg-yellow-700">Deploying</Badge>
      );
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function AgentDetailPage() {
  const navigate = useNavigate();
  const agent = Route.useLoaderData();
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(agent?.status ?? "");
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (slug: string) => {
    setLogsLoading(true);
    const result = await getLogs({ data: slug });
    setLogs(result.logs);
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    if (agent) {
      setCurrentStatus(agent.status);
      fetchLogs(agent.slug);
    }
  }, [agent, fetchLogs]);

  useEffect(() => {
    if (logs.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-2xl font-semibold mb-2">Agent not found</h2>
        <p className="text-muted-foreground mb-6">
          The agent you're looking for doesn't exist or you don't have access to
          it.
        </p>
        <Link to="/agents">
          <Button variant="outline">
            <ArrowLeft size={16} className="mr-2" />
            Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const handleStop = async () => {
    setActionLoading(true);
    const result = await stopAgent({ data: agent.slug });
    if (result.success) {
      setCurrentStatus("stopped");
    }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    const result = await deleteAgent({ data: agent.slug });
    if (result.success) {
      navigate({ to: "/agents" });
    }
    setActionLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/agents">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">
            {agent.slug}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentStatus === "running" && (
            <Button
              variant="outline"
              onClick={handleStop}
              disabled={actionLoading}
            >
              <Square size={16} className="mr-2" />
              Stop
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                disabled={actionLoading}
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{agent.name}</strong>?
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status</CardTitle>
          </CardHeader>
          <CardContent>{getStatusBadge(currentStatus)}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endpoint</CardTitle>
          </CardHeader>
          <CardContent>
            {agent.endpoint ? (
              <a
                href={agent.endpoint}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-mono text-sm flex items-center gap-1"
              >
                {agent.endpoint}
                <ExternalLink size={14} />
              </a>
            ) : (
              <span className="text-muted-foreground">Not available</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entrypoint</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm">
              {agent.entrypoint || "Auto-detected"}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Recent output from your agent</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchLogs(agent.slug)}
            disabled={logsLoading}
          >
            <RefreshCw
              size={16}
              className={logsLoading ? "animate-spin" : ""}
            />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 h-80 overflow-auto font-mono text-sm">
            {logsLoading && logs.length === 0 ? (
              <div className="text-muted-foreground">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-muted-foreground">No logs available</div>
            ) : (
              <>
                {logs.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
                  <div key={i} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
