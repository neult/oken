import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules", ".output", ".tanstack"],
    testTimeout: 60000,
    hookTimeout: 60000,
    isolate: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
