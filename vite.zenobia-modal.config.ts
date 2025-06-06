import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: "dist/zenobia-modal",
    lib: {
      entry: "./src/modal-bundle.tsx",
      name: "ZenobiaPayModal",
      fileName: () => "zenobia-pay-modal.js",
      formats: ["iife"],
    },
    rollupOptions: {
      external: [],
    },
  },
});
