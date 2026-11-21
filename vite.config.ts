import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    // the sandbox preview is served from a proxy host such as
    // <port>-<sandbox>.e2b.app, so any host must be accepted
    allowedHosts: true,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
});
