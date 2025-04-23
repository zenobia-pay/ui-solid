import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: "dist/zenobia",
    lib: {
      entry: "./src/index-bundle.tsx",
      name: "ZenobiaPay",
      fileName: () => "zenobia-pay.js",
      formats: ["iife"],
    },
    rollupOptions: {
      external: [],
    },
  },
});
