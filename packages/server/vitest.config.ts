import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: resolve(import.meta.dirname, ".test.sqlite"),
      DATA_DIR: resolve(import.meta.dirname, ".test-repos"),
    },
    setupFiles: ["./src/__tests__/setup.ts"],
    fileParallelism: false,
  },
});
