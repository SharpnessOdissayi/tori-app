import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // Bundle @capacitor/core + the plugins INTO the output so the native
    // build can actually import them. The old `external:[]` list existed
    // when Capacitor was an optional dep wrapped in try/catch — now we
    // use native plugins (Google Auth) that transitively depend on
    // @capacitor/core at module-load time, and Rollup marking them
    // external blows up at runtime with
    //   "Failed to resolve module specifier '@capacitor/core'"
    // in the WebView. The web fallbacks ship no-ops for native APIs,
    // so bundling them is harmless on Railway builds.
    rollupOptions: {},
  },
  server: {
    port,
    host: "0.0.0.0",
  },
  preview: {
    port,
    host: "0.0.0.0",
  },
});
