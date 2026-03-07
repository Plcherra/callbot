import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: [
      { find: "@/shared", replacement: path.resolve(__dirname, "./src/shared") },
      { find: "@/features", replacement: path.resolve(__dirname, "./src/features") },
      { find: "@", replacement: path.resolve(__dirname, "./") },
    ],
  },
});
