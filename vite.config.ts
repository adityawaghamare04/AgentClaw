import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/ui",
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    sourcemap: false,
    cssMinify: true,
    minify: "esbuild",
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3777",
    },
  },
});
