import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // expose on local network for mobile testing
  },
  build: {
    outDir: "dist",
  },
});
