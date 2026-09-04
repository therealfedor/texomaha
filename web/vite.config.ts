import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://localhost:4173",
      "/socket.io": {
        target: "ws://localhost:4173",
        ws: true
      }
    }
  }
});
