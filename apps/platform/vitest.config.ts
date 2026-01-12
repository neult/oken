import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "node_modules",
      ".output",
      ".tanstack",
      "**/*.integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/routeTree.gen.ts",
        "src/lib/logger.ts",
        "src/lib/utils.ts",
        "src/lib/db/index.ts",
        "src/lib/db/schema.ts",
        "src/lib/runner/index.ts",
        "src/lib/auth/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
