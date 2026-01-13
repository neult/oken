import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { Copy, Key, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { generateApiKey, hashApiKey } from "@/lib/auth/device";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface SettingsData {
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  apiKeys: ApiKey[];
}

const getSettingsData = createServerFn({ method: "GET" }).handler(
  async (): Promise<SettingsData> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { user: null, apiKeys: [] };
    }

    const userApiKeys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id));

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      apiKeys: userApiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt?.toISOString() ?? "",
      })),
    };
  }
);

const createApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }): Promise<{ key: string } | { error: string }> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { error: "Unauthorized" };
    }

    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = key.slice(0, 10);

    await db.insert(apiKeys).values({
      userId: session.user.id,
      name: data.name,
      keyHash,
      keyPrefix,
    });

    return { key };
  });

const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return { success: false };
    }

    await db.delete(apiKeys).where(eq(apiKeys.id, data.id));

    return { success: true };
  });

export const Route = createFileRoute("/_dashboard/settings/")({
  loader: () => getSettingsData(),
  component: SettingsPage,
});

function SettingsPage() {
  const data = Route.useLoaderData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateKey = async () => {
    setIsSubmitting(true);
    const result = await createApiKey({ data: { name: newKeyName } });

    if ("key" in result) {
      setNewKey(result.key);
      setNewKeyName("");
    }
    setIsSubmitting(false);
  };

  const handleCopyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseDialog = () => {
    setIsCreateOpen(false);
    setNewKey(null);
    setNewKeyName("");
    if (newKey) {
      window.location.reload();
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!confirm(`Delete API key "${name}"?`)) return;

    await deleteApiKey({ data: { id } });
    window.location.reload();
  };

  if (!data.user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and API keys
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User size={20} />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">Name</Label>
              <p>{data.user.name || "-"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <p>{data.user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key size={20} />
                API Keys
              </CardTitle>
              <CardDescription>Keys for CLI authentication</CardDescription>
            </div>
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                if (open) {
                  setIsCreateOpen(true);
                } else {
                  handleCloseDialog();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus size={16} className="mr-2" />
                  Create Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {newKey ? "API Key Created" : "Create API Key"}
                  </DialogTitle>
                  <DialogDescription>
                    {newKey
                      ? "Copy your key now. You won't be able to see it again."
                      : "Create a new API key for CLI authentication."}
                  </DialogDescription>
                </DialogHeader>
                {newKey ? (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-2">
                      <Input readOnly value={newKey} className="font-mono" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyKey}
                      >
                        <Copy size={16} />
                      </Button>
                    </div>
                    {copied && (
                      <p className="text-green-500 text-sm">
                        Copied to clipboard!
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="keyName">Name</Label>
                      <Input
                        id="keyName"
                        placeholder="My laptop"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {newKey ? (
                    <Button onClick={handleCloseDialog}>Done</Button>
                  ) : (
                    <Button
                      onClick={handleCreateKey}
                      disabled={isSubmitting || !newKeyName}
                    >
                      {isSubmitting ? "Creating..." : "Create Key"}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {data.apiKeys.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No API keys yet. Create one to use the CLI.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {apiKey.keyPrefix}...
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {apiKey.lastUsedAt
                        ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(apiKey.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-destructive"
                        onClick={() => handleDeleteKey(apiKey.id, apiKey.name)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
