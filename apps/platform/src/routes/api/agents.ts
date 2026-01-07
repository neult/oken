import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ agents: [] });
      },
      POST: async () => {
        return Response.json({ message: "create agent" });
      },
    },
  },
});
