import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

interface Agent {
  id: string;
  name: string;
  slug: string;
  status: string;
  endpoint: string | null;
  entrypoint: string | null;
  createdAt: string;
}

const getAgents = createServerFn({ method: "GET" }).handler(
  async (): Promise<Agent[]> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return [];
    }

    const userAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.userId, session.user.id));

    return userAgents.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      endpoint: a.endpoint,
      entrypoint: a.entrypoint,
      createdAt: a.createdAt?.toISOString() ?? "",
    }));
  }
);

export const Route = createFileRoute("/_dashboard/agents/")({
  loader: () => getAgents(),
  component: AgentsPage,
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

function AgentsPage() {
  const agentsList = Route.useLoaderData();

  if (agentsList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Bot size={64} className="text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">No agents yet</h2>
        <p className="text-muted-foreground max-w-md">
          Deploy your first AI agent using the CLI. Run{" "}
          <code className="bg-muted px-2 py-1 rounded text-primary">
            oken deploy
          </code>{" "}
          in your agent directory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            Manage your deployed AI agents
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Agents</CardTitle>
          <CardDescription>
            {agentsList.length} agent{agentsList.length !== 1 ? "s" : ""}{" "}
            deployed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentsList.map((agent) => (
                <TableRow key={agent.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      to="/agents/$slug"
                      params={{ slug: agent.slug }}
                      className="font-medium hover:text-primary"
                    >
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {agent.slug}
                  </TableCell>
                  <TableCell>{getStatusBadge(agent.status)}</TableCell>
                  <TableCell>
                    {agent.endpoint ? (
                      <a
                        href={agent.endpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm font-mono flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {agent.endpoint}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
