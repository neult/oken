import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/secrets")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ secrets: [] });
      },
      POST: async () => {
        return Response.json({ message: "create secret" });
      },
    },
  },
});
