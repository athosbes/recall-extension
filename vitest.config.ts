import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["client/**/*.test.ts", "client/**/*.test.tsx"],
    setupFiles: ["client/src/test/setup.ts"],
  },
});
