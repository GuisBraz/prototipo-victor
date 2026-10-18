/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { brand } from "./src/config/brand";

/** Injeta nome/descrição da marca no HTML estático a partir de src/config/brand.ts. */
function brandHtml(): Plugin {
  return {
    name: "brand-html",
    transformIndexHtml(html) {
      return html
        .replaceAll("%BRAND_NAME%", brand.name)
        .replaceAll("%BRAND_DESCRIPTION%", brand.description);
    },
  };
}

export default defineConfig({
  plugins: [react(), brandHtml()],
  server: { port: 5174 },
  test: { environment: "jsdom", globals: false },
});
