import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Sequential — secrets tests set a process-wide env that must not race.
    fileParallelism: false,
  },
});
