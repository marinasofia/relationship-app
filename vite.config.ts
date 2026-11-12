import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// BASE_PATH lets the same build serve from a GitHub Pages project path.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude],
  },
});
