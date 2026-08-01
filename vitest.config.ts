import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Registry and deterministic-journey tests are CPU-bound and share workers.
    // Five seconds made otherwise-correct proofs fail under ordinary parallel
    // verification load on Windows; 15 seconds still fails a genuine hang fast.
    testTimeout: 15_000,
  },
});
