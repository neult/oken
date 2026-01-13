import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { Key, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { agents, secrets } from "@/lib/db/schema";

interface Secret {
  id: string;
  name: string;
  agentSlug: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  slug: string;
  name: string;
}

interface SecretsData {
  secrets: Secret[];
  agents: Agent[];
}

const getSecretsData = createServerFn({ method: "GET" }).handler(
  async (): Promise<SecretsData> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { secrets: [], agents: [] };
    }

    const userSecrets = await db
      .select({
        id: secrets.id,
        name: secrets.name,
        agentId: secrets.agentId,
        createdAt: secrets.createdAt,
      })
      .from(secrets)
      .where(eq(secrets.userId, session.user.id));

    const userAgents = await db
      .select({
        id: agents.id,
        slug: agents.slug,
        name: agents.name,
      })
      .from(agents)
      .where(eq(agents.userId, session.user.id));

    const agentMap = new Map(userAgents.map((a) => [a.id, a.slug]));

    return {
      secrets: userSecrets.map((s) => ({
        id: s.id,
        name: s.name,
        agentSlug: s.agentId ? (agentMap.get(s.agentId) ?? null) : null,
        createdAt: s.createdAt?.toISOString() ?? "",
      })),
      agents: userAgents,
    };
  }
);

const createSecret = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; value: string; agentSlug?: string }) => data
  )
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!/^[A-Z_][A-Z0-9_]*$/.test(data.name)) {
      return {
        success: false,
        error: "Secret name must be uppercase with underscores",
      };
    }

    let agentId: string | null = null;

    if (data.agentSlug) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.slug, data.agentSlug),
            eq(agents.userId, session.user.id)
          )
        )
        .limit(1);

      if (!agent) {
        return { success: false, error: "Agent not found" };
      }
      agentId = agent.id;
    }

    const encryptedValue = encrypt(data.value);

    // Check if secret already exists (upsert)
    const existingCondition = agentId
      ? and(
          eq(secrets.userId, session.user.id),
          eq(secrets.name, data.name),
          eq(secrets.agentId, agentId)
        )
      : and(
          eq(secrets.userId, session.user.id),
          eq(secrets.name, data.name),
          isNull(secrets.agentId)
        );

    const [existing] = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(existingCondition)
      .limit(1);

    if (existing) {
      await db
        .update(secrets)
        .set({ value: encryptedValue })
        .where(eq(secrets.id, existing.id));
    } else {
      await db.insert(secrets).values({
        userId: session.user.id,
        agentId,
        name: data.name,
        value: encryptedValue,
      });
    }

    return { success: true };
  });

const deleteSecret = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; agentSlug: string | null }) => data)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    let agentId: string | null = null;

    if (data.agentSlug) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.slug, data.agentSlug),
            eq(agents.userId, session.user.id)
          )
        )
        .limit(1);

      if (!agent) {
        return { success: false, error: "Agent not found" };
      }
      agentId = agent.id;
    }

    const deleteCondition = agentId
      ? and(
          eq(secrets.userId, session.user.id),
          eq(secrets.name, data.name),
          eq(secrets.agentId, agentId)
        )
      : and(
          eq(secrets.userId, session.user.id),
          eq(secrets.name, data.name),
          isNull(secrets.agentId)
        );

    const deleted = await db
      .delete(secrets)
      .where(deleteCondition)
      .returning({ id: secrets.id });

    if (deleted.length === 0) {
      return { success: false, error: "Secret not found" };
    }

    return { success: true };
  });

export const Route = createFileRoute("/_dashboard/secrets/")({
  loader: () => getSecretsData(),
  component: SecretsPage,
});

