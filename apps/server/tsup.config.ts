import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts", "src/cli/create-user.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  // bundle the workspace package, keep real npm deps external
  noExternal: ["@nt/shared"],
  clean: true,
});
