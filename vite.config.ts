import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs are required: the built pages are served from
  // chrome-extension://<id>/ where absolute "/assets/..." paths do not resolve.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // MV3's CSP rejects the <link rel="modulepreload"> injection.
    modulePreload: false,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "client/index.html"),
        popup: path.resolve(import.meta.dirname, "client/popup.html"),
        // The service worker is declared as "type": "module" in the manifest,
        // so it may import the shared chunk Rollup emits under assets/.
        background: path.resolve(import.meta.dirname, "client/src/background/index.ts"),
      },
      output: {
        // manifest.json points at background.js by name, so that one entry
        // must land unhashed at the package root.
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
