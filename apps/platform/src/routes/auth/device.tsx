import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/auth/device")({
  validateSearch: (search: Record<string, unknown>): { code: string } => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  component: DeviceAuthPage,
});

function DeviceAuthPage() {
  const { code } = Route.useSearch();
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");

  const handleApprove = async () => {
    if (!code) {
      setError("No code provided");
      setStatus("error");
      return;
    }

    setStatus("loading");
    try {
      // First, look up session by user code
      const lookupRes = await fetch(
        `/api/auth/device/lookup?code=${encodeURIComponent(code)}`
      );
      if (!lookupRes.ok) {
        const data = await lookupRes.json();
        throw new Error(data.error || "Invalid or expired code");
      }
      const { sessionId } = await lookupRes.json();

      // Then approve it
      const approveRes = await fetch(`/api/auth/device/${sessionId}/approve`, {
        method: "POST",
      });
      if (!approveRes.ok) {
        const data = await approveRes.json();
        throw new Error(data.error || "Failed to approve");
      }

      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No authorization code provided. Please use the link from your CLI.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>CLI Authorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You can close this window and return to your terminal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize CLI</CardTitle>
          <CardDescription>
            A CLI is requesting access to your Oken account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xl text-center p-4 bg-muted rounded-lg text-primary tracking-wider">
            {code}
          </div>
          {status === "error" && (
            <p className="text-destructive mt-4 text-sm">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.close()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleApprove}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Authorizing..." : "Authorize"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
