import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" : the build works at any address (GitHub Pages /au-bar-de-se-soir/, a custom domain later).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // data.json, photos/ and icone.png stay at the repo root (the Manager writes them there through
  // the GitHub API); the deploy workflow copies them next to the built site.
  publicDir: false,
});
