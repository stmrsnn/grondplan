import { defineConfig } from "vitest/config";

// rekentests; de browsertesten in e2e/ draaien via Playwright
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