function SecretsPage() {
  const data = Route.useLoaderData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [newSecretAgent, setNewSecretAgent] = useState<string>("global");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");
    setIsSubmitting(true);

    try {
      const result = await createSecret({
        data: {
          name: newSecretName,
          value: newSecretValue,
          agentSlug: newSecretAgent !== "global" ? newSecretAgent : undefined,
        },
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to create secret");
      }

      setIsCreateOpen(false);
      setNewSecretName("");
      setNewSecretValue("");
      setNewSecretAgent("global");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create secret");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (name: string, agentSlug: string | null) => {
    if (!confirm(`Delete secret "${name}"?`)) return;

    const result = await deleteSecret({ data: { name, agentSlug } });

    if (result.success) {
      window.location.reload();
    }
  };

  if (data.secrets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Secrets</h1>
            <p className="text-muted-foreground">
              Manage environment variables
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus size={16} className="mr-2" />
                Add Secret
              </Button>
            </DialogTrigger>
            <CreateSecretDialog
              agents={data.agents}
              newSecretName={newSecretName}
              setNewSecretName={setNewSecretName}
              newSecretValue={newSecretValue}
              setNewSecretValue={setNewSecretValue}
              newSecretAgent={newSecretAgent}
              setNewSecretAgent={setNewSecretAgent}
              isSubmitting={isSubmitting}
              error={error}
              handleCreate={handleCreate}
            />
          </Dialog>
        </div>

        <div className="flex flex-col items-center justify-center h-[50vh] text-center">
          <Key size={64} className="text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">No secrets yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Add environment variables like API keys. Secrets are encrypted at
            rest and injected into your agents at runtime.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Secrets</h1>
          <p className="text-muted-foreground">Manage environment variables</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} className="mr-2" />
              Add Secret
            </Button>
          </DialogTrigger>
          <CreateSecretDialog
            agents={data.agents}
            newSecretName={newSecretName}
            setNewSecretName={setNewSecretName}
            newSecretValue={newSecretValue}
            setNewSecretValue={setNewSecretValue}
            newSecretAgent={newSecretAgent}
            setNewSecretAgent={setNewSecretAgent}
            isSubmitting={isSubmitting}
            error={error}
            handleCreate={handleCreate}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Secrets</CardTitle>
          <CardDescription>
            {data.secrets.length} secret{data.secrets.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.secrets.map((secret) => (
                <TableRow key={secret.id}>
                  <TableCell className="font-mono">{secret.name}</TableCell>
                  <TableCell>
                    {secret.agentSlug ? (
                      <Badge variant="secondary">{secret.agentSlug}</Badge>
                    ) : (
                      <Badge>Global</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(secret.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive"
                      onClick={() =>
                        handleDelete(secret.name, secret.agentSlug)
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
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

function CreateSecretDialog({
  agents,
  newSecretName,
  setNewSecretName,
  newSecretValue,
  setNewSecretValue,
  newSecretAgent,
  setNewSecretAgent,
  isSubmitting,
  error,
  handleCreate,
}: {
  agents: Agent[];
  newSecretName: string;
  setNewSecretName: (v: string) => void;
  newSecretValue: string;
  setNewSecretValue: (v: string) => void;
  newSecretAgent: string;
  setNewSecretAgent: (v: string) => void;
  isSubmitting: boolean;
  error: string;
  handleCreate: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Secret</DialogTitle>
        <DialogDescription>
          Create an environment variable for your agents.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="API_KEY"
            value={newSecretName}
            onChange={(e) => setNewSecretName(e.target.value.toUpperCase())}
            className="font-mono"
          />
          <p className="text-muted-foreground text-xs">
            Uppercase with underscores (e.g., OPENAI_API_KEY)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="value">Value</Label>
          <Input
            id="value"
            type="password"
            placeholder="sk-..."
            value={newSecretValue}
            onChange={(e) => setNewSecretValue(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scope">Scope</Label>
          <Select value={newSecretAgent} onValueChange={setNewSecretAgent}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (all agents)</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.slug}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter>
        <Button
          onClick={handleCreate}
          disabled={isSubmitting || !newSecretName || !newSecretValue}
        >
          {isSubmitting ? "Creating..." : "Create Secret"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
