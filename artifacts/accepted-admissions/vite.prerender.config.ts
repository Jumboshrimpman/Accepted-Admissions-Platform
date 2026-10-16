import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@clerk/react": path.resolve(root, "scripts/clerk-ssr-stub.ts"),
    },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: path.resolve(root, "scripts/prerender-legal.tsx"),
    outDir: path.resolve(root, "dist/prerender"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "prerender-legal.js",
      },
    },
  },
});
