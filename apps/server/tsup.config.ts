import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts", "src/cli/create-user.ts", "src/cli/import-chapter.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  // Bundle everything into dist/ so production needs no node_modules except
  // the native sqlite binding (and ws's optional native helpers).
  // (noExternal wins over external in tsup, so the exclusions live in the regex)
  noExternal: [/^(?!better-sqlite3|bufferutil|utf-8-validate)/],
  // bundled CommonJS deps still call require()
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  clean: true,
});
