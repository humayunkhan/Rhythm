import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8788" } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
