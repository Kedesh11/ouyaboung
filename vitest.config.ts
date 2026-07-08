import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Setting `include` alone (no separate `all` flag in vitest 4) is what
      // makes every matching file count toward the denominator, not just
      // files touched by a test - otherwise coverage % is measured only
      // over files that already have tests, which hides untested services.
      include: ["src/services/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "dist/**",
        "coverage/**",
        "src/**/__tests__/**",
        "src/**/*.test.ts",
      ],
      // Floor set just below the current measured coverage (src/services +
      // src/lib) so CI actually fails on regression. Raise these numbers as
      // more services (src/lib/tracking, src/lib/offline, remaining
      // *.service.ts files) get test coverage - see docs/RISKS_TRACKING.md R5.
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 20,
        lines: 25,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
