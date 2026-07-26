import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router")
          ) {
            return "react-vendor";
          }

          if (id.includes("@firebase/firestore")) {
            return "firebase-firestore";
          }

          if (id.includes("@firebase/auth")) {
            return "firebase-auth";
          }

          if (id.includes("@firebase/storage")) {
            return "firebase-storage";
          }

          if (
            id.includes("@firebase") ||
            id.includes("firebase")
          ) {
            return "firebase-core";
          }

          if (id.includes("recharts") || id.includes("d3-")) {
            return "chart-vendor";
          }

          if (id.includes("react-icons") || id.includes("lucide-react")) {
            return "icon-vendor";
          }

          return "vendor";
        },
      },
    },
  },
});
