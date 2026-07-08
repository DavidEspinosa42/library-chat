import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Web component tests (docs/01): jsdom + testing-library, no browser. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
