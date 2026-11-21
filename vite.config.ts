import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

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
    // GitHub Pages serves this folder; the single file also works offline
    outDir: "docs",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    // relative paths so the single-file build works from file:// and any subpath
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  // One self-contained index.html: no server needed, works by double-click
  // and on GitHub Pages / any static host.
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  base: "./",
});
