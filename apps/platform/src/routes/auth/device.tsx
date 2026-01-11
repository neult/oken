import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Invalid Request</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400">
              No authorization code provided. Please use the link from your CLI.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">CLI Authorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400">
              You can close this window and return to your terminal.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Authorize CLI</CardTitle>
          <CardDescription className="text-gray-400">
            A CLI is requesting access to your Oken account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xl text-center p-4 bg-slate-900 rounded-lg text-cyan-400 tracking-wider">
            {code}
          </div>
          {status === "error" && (
            <p className="text-red-400 mt-4 text-sm">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-slate-600 text-gray-300 hover:bg-slate-700"
            onClick={() => window.close()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white"
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
