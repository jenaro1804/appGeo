import { defineConfig } from "vitest/config";

// Las pruebas cubren la aritmética del modelo (src/lib), no la interfaz.
export default defineConfig({
  test: { include: ["pruebas/**/*.test.ts"], environment: "node" },
});
