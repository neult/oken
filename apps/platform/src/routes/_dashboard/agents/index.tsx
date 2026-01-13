import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { Bot, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      headers: new Headers(),
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
      return (
        <Badge variant="secondary" className="bg-slate-600">
          Stopped
        </Badge>
      );
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
        <Bot size={64} className="text-gray-600 mb-4" />
        <h2 className="text-2xl font-semibold text-white mb-2">
          No agents yet
        </h2>
        <p className="text-gray-400 mb-6 max-w-md">
          Deploy your first AI agent using the CLI. Run{" "}
          <code className="bg-slate-800 px-2 py-1 rounded text-cyan-400">
            oken deploy
          </code>{" "}
          in your agent directory.
        </p>
        <Button variant="outline" className="border-slate-600 text-gray-300">
          <a
            href="https://docs.oken.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            View Documentation
            <ExternalLink size={16} />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400">Manage your deployed AI agents</p>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">All Agents</CardTitle>
          <CardDescription className="text-gray-400">
            {agentsList.length} agent{agentsList.length !== 1 ? "s" : ""}{" "}
            deployed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-gray-400">Name</TableHead>
                <TableHead className="text-gray-400">Slug</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Endpoint</TableHead>
                <TableHead className="text-gray-400">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentsList.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="border-slate-700 hover:bg-slate-700/50 cursor-pointer"
                >
                  <TableCell>
                    <Link
                      to="/dashboard/agents/$slug"
                      params={{ slug: agent.slug }}
                      className="text-white font-medium hover:text-cyan-400"
                    >
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-400 font-mono text-sm">
                    {agent.slug}
                  </TableCell>
                  <TableCell>{getStatusBadge(agent.status)}</TableCell>
                  <TableCell>
                    {agent.endpoint ? (
                      <a
                        href={agent.endpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 text-sm font-mono flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {agent.endpoint}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-400 text-sm">
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
