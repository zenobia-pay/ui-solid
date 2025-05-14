import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: "dist/zenobia-bigcommerce",
    lib: {
      entry: "./src/bigcommerce-loader.tsx",
      name: "ZenobiaPayBigcommerce",
      fileName: () => "zenobia-pay-bigcommerce.js",
      formats: ["iife"],
    },
    rollupOptions: {
      external: [],
    },
  },
});
